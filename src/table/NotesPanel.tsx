import { signal, useSignal } from '@preact/signals'
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import {
  backlinks,
  createNote,
  createNoteFolder,
  deleteNote,
  deleteNoteFolder,
  ensureNoteFolders,
  getNote,
  listNoteFolders,
  listNotes,
  moveNote,
  renameNote,
  renameNoteFolder,
  revealNote,
  type NoteFolderView,
  type NoteView,
} from '../notes/api'
import { noteOpened, openNote, openNoteId } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import {
  IconDelete,
  IconFolder,
  IconImage,
  IconNotes,
  IconRename,
  IconReveal,
  IconSecret,
} from "../ui/icons";
import { morphOpen } from "../ui/morph";
import { createPaneLayout, TwoPane, usePaneLevel } from '../ui/TwoPane'
import { List, ListRow } from "../ui/List";
import { menuTrigger } from '../ui/menuTrigger'
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type MenuItem } from './ContextMenu'
import { dragEntity, entity } from "./entityDrag";
import { editEntityGraphic } from "./GraphicDialogs";
import { NoteEditor } from './NoteEditor'
import { FolderTree } from "./FolderTree";

/** How long ago, roughly, for a page's last edit. */
function ago(at: number) {
  if (!at) return ''
  const s = (Date.now() - at) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Side by side or one at a time (ui/TwoPane.tsx). */
export const notesLayout = createPaneLayout('notesList', { list: 'list', detail: 'page' })

/**
 * Notes: pages filed in folders (Sessions and World to start with), written
 * together. The list and the open page sit side by side, or take turns.
 */
export function NotesPanel({ campaign }: { campaign: Campaign }) {
  // GM-only pages, on a GM device; watched too, so the list keeps up with them.
  const vault = campaign.vault.value
  useY(vault?.notes, () => null)
  const notes = useY(campaign.notes, () => listNotes(campaign))
  const folders = useY(campaign.noteFolders, () => listNoteFolders(campaign))
  // After useY, so it is already watching when the folders appear.
  useEffect(() => ensureNoteFolders(campaign), [campaign])
  const openId = openNoteId.value
  const open = openId ? notes.find((n) => n.id === openId) : undefined
  const { level, go } = usePaneLevel(notesLayout, open ? 'detail' : 'list')

  // Asked to open a page (from the list, a link or elsewhere): show it.
  const requests = noteOpened.value
  const seen = useRef(requests)
  useEffect(() => {
    if (requests !== seen.current && openNoteId.peek()) go('detail')
    seen.current = requests
  }, [requests])
  // The open page was deleted: back to the list.
  useEffect(() => {
    if (openId && !open && !campaign.notes.has(openId)) {
      openNoteId.value = null
      go('list')
    }
  }, [openId, open])

  const folder = folders.find((f) => f.id === open?.folder)
  const revealingNote = revealing.value ? notes.find((n) => n.id === revealing.value) : undefined
  return (
    <TwoPane
      layout={notesLayout}
      level={level.value}
      title={folder?.name ?? 'Notes'}
      backLabel="Back to the notes"
      onBack={() => go('list')}
      resizeLabel="Resize the notes list"
      list={<NoteList campaign={campaign} notes={notes} folders={folders} openId={openId} />}
      detail={
        <>
          {open ? <NotePage campaign={campaign} note={open} notes={notes} /> : <p class="empty">Pick a page, or make a new one.</p>}
          {revealingNote && <RevealPage campaign={campaign} note={revealingNote} onClose={() => (revealing.value = null)} />}
        </>
      }
    />
  )
}

function NoteList({
  campaign,
  notes,
  folders,
  openId,
}: {
  campaign: Campaign;
  notes: NoteView[];
  folders: NoteFolderView[];
  openId: string | null;
}) {
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const deleting = useSignal<string | null>(null);
  const known = new Set(folders.map((f) => f.id));
  const isGm = !!campaign.vault.value;
  const newPage = (folder?: string, gmOnly = false) =>
    openNote(createNote(campaign, { folder, gmOnly }));

  const row = (n: NoteView) => {
    const dragged = entity(campaign, "note", n.id, n.title);
    dragged.folder = (folderId) => moveNote(campaign, n.id, folderId);
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = folders
        .filter((f) => f.id !== n.folder)
        .map((f) => ({
          label: `Move to ${f.name}`,
          Icon: IconFolder,
          onSelect: () => moveNote(campaign, n.id, f.id),
        }));
      items.unshift({ label: "Open page", onSelect: () => openNote(n.id) });
      if (n.folder && known.has(n.folder))
        items.push({
          label: "Remove from folder",
          onSelect: () => moveNote(campaign, n.id, undefined),
        });
      if (items.length) items.push("divider");
      if (n.gmOnly)
        items.push({
          label: "Reveal to players…",
          Icon: IconReveal,
          onSelect: () => (revealing.value = n.id),
        });
      else
        items.push({
          label: "Change graphic…",
          Icon: IconImage,
          onSelect: () => editEntityGraphic(campaign, "note", n.id, n.title),
        });
      items.push({
        label: "Delete page…",
        Icon: IconDelete,
        danger: true,
        onSelect: () => (deleting.value = n.id),
      });
      menu.value = { x, y, items };
    });
    return (
      <ListRow
        key={n.id}
        lead={n.gmOnly ? <IconSecret size={22} /> : <IconNotes size={22} />}
        name={n.title}
        tag={n.gmOnly ? "GM" : null}
        meta={ago(n.updatedAt)}
        selected={n.id === openId}
        onPick={() => openNote(n.id)}
        pick={{
          onPointerDown: (e) => {
            trigger.onPointerDown(e);
            dragEntity(e, dragged);
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    );
  };

  const doomed = deleting.value
    ? notes.find((n) => n.id === deleting.value)
    : undefined;
  return (
    <>
      {doomed && (
        <DeletePage
          campaign={campaign}
          note={doomed}
          onClose={() => (deleting.value = null)}
        />
      )}
      <FolderTree
        ariaLabel="Notes"
        className="notes-list"
        folders={folders}
        items={notes}
        folderOf={(note) => note.folder}
        renderItem={row}
        renderActions={(beginFolderNaming) => (
          <>
            <Button size="sm" onClick={() => newPage()}>
              New page
            </Button>
            {isGm && (
              <Button
                size="sm"
                variant="ghost"
                title="Only you can see it, until you reveal it"
                onClick={() => newPage(undefined, true)}
              >
                New GM page
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={beginFolderNaming}>
              New folder
            </Button>
          </>
        )}
        folderMenuItems={(folder, { open, toggle, rename }) => [
          {
            label: open ? "Collapse folder" : "Expand folder",
            onSelect: toggle,
          },
          "divider",
          {
            label: "New page here",
            Icon: IconNotes,
            onSelect: () => newPage(folder.id),
          },
          ...(isGm
            ? [
                {
                  label: "New GM page here",
                  Icon: IconSecret,
                  onSelect: () => newPage(folder.id, true),
                },
              ]
            : []),
          { label: "Rename folder", Icon: IconRename, onSelect: rename },
          {
            label: "Delete folder",
            Icon: IconDelete,
            danger: true,
            onSelect: () => deleteNoteFolder(campaign, folder.id),
          },
        ]}
        onCreateFolder={(name) => createNoteFolder(campaign, name)}
        onRenameFolder={(id, name) => renameNoteFolder(campaign, id, name)}
        emptyContent={
          !notes.length ? <p class="empty-inline">No pages yet.</p> : null
        }
      />
      {menu.value && (
        <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />
      )}
    </>
  );
}

function NotePage({ campaign, note, notes }: { campaign: Campaign; note: NoteView; notes: NoteView[] }) {
  const linkedFrom = backlinks(campaign, `note:${note.id}`)
  const titleRef = useRef<HTMLInputElement>(null)
  // A brand-new page starts with its title ready to type.
  useLayoutEffect(() => {
    if (!getNote(campaign, note.id)?.title || note.title === 'Untitled') titleRef.current?.focus()
  }, [note.id])

  return (
    <article class="note-page" aria-label={note.title}>
      <div class="panel-scroll note-scroll">
        {note.gmOnly && (
          <p class="note-secret bevel">
            <IconSecret size={22} />
            <span>Only you can see this page.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e: MouseEvent) =>
                morphOpen(
                  e.currentTarget as Element,
                  () => (revealing.value = note.id),
                )
              }
            >
              Reveal to players…
            </Button>
          </p>
        )}
        <input
          ref={titleRef}
          class="note-title"
          aria-label="Title"
          placeholder="Untitled"
          value={note.title === "Untitled" ? "" : note.title}
          onChange={(e) => renameNote(campaign, note.id, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
              (
                e.currentTarget
                  .closest(".note-page")
                  ?.querySelector(".note-body") as HTMLElement | null
              )?.focus();
            }
          }}
        />
        <NoteEditor key={note.id} campaign={campaign} noteId={note.id} />
        {linkedFrom.length > 0 && (
          <section class="note-backlinks" aria-label="Linked from">
            <h3 class="eyebrow">Linked from</h3>
            <List>
              {linkedFrom.map((n) => (
                <ListRow
                  key={n.id}
                  lead={<IconNotes size={22} />}
                  name={notes.find((k) => k.id === n.id)?.title ?? n.title}
                  onPick={() => openNote(n.id)}
                />
              ))}
            </List>
          </section>
        )}
      </div>
    </article>
  );
}

/** A page waiting for the GM to confirm revealing it. */
const revealing = signal<string | null>(null)

/** Asks before revealing a GM-only page: players keep it once they have it. */
function RevealPage({
  campaign,
  note,
  onClose,
}: {
  campaign: Campaign;
  note: NoteView;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Reveal page"
      confirmLabel="Reveal"
      confirmVariant="primary"
      onClose={onClose}
      onConfirm={() => void revealNote(campaign, note.id)}
    >
      <p>
        Show <strong>{note.title}</strong> to everyone? Players get their own
        copy, so it can't be hidden again.
      </p>
    </ConfirmDialog>
  );
}

/** Asks before deleting a page: it can't be undone. */
function DeletePage({
  campaign,
  note,
  onClose,
}: {
  campaign: Campaign;
  note: NoteView;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Delete page"
      confirmLabel="Delete"
      confirmVariant="danger"
      onClose={onClose}
      onConfirm={() => deleteNote(campaign, note.id)}
    >
      <p>
        Delete <strong>{note.title}</strong>? It's gone for everyone, and links
        to it stop working. This can't be undone.
      </p>
    </ConfirmDialog>
  );
}
