import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as Y from "yjs";
import { IndexeddbPersistence, storeState } from "y-indexeddb";
import { chatDbName } from "../features/chat/chatLog";
import { noteDbName } from "../features/notes/noteDoc";
import { vaultDbName, vaultGuid } from "../features/notes/vault";
import { getBlob } from "../platform/blobs";
import type { FileKind } from "../platform/files";
import { sceneDbName } from "../scene/sceneDoc";
import { campaignDbName } from "./storage";

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

export interface BackupDoc {
  kind: BackupDocKind;
  guid: string;
  update: Uint8Array;
}

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
  docs: BackupDoc[];
  blobs: BackupBlob[];
}

/** Who is backing up or importing: the device, and what it's called. */
export interface BackupDevice {
  id: string;
  name: string;
}

const DB_NAMES: Record<BackupDocKind, (guid: string) => string> = {
  campaign: campaignDbName,
  scene: sceneDbName,
  note: noteDbName,
  chat: chatDbName,
  // The vault's guid is `<campaign>/vault`; its database is named by campaign.
  vault: (guid) => vaultDbName(guid.slice(0, -"/vault".length)),
  "vault-note": noteDbName,
};

/** Whether a document may belong to the campaign, so a file can't write into another one. */
function belongs(campaignId: string, { kind, guid }: { kind: string; guid: string }) {
  if (!(KINDS as readonly string[]).includes(kind)) return false;
  if (kind === "campaign") return guid === campaignId;
  if (kind === "vault") return guid === vaultGuid(campaignId);
  return guid.startsWith(`${campaignId}/`) && guid !== vaultGuid(campaignId);
}

/** The subdocuments a root or vault document lists, by kind. */
export function subdocsOf(kind: BackupDocKind, doc: Y.Doc): { kind: BackupDocKind; doc: Y.Doc }[] {
  const docsIn = (map: Y.Map<Y.Map<unknown>>, as: BackupDocKind) =>
    [...map.values()].flatMap((entry) => {
      const sub = entry.get("doc");
      return sub instanceof Y.Doc ? [{ kind: as, doc: sub }] : [];
    });
  if (kind === "campaign")
    return [
      ...docsIn(doc.getMap("scenes"), "scene"),
      ...docsIn(doc.getMap("notes"), "note"),
      ...doc
        .getArray<Y.Doc>("chat")
        .toArray()
        .map((chunk) => ({ kind: "chat" as const, doc: chunk })),
    ];
  if (kind === "vault") return docsIn(doc.getMap("notes"), "vault-note");
  return [];
}

/** Load a document as this device stored it. The caller destroys it. */
async function readStoredDoc(kind: BackupDocKind, guid: string): Promise<Y.Doc> {
  const doc = new Y.Doc({ guid });
  const p = new IndexeddbPersistence(DB_NAMES[kind](guid), doc);
  await p.whenSynced;
  await p.destroy();
  return doc;
}

const isEmpty = (doc: Y.Doc) => doc.store.clients.size === 0;

const HASH = /^[0-9a-f]{64}$/;

/**
 * Every blob hash a document mentions. Images are referenced in many places
 * (map elements, tokens, entity graphics, note image attributes), so this
 * looks at every stored value rather than knowing each one.
 */
export function blobHashesIn(doc: Y.Doc): Set<string> {
  const found = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      if (HASH.test(v)) found.add(v);
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x);
    } else if (v && typeof v === "object" && !(v instanceof Uint8Array) && !(v instanceof Y.Doc)) {
      for (const x of Object.values(v)) visit(x);
    }
  };
  for (const structs of doc.store.clients.values()) {
    for (const s of structs) {
      if (!(s instanceof Y.Item) || s.deleted) continue;
      const c = s.content;
      if (c instanceof Y.ContentAny || c instanceof Y.ContentJSON) visit(c.arr);
      else if (c instanceof Y.ContentFormat) visit(c.value);
      else if (c instanceof Y.ContentEmbed) visit(c.embed);
    }
  }
  return found;
}

/** One document of a backup, with the images it uses. */
export interface DocSnapshot extends BackupDoc {
  hashes: Set<string>;
}

