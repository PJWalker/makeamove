import {
  createNote,
  createNoteFolder,
  deleteNote,
  deleteNoteFolder,
  ensureNoteFolders,
  getNote,
  listNoteFolders,
  moveNote,
  renameNote,
  renameNoteFolder,
  revealNote,
  touchNote,
} from "../../features/notes/api";
import type { LinkRef } from "../../features/notes/links";
import { arrayOf, isNothing, isString, objectOf, optional } from "../../data/guards";
import {
  IconDelete,
  IconFolder,
  IconImage,
  IconNotes,
  IconReveal,
  IconSecret,
} from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { folderCommands } from "./folders";
import { command } from "./types";

/* Notes: pages, their folders, and revealing the GM's own pages to the players. */

const isId = objectOf({ id: isString });
const note = (ctx: CampaignContext, id: string) => getNote(ctx.campaign, id);
const exists = (ctx: CampaignContext, { id }: { id: string }) =>
  !!note(ctx, id) || "That page is gone";

const newPageCommand = (gmOnly: boolean) =>
  command<{ folder?: string | undefined }, string>({
    id: gmOnly ? "note.createGmPage" : "note.create",
    params: objectOf({ folder: optional(isString) }),
    title: gmOnly ? "New GM Page" : "New Page",
    icon: gmOnly ? IconSecret : IconNotes,
    // GM-only pages live in the vault, which only a GM device holds.
    ...(gmOnly
      ? {
          permission: "gm" as const,
          available: (ctx: CampaignContext) =>
            !!ctx.campaign.vault.value || "Waiting for the vault",
        }
      : {}),
    offers: () => [{ params: {} }],
    run: (ctx, { folder }) => {
      const id = createNote(ctx.campaign, { ...(folder ? { folder } : {}), gmOnly });
      ctx.links.openNote(id);
      return id;
    },
  });
export const newPage = newPageCommand(false);
export const newGmPage = newPageCommand(true);

export const openPage = command<{ id: string }>({
  id: "note.open",
  params: isId,
  title: "Open Page",
  section: "open",
  transact: false,
  available: exists,
  menu: { note: (_, { id }) => [{ params: { id } }] },
  run: (ctx, { id }) => ctx.links.openNote(id),
});

export const renamePage = command<{ id: string; title: string }>({
  id: "note.rename",
  params: objectOf({ id: isString, title: isString }),
  title: "Rename Page",
  available: exists,
  undoGroup: ({ id }) => `note.rename ${id}`,
  run: ({ campaign }, { id, title }) => renameNote(campaign, id, title),
});

/** That a page was just edited, and what it links to now: bookkeeping alongside its text, not an edit of its own. */
export const notePageEdited = command<{ id: string; links: LinkRef[] }>({
  id: "note.touch",
  params: objectOf({ id: isString, links: arrayOf(isString) as (v: unknown) => v is LinkRef[] }),
  title: "Page Edited",
  undoGroup: false,
  run: ({ campaign }, { id, links }) => touchNote(campaign, id, links),
});

export const filePage = command<{ id: string; folder?: string | undefined }>({
  id: "note.moveToFolder",
  params: objectOf({ id: isString, folder: optional(isString) }),
  title: "Move to Folder",
  icon: IconFolder,
  section: "file",
  available: exists,
  menu: {
    note: (ctx, { id }) => {
      const n = note(ctx, id);
      const folders = listNoteFolders(ctx.campaign);
      return [
        ...folders
          .filter((f) => f.id !== n?.folder)
          .map((f) => ({ params: { id, folder: f.id }, title: `Move to ${f.name}` })),
        ...(n?.folder && folders.some((f) => f.id === n.folder)
          ? [{ params: { id }, title: "Remove from Folder" }]
          : []),
      ];
    },
  },
  run: ({ campaign }, { id, folder }) => moveNote(campaign, id, folder),
});

export const revealPage = command<{ id: string }>({
  id: "note.reveal",
  params: isId,
  title: "Reveal to Players…",
  icon: IconReveal,
  section: "edit",
  permission: "gm",
  available: exists,
  // Players get their own copy, so it can't be hidden again.
  undoGroup: false,
  confirm: (ctx, { id }) => {
    const title = note(ctx, id)?.title || "Untitled";
    return {
      title: "Reveal page",
      body: `Show ${title} to everyone? Players get their own copy, so it can’t be hidden again.`,
      subject: title,
      confirmLabel: "Reveal",
    };
  },
  menu: { note: (ctx, { id }) => (note(ctx, id)?.gmOnly ? [{ params: { id } }] : []) },
  run: ({ campaign }, { id }) => revealNote(campaign, id),
});

export const changePageGraphic = command<{ id: string }>({
  id: "note.changeGraphic",
  params: isId,
  title: "Change Graphic…",
  icon: IconImage,
  section: "edit",
  transact: false,
  // GM-only pages have none.
  available: (ctx, { id }) => !note(ctx, id)?.gmOnly || "GM pages have no graphic",
  menu: { note: (ctx, { id }) => (note(ctx, id)?.gmOnly ? [] : [{ params: { id } }]) },
  run: (ctx, { id }) => ctx.table.editGraphic("note", id, note(ctx, id)?.title ?? ""),
});

export const deletePage = command<{ id: string }>({
  id: "note.delete",
  params: isId,
  title: "Delete Page…",
  icon: IconDelete,
  danger: true,
  section: "delete",
  available: exists,
  // Its text goes from this device too.
  undoGroup: false,
  confirm: (ctx, { id }) => {
    const title = note(ctx, id)?.title || "Untitled";
    return {
      title: "Delete page",
      body: `Delete ${title}? It’s gone for everyone, and links to it stop working. This can’t be undone.`,
      subject: title,
      confirmLabel: "Delete",
      danger: true,
    };
  },
  menu: { note: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => deleteNote(campaign, id),
});

/** The folders a campaign starts with, made once. */
export const ensureDefaultNoteFolders = command({
  id: "noteFolder.ensureDefaults",
  params: isNothing,
  title: "Add Default Folders",
  undoGroup: false,
  run: ({ campaign }) => ensureNoteFolders(campaign),
});

export const noteFolders = folderCommands("note", {
  create: ({ campaign }, name) => createNoteFolder(campaign, name),
  rename: ({ campaign }, id, name) => renameNoteFolder(campaign, id, name),
  remove: ({ campaign }, id) => deleteNoteFolder(campaign, id),
  newHere: [newPage, newGmPage],
});

export const noteCommands = [
  newPage,
  newGmPage,
  openPage,
  renamePage,
  notePageEdited,
  filePage,
  revealPage,
  changePageGraphic,
  deletePage,
  ensureDefaultNoteFolders,
  ...noteFolders.all,
];
