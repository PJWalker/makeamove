import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { newId } from "../../lib/ids";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import { IndexeddbPersistence } from "y-indexeddb";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { NoteDoc, noteDbName, noteGuid } from "./noteDoc";
import { LINK_NODE } from "./links";
import { vaultNoteGuid } from "./vault";

/*
 * Notes: pages of rich text filed in folders. The index (titles, folders,
 * order, outgoing links) lives in the campaign root so lists and backlinks
 * need no page loaded; each page's text is its own subdocument (noteDoc.ts).
 *
 * GM-only pages live the same way in the GM vault (vault.ts), which only GM
 * devices have; they share the campaign's folders. Revealing one copies it
 * into the campaign under the same id, so links to it keep working.
 */

/** What a link in a note points at. */
export type LinkKind = "note" | "character" | "scene" | "item" | "move";
/** A link target, as stored: `kind:id`. */
export type LinkRef = `${LinkKind}:${string}`;

export interface NoteView {
  id: string;
  title: string;
  folder?: string | undefined;
  order: string;
  /** What this page links to. */
  links: LinkRef[];
  updatedAt: number;
  updatedBy?: string | undefined;
  /** In the GM vault: only GM devices have it. */
  gmOnly: boolean;
}

export interface NoteFolderView {
  id: string;
  name: string;
  order: string;
}

/** Every campaign starts with these, under fixed ids so peers never make two. */
export const DEFAULT_NOTE_FOLDERS: NoteFolderView[] = [
  { id: "sessions", name: "Sessions", order: "a0" },
  { id: "world", name: "World", order: "a1" },
];

const byOrder = (a: { order: string }, b: { order: string }) =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

/** Add the default folders, if this campaign has never had them. */
export function ensureNoteFolders(campaign: Campaign) {
  if (campaign.meta.get("noteFoldersMade")) return;
  campaign.doc.transact(() => {
    for (const f of DEFAULT_NOTE_FOLDERS)
      if (!campaign.noteFolders.has(f.id))
        campaign.noteFolders.set(f.id, { name: f.name, order: f.order });
    campaign.meta.set("noteFoldersMade", true);
  });
}

export function listNoteFolders(campaign: Campaign): NoteFolderView[] {
  return [...campaign.noteFolders.entries()]
    .map(([id, f]) => ({ id, name: f.name, order: f.order }))
    .sort(byOrder);
}

/** The page maps this device has: the campaign's, and the vault's on a GM device. */
function noteMaps(campaign: Campaign): { map: Y.Map<Y.Map<unknown>>; gmOnly: boolean }[] {
  const vault = campaign.vault.value;
  return [
    { map: campaign.notes, gmOnly: false },
    ...(vault ? [{ map: vault.notes, gmOnly: true }] : []),
  ];
}

/** Where a page is kept, if this device has it. */
function locate(campaign: Campaign, id: string) {
  for (const { map, gmOnly } of noteMaps(campaign)) {
    const m = map.get(id);
    if (m) return { map, m, gmOnly };
  }
  return null;
}

const guidOf = (campaign: Campaign, id: string, gmOnly: boolean) =>
  gmOnly ? vaultNoteGuid(campaign.id, id) : noteGuid(campaign.id, id);

export function listNotes(campaign: Campaign): NoteView[] {
  return noteMaps(campaign)
    .flatMap(({ map, gmOnly }) => [...map.entries()].map(([id, m]) => noteView(id, m, gmOnly)))
    .sort(byOrder);
}

export function getNote(campaign: Campaign, id: string | null | undefined): NoteView | undefined {
  const at = id ? locate(campaign, id) : null;
  return at && id ? noteView(id, at.m, at.gmOnly) : undefined;
}

function noteView(id: string, m: Y.Map<unknown>, gmOnly: boolean): NoteView {
  return {
    id,
    title: (m.get("title") as string | undefined) || "Untitled",
    folder: m.get("folder") as string | undefined,
    order: (m.get("order") as string | undefined) ?? "a0",
    links: (m.get("links") as LinkRef[] | undefined) ?? [],
    updatedAt: (m.get("updatedAt") as number | undefined) ?? 0,
    updatedBy: m.get("updatedBy") as string | undefined,
    gmOnly,
  };
}