const snapshotDoc = (kind: BackupDocKind, doc: Y.Doc): DocSnapshot => ({
  kind,
  guid: doc.guid,
  update: Y.encodeStateAsUpdate(doc),
  hashes: blobHashesIn(doc),
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
  reuse: (guid: string) => DocSnapshot | undefined = () => undefined,
): Promise<DocSnapshot[]> {
  const out: DocSnapshot[] = [];
  const visit = async (kind: BackupDocKind, guid: string) => {
    const kept = reuse(guid);
    if (kept) {
      out.push(kept);
      return;
    }
    const doc = await readStoredDoc(kind, guid);
    if (!isEmpty(doc)) out.push(snapshotDoc(kind, doc));
    doc.destroy();
  };
  // A root is always read, to find its subdocuments.
  const walk = async (kind: BackupDocKind, guid: string) => {
    const root = await readStoredDoc(kind, guid);
    if (!isEmpty(root)) out.push(reuse(guid) ?? snapshotDoc(kind, root));
    for (const sub of subdocsOf(kind, root)) await visit(sub.kind, sub.doc.guid);
    return root;
  };

  const root = await walk("campaign", campaignId);
  const member = root.getMap<Y.Map<unknown>>("members").get(device.id);
  root.destroy();
  // Only GM devices have a vault; don't make an empty one on a player's.
  if (((member?.get("role") as string | undefined) ?? role) === "gm")
    (await walk("vault", vaultGuid(campaignId))).destroy();
  return out;
}

/** Read images from the blob store. Ones this device hasn't got yet are left out. */
export async function readBlobs(hashes: Iterable<string>): Promise<BackupBlob[]> {
  const out: BackupBlob[] = [];
  for (const hash of hashes) {
    const blob = await getBlob(hash);
    if (blob) out.push({ hash, type: blob.type, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return out;
}

/** What the campaign's root document says about itself. */
export function metaOf(docs: BackupDoc[], campaignId: string) {
  const doc = new Y.Doc();
  const root = docs.find((d) => d.kind === "campaign" && d.guid === campaignId);
  if (root) Y.applyUpdate(doc, root.update);
  const meta = doc.getMap("meta").toJSON() as Record<string, unknown>;
  doc.destroy();
  return {
    name: typeof meta.name === "string" ? meta.name : "Untitled campaign",
    systemId: typeof meta.systemId === "string" ? meta.systemId : "",
    roomKey: typeof meta.roomKey === "string" ? meta.roomKey : undefined,
    createdAt: typeof meta.createdAt === "number" ? meta.createdAt : undefined,
  };
}

export function assembleBackup(
  campaignId: string,
  device: BackupDevice,
  docs: BackupDoc[],
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
  const e = encoding.createEncoder();
  encoding.writeVarString(e, MAGIC);
  encoding.writeVarUint(e, FORMAT);
  encoding.writeVarString(e, backup.campaignId);
  encoding.writeVarString(e, backup.name);
  encoding.writeVarString(e, backup.systemId);
  encoding.writeVarUint(e, backup.exportedAt);
  encoding.writeVarString(e, backup.exportedBy);
  encoding.writeVarUint(e, backup.docs.length);
  for (const d of backup.docs) {
    encoding.writeVarString(e, d.kind);
    encoding.writeVarString(e, d.guid);
    encoding.writeVarUint8Array(e, d.update);
  }
  encoding.writeVarUint(e, backup.blobs.length);
  for (const b of backup.blobs) {
    encoding.writeVarString(e, b.hash);
    encoding.writeVarString(e, b.type);
    encoding.writeVarUint8Array(e, b.data);
  }
  return pipe(encoding.toUint8Array(e), new CompressionStream("gzip"));
}

export class BackupFileError extends Error {}

export async function decodeBackup(file: Uint8Array): Promise<CampaignBackup> {
  let data: Uint8Array;
  try {
    data = await pipe(file, new DecompressionStream("gzip"));
  } catch {
    throw new BackupFileError("That file isn't a Make a Move campaign.");
  }
  try {
    const d = decoding.createDecoder(data);
    if (decoding.readVarString(d) !== MAGIC) throw new Error();
    const format = decoding.readVarUint(d);
    if (format > FORMAT)
      throw new BackupFileError("That backup is from a newer version of Make a Move.");
    const campaignId = decoding.readVarString(d);
    const name = decoding.readVarString(d);
    const systemId = decoding.readVarString(d);
    const exportedAt = decoding.readVarUint(d);
    const exportedBy = decoding.readVarString(d);
    const docs: BackupDoc[] = [];
    for (let n = decoding.readVarUint(d); n > 0; n--) {
      const kind = decoding.readVarString(d) as BackupDocKind;
      const guid = decoding.readVarString(d);
      const update = decoding.readVarUint8Array(d);
      if (!belongs(campaignId, { kind, guid })) throw new Error();
      docs.push({ kind, guid, update });
    }
    const blobs: BackupBlob[] = [];
    for (let n = decoding.readVarUint(d); n > 0; n--) {
      const hash = decoding.readVarString(d);
      const type = decoding.readVarString(d);
      blobs.push({ hash, type, data: decoding.readVarUint8Array(d) });
    }
    return { campaignId, name, systemId, exportedAt, exportedBy, docs, blobs };
  } catch (e) {
    if (e instanceof BackupFileError) throw e;
    throw new BackupFileError("That campaign file is damaged.");
  }
}

/** A file name for a backup: the campaign's name and the day. */
export function backupFileName(name: string, at = new Date()): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "campaign";
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `${slug}-${day}${BACKUP_FILE.extension}`;
}

// Importing

/**
 * A GM's backup brings the GM role with it: it holds the room key and the
 * vault already. Restoring on a new device (a new device id) makes this
 * device a GM too, under the name the backup was made under.
 */
export function claimGm(root: Y.Doc, device: BackupDevice, exportedBy: string) {
  const members = root.getMap<Y.Map<unknown>>("members");
  const me = members.get(device.id);
  if (me?.get("role") === "gm") return;
  const name = device.name || (members.get(exportedBy)?.get("name") as string | undefined) || "GM";
  root.transact(() => {
    const m = me ?? new Y.Map<unknown>();
    m.set("role", "gm");
    if (!me) {
      m.set("joinedAt", Date.now());
      m.set("name", name);
      members.set(device.id, m);
    }
  });
}

export const isGmBackup = (backup: CampaignBackup) => backup.docs.some((d) => d.kind === "vault");

/** Merge a document into this device's stored copy. */
export async function mergeStoredDoc(doc: BackupDoc, after?: (doc: Y.Doc) => void) {
  const stored = new Y.Doc({ guid: doc.guid });
  const p = new IndexeddbPersistence(DB_NAMES[doc.kind](doc.guid), stored);
  await p.whenSynced;
  Y.applyUpdate(stored, doc.update);
  after?.(stored);
  await storeState(p);
  await p.destroy();
  stored.destroy();
}
