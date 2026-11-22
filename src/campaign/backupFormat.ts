import {
  createDecoder,
  readVarString,
  readVarUint,
  readVarUint8Array,
} from "lib0/decoding";
import {
  createEncoder,
  toUint8Array,
  writeVarString,
  writeVarUint,
  writeVarUint8Array,
} from "lib0/encoding";
import {
  Doc,
  Item,
  ContentAny,
  ContentJSON,
  ContentFormat,
  ContentEmbed,
  encodeStateAsUpdate,
  applyUpdate,
} from "yjs";

import { IndexeddbPersistence, storeState } from "y-indexeddb";
import { chatDbName as chatDatabaseName } from "../features/chat/chatLog";
import { noteDbName as noteDatabaseName } from "../features/notes/noteDoc";
import { vaultDbName as vaultDatabaseName, vaultGuid, vaultShape } from "../features/notes/vault";
import { rootOf } from "../data/schema";
import { getBlob } from "../platform/blobs";
import type { FileKind } from "../platform/files";
import { sceneDbName as sceneDatabaseName } from "../scene/sceneDoc";
import { isString } from "../lib/guards";
import { campaignDbName as campaignDatabaseName } from "./storage";
import { campaignShape } from "./schema";

/*
 * Campaign backups: everything this device holds of a campaign in one file.
 * That is the root document, each subdocument it has stored (scenes, note
 * pages, chat chunks), the GM vault and its pages on a GM device, and the
 * images they use. Documents are kept as Yjs updates, so importing merges
 * into whatever is already here rather than replacing it, the same way a
 * peer's changes would arrive.
 *
 * This module does the work, and runs in the backup worker (see
 * backupTasks.ts): it reads documents from IndexedDB, which every open
 * document is saved to as it changes, so it never needs the main thread's.
 *
 * The file is gzipped lib0 encoding:
 *   magic, format version, campaign id, name, system id, exported at, by
 *   docs:  count, then kind, guid, update for each
 *   blobs: count, then hash, mime type, bytes for each
 */

export const BACKUP_FILE: FileKind = {
  description: "Make a Move campaign",
  extension: ".makeamove",
};

const MAGIC = "makeamove-campaign";
const FORMAT = 1;

const KINDS = ["campaign", "scene", "note", "chat", "vault", "vault-note"] as const;
export type BackupDocKind = (typeof KINDS)[number];

export interface BackupDocument {
  kind: BackupDocKind;
  guid: string;
  update: Uint8Array;
}

export type BackupDoc = BackupDocument;

export interface BackupBlob {
  hash: string;
  type: string;
  data: Uint8Array;
}

export interface CampaignBackup {
  campaignId: string;
  name: string;
  systemId: string;
  exportedAt: number;
  /** The device that made it. */
  exportedBy: string;
  docs: BackupDocument[];
  blobs: BackupBlob[];
}

/** Who is backing up or importing: the device, and what it's called. */
export interface BackupDevice {
  id: string;
  name: string;
}

const DB_NAMES: Record<BackupDocKind, (guid: string) => string> = {
  campaign: campaignDatabaseName,
  scene: sceneDatabaseName,
  note: noteDatabaseName,
  chat: chatDatabaseName,
  // The vault's guid is `<campaign>/vault`; its database is named by campaign.
  vault: (guid) => vaultDatabaseName(guid.slice(0, -"/vault".length)),
  "vault-note": noteDatabaseName,
};

/** Whether a document may belong to the campaign, so a file can't write into another one. */
function belongs(campaignId: string, { kind, guid }: { kind: string; guid: string }) {
  if (!(KINDS as readonly string[]).includes(kind)) return false;
  if (kind === "campaign") return guid === campaignId;
  if (kind === "vault") return guid === vaultGuid(campaignId);
  return guid.startsWith(`${campaignId}/`) && guid !== vaultGuid(campaignId);
}

/** The subdocuments a root or vault document lists, by kind. */
export function subdocsOf(kind: BackupDocKind, document: Doc): { kind: BackupDocKind; doc: Doc }[] {
  const docsIn = (entries: { get: (key: "doc") => Doc | undefined }[], as: BackupDocKind) =>
    entries.flatMap((entry) => {
      const sub = entry.get("doc");
      return sub ? [{ kind: as, doc: sub }] : [];
    });
  if (kind === "campaign") {
    const root = rootOf(document, campaignShape);
    return [
      ...docsIn(root.scenes.values(), "scene"),
      ...docsIn(root.notes.values(), "note"),
      ...root.chat.toArray().map((chunk) => ({ kind: "chat" as const, doc: chunk })),
    ];
  }
  if (kind === "vault") return docsIn(rootOf(document, vaultShape).notes.values(), "vault-note");
  return [];
}

