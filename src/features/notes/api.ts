import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { newId } from "../../lib/ids";
import { UNTITLED_FOLDER } from "../../campaign/folders";
import type { Campaign } from "../../campaign/campaign";
import type { NotesIndex } from "../../campaign/schema";
import type { Item } from "../../data/schema";
import type { noteEntry } from "./schema";
import { device } from "../../platform/device";
import { IndexeddbPersistence } from "y-indexeddb";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { NoteDoc, noteDbName, noteGuid } from "./noteDoc";
import Fuse from "fuse.js";
import type { LinkRef } from "./links";
import { NoteTextIndex, type NoteNode, type TextMatch } from "./textIndex";
import { vaultNoteGuid } from "./vault";

/*
 * Notes: pages of rich text filed in folders. The index (titles, folders,
 * order, outgoing links) lives in the campaign root so lists and backlinks
 * need no page loaded; each page's text is its own subdocument (noteDoc.ts).
 *
 * Search reads an index of the text on this device (textIndex.ts).
 *
 * GM-only pages live the same way in the GM vault (vault.ts), which only GM
 * devices have; they share the campaign's folders. Revealing one copies it
 * into the campaign under the same id, so links to it keep working.
 */

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
  return campaign.noteFolders
    .entries()
    .map(([id, f]) => ({ id, name: f.name, order: f.order }))
    .sort(byOrder);
}

/** The page maps this device has: the campaign's, and the vault's on a GM device. */
function noteMaps(campaign: Campaign): { map: NotesIndex; gmOnly: boolean }[] {
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
    .flatMap(({ map, gmOnly }) => map.entries().map(([id, m]) => noteView(id, m, gmOnly)))
    .sort(byOrder);
}

export function getNote(campaign: Campaign, id: string | null | undefined): NoteView | undefined {
  const at = id ? locate(campaign, id) : null;
  return at && id ? noteView(id, at.m, at.gmOnly) : undefined;
}

