import { useSignal } from '@preact/signals'
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
  type NoteFolderView,
  type NoteView,
} from '../notes/api'
import { noteOpened, openNote, openNoteId } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconDelete, IconFolder, IconNotes, IconRename } from '../ui/icons'
import { FolderName } from '../ui/FolderName'
import { createPaneLayout, TwoPane, usePaneLevel } from '../ui/TwoPane'
import { List, ListGroup, ListRow } from '../ui/List'
import { menuTrigger } from '../ui/menuTrigger'
import { openPopup } from '../ui/popup'
import { Dialog } from './CampaignDialogs'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { dragToFolder } from './folderDrag'
import { NoteEditor } from './NoteEditor'

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
  return (
    <TwoPane
      layout={notesLayout}
      level={level.value}
      title={folder?.name ?? 'Notes'}
      backLabel="Back to the notes"
      onBack={() => go('list')}
      resizeLabel="Resize the notes list"
      list={<NoteList campaign={campaign} notes={notes} folders={folders} openId={openId} />}
      detail={open ? <NotePage campaign={campaign} note={open} notes={notes} /> : <p class="empty">Pick a page, or make a new one.</p>}
    />
  )
}

function NoteList({
  campaign,
  notes,
  folders,
  openId,
}: {
  campaign: Campaign
  notes: NoteView[]
  folders: NoteFolderView[]
  openId: string | null
}) {
  const folded = useSignal<Set<string>>(new Set())
  const naming = useSignal<string | null>(null)
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const deleting = useSignal<string | null>(null)
  const known = new Set(folders.map((f) => f.id))
  const loose = notes.filter((n) => !n.folder || !known.has(n.folder))

  const toggle = (id: string) => {
    const next = new Set(folded.value)
    if (!next.delete(id)) next.add(id)
    folded.value = next
  }
  const newPage = (folder?: string) => openNote(createNote(campaign, { folder }))

  const row = (n: NoteView) => {
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = folders
        .filter((f) => f.id !== n.folder)
        .map((f) => ({ label: `Move to ${f.name}`, Icon: IconFolder, onSelect: () => moveNote(campaign, n.id, f.id) }))
      if (n.folder && known.has(n.folder)) items.push({ label: 'Remove from folder', onSelect: () => moveNote(campaign, n.id, undefined) })
      if (items.length) items.push('divider')
      items.push({ label: 'Delete page…', Icon: IconDelete, danger: true, onSelect: () => (deleting.value = n.id) })
      menu.value = { x, y, items }
    })
    return (
      <ListRow
        key={n.id}
        lead={<IconNotes size={18} />}
        name={n.title}
        meta={ago(n.updatedAt)}
        selected={n.id === openId}
        onPick={() => openNote(n.id)}
        pick={{
          onPointerDown: (e) => {
            trigger.onPointerDown(e)
            dragToFolder(e, (folder) => moveNote(campaign, n.id, folder))
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    )
  }

  const folderMenu = (f: NoteFolderView) =>
    menuTrigger((x, y) => {
      menu.value = {
        x,
        y,
        items: [
          { label: 'New page here', Icon: IconNotes, onSelect: () => newPage(f.id) },
          { label: 'Rename folder', Icon: IconRename, onSelect: () => (naming.value = f.id) },
          { label: 'Delete folder', Icon: IconDelete, danger: true, onSelect: () => deleteNoteFolder(campaign, f.id) },
        ],
      }
    })

  const doomed = deleting.value ? notes.find((n) => n.id === deleting.value) : undefined
  return (
    <nav class="notes-list" aria-label="Notes">
      {doomed && <DeletePage campaign={campaign} note={doomed} onClose={() => (deleting.value = null)} />}
      <div class="chars-actions">
        <Button size="sm" onClick={() => newPage()}>
          New page
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (naming.value = 'new')}>
          New folder
        </Button>
      </div>
      <div class="chars-tree panel-scroll" data-folder-drop="">
        {naming.value === 'new' && (
          <FolderName
            onDone={(name) => {
              if (name) createNoteFolder(campaign, name)
              naming.value = null
            }}
          />
        )}
        {folders.map((f) => {
          const kids = notes.filter((n) => n.folder === f.id)
          const trigger = folderMenu(f)
          return (
            <ListGroup
              key={f.id}
              label={f.name}
              lead={<IconFolder size={16} />}
              count={kids.length}
              open={!folded.value.has(f.id)}
              onToggle={() => toggle(f.id)}
              head={{ onPointerDown: trigger.onPointerDown, onContextMenu: trigger.onContextMenu }}
              group={{ 'data-folder-drop': f.id }}
              replaceHead={
                naming.value === f.id ? (
                  <FolderName
                    initial={f.name}
                    onDone={(name) => {
                      if (name) renameNoteFolder(campaign, f.id, name)
                      naming.value = null
                    }}
                  />
                ) : undefined
              }
            >
              <List>{kids.map(row)}</List>
            </ListGroup>
          )
        })}
        <List>{loose.map(row)}</List>
        {!notes.length && <p class="muted chars-empty">No pages yet.</p>}
      </div>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </nav>
  )
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
        <input
          ref={titleRef}
          class="note-title"
          aria-label="Title"
          placeholder="Untitled"
          value={note.title === 'Untitled' ? '' : note.title}
          onChange={(e) => renameNote(campaign, note.id, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
              ;(e.currentTarget.closest('.note-page')?.querySelector('.note-body') as HTMLElement | null)?.focus()
            }
          }}
        />
        <NoteEditor key={note.id} campaign={campaign} noteId={note.id} />
        {linkedFrom.length > 0 && (
          <section class="note-backlinks" aria-label="Linked from">
            <h3 class="eyebrow">Linked from</h3>
            <List>
              {linkedFrom.map((n) => (
                <ListRow key={n.id} lead={<IconNotes size={18} />} name={notes.find((k) => k.id === n.id)?.title ?? n.title} onPick={() => openNote(n.id)} />
              ))}
            </List>
          </section>
        )}
      </div>
    </article>
  )
}

/** Asks before deleting a page: it can't be undone. */
function DeletePage({ campaign, note, onClose }: { campaign: Campaign; note: NoteView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => openPopup(ref.current), [])
  return (
    <Dialog dialogRef={ref} title="Delete page" onClose={onClose}>
      <p>
        Delete <strong>{note.title}</strong>? It's gone for everyone, and links to it stop working. This can't be undone.
      </p>
      <div class="form-actions">
        <Button variant="ghost" onClick={() => ref.current?.close()}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteNote(campaign, note.id)
            ref.current?.close()
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  )
}