/** A new page; a GM-only one goes in the vault, so it needs a GM device. */
export function createNote(
  campaign: Campaign,
  {
    title = "",
    folder,
    gmOnly = false,
  }: { title?: string; folder?: string; gmOnly?: boolean } = {},
): string {
  const vault = campaign.vault.value;
  if (gmOnly && !vault) throw new Error("Only a GM device can make GM-only pages");
  const id = newId();
  const last =
    listNotes(campaign)
      .filter((n) => n.folder === folder)
      .at(-1)?.order ?? null;
  const m = new Y.Map<unknown>();
  m.set("title", title.trim());
  if (folder) m.set("folder", folder);
  m.set("order", generateKeyBetween(last, null));
  m.set("links", []);
  m.set("updatedAt", Date.now());
  m.set("updatedBy", device.value.id);
  m.set("doc", new Y.Doc({ guid: guidOf(campaign, id, gmOnly) }));
  (gmOnly ? vault!.notes : campaign.notes).set(id, m);
  return id;
}

/** The page's text subdocument (not yet loaded). */
export function noteSubdoc(campaign: Campaign, id: string): Y.Doc | null {
  const at = locate(campaign, id);
  if (!at) return null;
  const doc = at.m.get("doc");
  if (doc instanceof Y.Doc) return doc;
  // Derived from the ids, so peers doing this at once agree.
  const created = new Y.Doc({ guid: guidOf(campaign, id, at.gmOnly) });
  at.m.set("doc", created);
  return created;
}

export interface NoteTextMatch {
  from: number;
  to: number;
  snippet: string;
}

type TextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TextNode[];
};
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** Search a page's rich text and return editor positions for every occurrence. */
export async function searchNote(campaign: Campaign, id: string, query: string) {
  const sub = noteSubdoc(campaign, id);
  if (!sub || !query) return [] as NoteTextMatch[];
  const searchDoc = sub.isLoaded ? null : new Y.Doc({ guid: sub.guid });
  const page = searchDoc ? await NoteDoc.open(searchDoc) : null;
  try {
    if (searchDoc) Y.applyUpdate(searchDoc, Y.encodeStateAsUpdate(sub));
    const root = yXmlFragmentToProsemirrorJSON(
      (searchDoc ?? sub).getXmlFragment("body"),
    ) as TextNode;
    let text = "";
    const positions: number[] = [];
    let textBlocks = 0;
    const append = (value: string, position: number) => {
      text += value;
      for (let offset = 0; offset < value.length; offset++) positions.push(position + offset);
    };
    const walk = (node: TextNode, position: number): number => {
      if (node.type === "text") {
        append(node.text ?? "", position);
        return node.text?.length ?? 0;
      }
      if (node.type === LINK_NODE) {
        const label = node.attrs?.text || node.attrs?.label || node.attrs?.id;
        if (typeof label === "string" && label) append(`@${label}`, position);
        return 1;
      }
      if (node.type === "doc") {
        let next = position;
        for (const child of node.content ?? []) next += walk(child, next);
        return next - position;
      }
      if (node.type && TEXT_BLOCKS.has(node.type)) {
        if (textBlocks++) {
          text += "\n";
          positions.push(-1);
        }
      }
      const children = node.content ?? [];
      if (!children.length) return 1;
      let next = position + 1;
      for (const child of children) next += walk(child, next);
      return next - position + 1;
    };
    walk(root, 0);

    const normalized = query.toLowerCase();
    const matches: NoteTextMatch[] = [];
    let offset = 0;
    while ((offset = text.toLowerCase().indexOf(normalized, offset)) !== -1) {
      const from = positions[offset];
      const last = positions[offset + query.length - 1];
      if (from !== undefined && from >= 0 && last !== undefined && last >= 0) {
        const start = Math.max(0, offset - 42);
        const end = Math.min(text.length, offset + query.length + 42);
        matches.push({
          from,
          to: last + 1,
          snippet: `${start ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`,
        });
      }
      offset += Math.max(1, query.length);
    }
    return matches;
  } finally {
    page?.destroy();
  }
}