/** Load a document as this device stored it. The caller destroys it. */
async function readStoredDocument(kind: BackupDocKind, guid: string): Promise<Doc> {
  const document = new Doc({ guid });
  const p = new IndexeddbPersistence(DB_NAMES[kind](guid), document);
  await p.whenSynced;
  await p.destroy();
  return document;
}

const isEmpty = (document: Doc) => document.store.clients.size === 0;

const HASH = /^[\da-f]{64}$/;

/**
 * Every blob hash a document mentions. Images are referenced in many places
 * (map elements, tokens, entity graphics, note image attributes), so this
 * looks at every stored value rather than knowing each one.
 */
export function blobHashesIn(document: Doc): Set<string> {
  const found = new Set<string>();
  const visit = (v: unknown) => {
    if (isString(v)) {
      if (HASH.test(v)) found.add(v);
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x);
    } else if (v && typeof v === "object" && !(v instanceof Uint8Array) && !(v instanceof Doc)) {
      for (const x of Object.values(v)) visit(x);
    }
  };
  for (const structs of document.store.clients.values()) {
    for (const s of structs) {
      if (!(s instanceof Item) || s.deleted) continue;
      const c = s.content;
      if (c instanceof ContentAny || c instanceof ContentJSON) visit(c.arr);
      else if (c instanceof ContentFormat) visit(c.value);
      else if (c instanceof ContentEmbed) visit(c.embed);
    }
  }
  return found;
}

/** One document of a backup, with the images it uses. */
export interface DocumentSnapshot extends BackupDocument {
  hashes: Set<string>;
}

export type DocSnapshot = DocumentSnapshot;

const snapshotDocument = (kind: BackupDocKind, document: Doc): DocumentSnapshot => ({
  kind,
  guid: document.guid,
  update: encodeStateAsUpdate(document),
  hashes: blobHashesIn(document),
});

/**
 * Snapshot every document of a campaign this device has stored. `reuse`
 * returns snapshots still known to be current, so a repeated backup only
 * re-reads what changed. The vault is read only if `device` is a GM, by the
 * campaign's member list or else by `role`.
 */
export async function snapshotCampaign(
  campaignId: string,
  device: BackupDevice,
  role: string | undefined,
  reuse: (guid: string) => DocumentSnapshot | undefined = () => {},
): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  const visit = async (kind: BackupDocKind, guid: string): Promise<DocumentSnapshot | undefined> => {
    const kept = reuse(guid);
    if (kept) return kept;
    const document = await readStoredDocument(kind, guid);
    const snapshot = isEmpty(document) ? undefined : snapshotDocument(kind, document);
    document.destroy();
    return snapshot;
  };
  // A root is always read, to find its subdocuments.
  const walk = async (kind: BackupDocKind, guid: string) => {
    const root = await readStoredDocument(kind, guid);
    if (!isEmpty(root)) out.push(reuse(guid) ?? snapshotDocument(kind, root));
    const subdocs = await Promise.all(
      subdocsOf(kind, root).map((sub) => visit(sub.kind, sub.doc.guid)),
    );
    out.push(...subdocs.filter((document) => document !== undefined));
    return root;
  };

  const root = await walk("campaign", campaignId);
  const memberRole = rootOf(root, campaignShape).members.get(device.id)?.get("role");
  root.destroy();
  // Only GM devices have a vault; don't make an empty one on a player's.
  if ((memberRole ?? role) === "gm") {
    const vault = await walk("vault", vaultGuid(campaignId));
    vault.destroy();
  }
  return out;
}

/** Read images from the blob store. Ones this device hasn't got yet are left out. */
export async function readBlobs(hashes: Iterable<string>): Promise<BackupBlob[]> {
  const blobs = await Promise.all(
    [...hashes].map(async (hash): Promise<BackupBlob | null> => {
      const blob = await getBlob(hash);
      return blob
        ? { hash, type: blob.type, data: new Uint8Array(await blob.arrayBuffer()) }
        : null;
    }),
  );
  return blobs.filter((blob) => blob !== null);
}

/** What the campaign's root document says about itself. */
export function metaOf(docs: BackupDocument[], campaignId: string) {
  const document = new Doc();
  const root = docs.find((d) => d.kind === "campaign" && d.guid === campaignId);
  if (root) applyUpdate(document, root.update);
  const {meta} = rootOf(document, campaignShape);
  const out = {
    name: meta.get("name") ?? "Untitled campaign",
    systemId: meta.get("systemId") ?? "",
    roomKey: meta.get("roomKey"),
    createdAt: meta.get("createdAt"),
  };
  document.destroy();
  return out;
}