function noteView(id: string, m: Item<typeof noteEntry>, gmOnly: boolean): NoteView {
  return {
    id,
    title: m.get("title") || "Untitled",
    folder: m.get("folder"),
    order: m.get("order"),
    links: m.get("links"),
    updatedAt: m.get("updatedAt"),
    updatedBy: m.get("updatedBy"),
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
  (gmOnly ? vault!.notes : campaign.notes).set(id, {
    title: title.trim(),
    ...(folder && { folder }),
    order: generateKeyBetween(last, null),
    links: [],
    updatedAt: Date.now(),
    updatedBy: device.value.id,
    doc: new Y.Doc({ guid: guidOf(campaign, id, gmOnly) }),
  });
  return id;
}

/** The page's text subdocument (not yet loaded). */
export function noteSubdoc(campaign: Campaign, id: string): Y.Doc | null {
  const at = locate(campaign, id);
  // Derived from the ids, so peers doing this at once agree.
  return at?.m.subdoc("doc", guidOf(campaign, id, at.gmOnly)) ?? null;
}

const textIndexes = new WeakMap<Campaign, Promise<NoteTextIndex>>();

/** The campaign's note search index on this device, loaded once. */
export function noteTextIndex(campaign: Campaign): Promise<NoteTextIndex> {
  let index = textIndexes.get(campaign);
  if (!index) textIndexes.set(campaign, (index = NoteTextIndex.load(campaign.id)));
  return index;
}

/** Open a page's text, keeping this device's search index in step with it. */
export async function openNotePage(campaign: Campaign, id: string): Promise<NoteDoc | null> {
  const sub = noteSubdoc(campaign, id);
  if (!sub) return null;
  const index = await noteTextIndex(campaign);
  return NoteDoc.open(sub, (body) =>
    index.set(id, yXmlFragmentToProsemirrorJSON(body) as NoteNode),
  );
}

/** Where a search found its text: a page, and the stretch of it that matched. */
export interface NoteMatch {
  note: NoteView;
  from?: number;
  to?: number;
  snippet: string;
}

const titleSearch = { keys: ["title"], includeScore: true, ignoreDiacritics: true, threshold: 0.3 };

/**
 * Search every page's title and text, best first. Text comes from this
 * device's index; a page not in it yet is read once from this device and added.
 */
export async function searchNotes(
  campaign: Campaign,
  query: string,
  cancelled: () => boolean = () => false,
): Promise<NoteMatch[]> {
  if (!query) return [];
  const index = await noteTextIndex(campaign);
  const notes = listNotes(campaign);
  // A GM device's list is only whole once its vault is open.
  if (campaign.vault.value || !campaign.isGm()) index.keepOnly(new Set(notes.map((n) => n.id)));
  for (const note of notes) {
    if (index.has(note.id)) continue;
    const sub = noteSubdoc(campaign, note.id);
    // Open in the editor already, so it's in the index.
    if (!sub || sub.isLoaded) continue;
    const copy = new Y.Doc({ guid: sub.guid });
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- Keep document memory bounded and check cancellation between notes.
    const opened = await NoteDoc.open(copy, (body) =>
      index.set(note.id, yXmlFragmentToProsemirrorJSON(body) as NoteNode),
    );
    opened.destroy();
    if (cancelled()) return [];
  }

  const byId = new Map(notes.map((n) => [n.id, n]));
  const found = new Map<string, { score: number; title?: true; text: TextMatch[] }>();
  for (const { item, score } of new Fuse(notes, titleSearch).search(query))
    found.set(item.id, { score: score ?? 1, title: true, text: [] });
  for (const { id, score, matches } of index.search(query)) {
    if (!byId.has(id)) continue;
    const page = found.get(id);
    if (page) page.text = matches;
    else found.set(id, { score, text: matches });
  }
  return (
    [...found.entries()]
      // Pages named for what was searched first, then the rest, each best first.
      .sort(([, a], [, b]) => Number(!a.title) - Number(!b.title) || a.score - b.score)
      .flatMap(([id, page]) => {
        const note = byId.get(id)!;
        return [
          ...(page.title ? [{ note, snippet: note.title }] : []),
          ...page.text.map((match) => ({ note, ...match })),
        ];
      })
  );
}

export function renameNote(campaign: Campaign, id: string, title: string) {
  locate(campaign, id)?.m.patch({ title: title.trim() });
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
  m.patch({ folder, order: generateKeyBetween(last, null) });
}

export function deleteNote(campaign: Campaign, id: string) {
  const at = locate(campaign, id);
  if (!at) return;
  at.map.delete(id);
  void noteTextIndex(campaign).then((index) => index.delete(id));
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

  campaign.notes.set(id, { ...m.read(), doc: to });
  vault.notes.delete(id);
  indexedDB.deleteDatabase(noteDbName(vaultNoteGuid(campaign.id, id)));
  // Let the stored copy settle before letting go of it.
  setTimeout(() => void save.destroy(), 1000);
}

/** Record that the page was just edited, and what it links to now. */
export function touchNote(campaign: Campaign, id: string, links: LinkRef[]) {
  const m = locate(campaign, id)?.m;
  if (!m) return;
  const before = m.get("links");
  const same = before.length === links.length && before.every((l, i) => l === links[i]);
  m.patch({
    ...(!same && { links }),
    updatedAt: Date.now(),
    updatedBy: device.value.id,
  });
}

/** Pages that link to this one, or to any other target. */
export function backlinks(campaign: Campaign, target: LinkRef): NoteView[] {
  return listNotes(campaign).filter((n) => n.links.includes(target));
}

export function createNoteFolder(campaign: Campaign, name = UNTITLED_FOLDER): string {
  const id = newId();
  const last = listNoteFolders(campaign).at(-1)?.order ?? null;
  campaign.noteFolders.set(id, {
    name: name.trim() || UNTITLED_FOLDER,
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
  vault?.notes.transact(() => {
    for (const m of vault.notes.values()) if (m.get("folder") === id) m.delete("folder");
  });
}