export function renameNote(campaign: Campaign, id: string, title: string) {
  const m = locate(campaign, id)?.m;
  if (m && m.get("title") !== title.trim()) m.set("title", title.trim());
}

/** File a note in a folder, or at the top level. */
export function moveNote(campaign: Campaign, id: string, folder: string | undefined) {
  const at = locate(campaign, id);
  if (!at) return;
  const { m } = at;
  const last =
    listNotes(campaign)
      .filter((n) => n.folder === folder && n.id !== id)
      .at(-1)?.order ?? null;
  m.doc!.transact(() => {
    if (folder) m.set("folder", folder);
    else m.delete("folder");
    m.set("order", generateKeyBetween(last, null));
  });
}

export function deleteNote(campaign: Campaign, id: string) {
  const at = locate(campaign, id);
  if (!at) return;
  at.map.delete(id);
  // This device's copy of the text; peers that have it keep theirs.
  indexedDB.deleteDatabase(noteDbName(guidOf(campaign, id, at.gmOnly)));
}

/**
 * Show a GM-only page to everyone: copy its entry and text from the vault
 * into the campaign, under the same id, then drop the vault copy. It can't
 * be taken back from players once they have it.
 */
export async function revealNote(campaign: Campaign, id: string) {
  const vault = campaign.vault.value;
  const m = vault?.notes.get(id);
  if (!vault || !m) return;
  // The text as stored (the editor saves every change as it's made).
  const from = new Y.Doc();
  const read = new IndexeddbPersistence(noteDbName(vaultNoteGuid(campaign.id, id)), from);
  await read.whenSynced;
  const text = Y.encodeStateAsUpdate(from);
  void read.destroy();
  from.destroy();

  // Saved first, then filled, so the copy is kept even before anyone opens it.
  const to = new Y.Doc({ guid: noteGuid(campaign.id, id) });
  const save = new IndexeddbPersistence(noteDbName(to.guid), to);
  await save.whenSynced;
  Y.applyUpdate(to, text);

  const shared = new Y.Map<unknown>();
  for (const key of ["title", "folder", "order", "links", "updatedAt", "updatedBy"]) {
    const v = m.get(key);
    if (v !== undefined) shared.set(key, v);
  }
  shared.set("doc", to);
  campaign.notes.set(id, shared);
  vault.notes.delete(id);
  indexedDB.deleteDatabase(noteDbName(vaultNoteGuid(campaign.id, id)));
  // Let the stored copy settle before letting go of it.
  setTimeout(() => void save.destroy(), 1000);
}

/** Record that the page was just edited, and what it links to now. */
export function touchNote(campaign: Campaign, id: string, links: LinkRef[]) {
  const m = locate(campaign, id)?.m;
  if (!m) return;
  const before = (m.get("links") as LinkRef[] | undefined) ?? [];
  const same = before.length === links.length && before.every((l, i) => l === links[i]);
  m.doc!.transact(() => {
    if (!same) m.set("links", links);
    m.set("updatedAt", Date.now());
    m.set("updatedBy", device.value.id);
  });
}

/** Pages that link to this one, or to any other target. */
export function backlinks(campaign: Campaign, target: LinkRef): NoteView[] {
  return listNotes(campaign).filter((n) => n.links.includes(target));
}

export function createNoteFolder(campaign: Campaign, name: string): string {
  const id = newId();
  const last = listNoteFolders(campaign).at(-1)?.order ?? null;
  campaign.noteFolders.set(id, {
    name: name.trim() || "New folder",
    order: generateKeyBetween(last, null),
  });
  return id;
}

export function renameNoteFolder(campaign: Campaign, id: string, name: string) {
  const f = campaign.noteFolders.get(id);
  if (f && name.trim()) campaign.noteFolders.set(id, { ...f, name: name.trim() });
}

/** Deleting a folder files its pages back at the top. */
export function deleteNoteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.notes.values()) if (m.get("folder") === id) m.delete("folder");
    campaign.noteFolders.delete(id);
  });
  const vault = campaign.vault.value;
  vault?.doc.transact(() => {
    for (const m of vault.notes.values()) if (m.get("folder") === id) m.delete("folder");
  });
}