export function assembleBackup(
  campaignId: string,
  device: BackupDevice,
  docs: BackupDocument[],
  blobs: BackupBlob[],
): CampaignBackup {
  const { name, systemId } = metaOf(docs, campaignId);
  return {
    campaignId,
    name,
    systemId,
    exportedAt: Date.now(),
    exportedBy: device.id,
    docs: docs.map(({ kind, guid, update }) => ({ kind, guid, update })),
    blobs,
  };
}

// The file

async function pipe(data: Uint8Array, through: CompressionStream | DecompressionStream) {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeBackup(backup: CampaignBackup): Promise<Uint8Array> {
  const e = createEncoder();
  writeVarString(e, MAGIC);
  writeVarUint(e, FORMAT);
  writeVarString(e, backup.campaignId);
  writeVarString(e, backup.name);
  writeVarString(e, backup.systemId);
  writeVarUint(e, backup.exportedAt);
  writeVarString(e, backup.exportedBy);
  writeVarUint(e, backup.docs.length);
  for (const d of backup.docs) {
    writeVarString(e, d.kind);
    writeVarString(e, d.guid);
    writeVarUint8Array(e, d.update);
  }
  writeVarUint(e, backup.blobs.length);
  for (const b of backup.blobs) {
    writeVarString(e, b.hash);
    writeVarString(e, b.type);
    writeVarUint8Array(e, b.data);
  }
  return pipe(toUint8Array(e), new CompressionStream("gzip"));
}

export class BackupFileError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BackupFileError';
	}
}

export async function decodeBackup(file: Uint8Array): Promise<CampaignBackup> {
  let data: Uint8Array;
  try {
    data = await pipe(file, new DecompressionStream("gzip"));
  } catch {
    throw new BackupFileError("That file isn't a Make a Move campaign.");
  }
  try {
    const d = createDecoder(data);
    if (readVarString(d) !== MAGIC) throw new Error();
    const format = readVarUint(d);
    if (format > FORMAT)
      throw new BackupFileError("That backup is from a newer version of Make a Move.");
    const campaignId = readVarString(d);
    const name = readVarString(d);
    const systemId = readVarString(d);
    const exportedAt = readVarUint(d);
    const exportedBy = readVarString(d);
    const docs: BackupDocument[] = [];
    for (let n = readVarUint(d); n > 0; n--) {
      const kind = readVarString(d) as BackupDocKind;
      const guid = readVarString(d);
      const update = readVarUint8Array(d);
      if (!belongs(campaignId, { kind, guid })) throw new Error();
      docs.push({ kind, guid, update });
    }
    const blobs: BackupBlob[] = [];
    for (let n = readVarUint(d); n > 0; n--) {
      const hash = readVarString(d);
      const type = readVarString(d);
      blobs.push({ hash, type, data: readVarUint8Array(d) });
    }
    return { campaignId, name, systemId, exportedAt, exportedBy, docs, blobs };
  } catch (error) {
    if (error instanceof BackupFileError) throw error;
    throw new BackupFileError("That campaign file is damaged.");
  }
}

/** A file name for a backup: the campaign's name and the da */
export function backupFileName(name: string, at = new Date()): string {
  const slug =
    name
      .normalize("NFKD")
      .replaceAll(/[^\s\w-]/g, "")
      .trim()
      .replaceAll(/\s+/g, "-")
      .toLowerCase() || "campaign";
  const [day] = at.toISOString().split("T");
  return `${slug}-${day}${BACKUP_FILE.extension}`;
}

// Importing

/**
 * A GM's backup brings the GM role with it: it holds the room key and the
 * vault alread Restoring on a new device (a new device id) makes this
 * device a GM too, under the name the backup was made under.
 */
export function claimGm(root: Doc, device: BackupDevice, exportedBy: string) {
  const { members } = rootOf(root, campaignShape);
  const me = members.get(device.id);
  if (me?.get("role") === "gm") return;
  const name = device.name || (members.get(exportedBy)?.get("name") ?? "GM");
  if (me) me.set("role", "gm");
  else members.set(device.id, { role: "gm", joinedAt: Date.now(), name });
}

export const isGmBackup = (backup: CampaignBackup) => backup.docs.some((d) => d.kind === "vault");

/** Merge a document into this device's stored cop */
export async function mergeStoredDoc(document: BackupDocument, after?: (document_: Doc) => void) {
  const stored = new Doc({ guid: document.guid });
  const p = new IndexeddbPersistence(DB_NAMES[document.kind](document.guid), stored);
  await p.whenSynced;
  applyUpdate(stored, document.update);
  after?.(stored);
  await storeState(p);
  await p.destroy();
  stored.destroy();
}
