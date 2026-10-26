import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { newId } from '../lib/ids'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { noteDbName, noteGuid } from './noteDoc'

/*
 * Notes: pages of rich text filed in folders. The index (titles, folders,
 * order, outgoing links) lives in the campaign root so lists and backlinks
 * need no page loaded; each page's text is its own subdocument (noteDoc.ts).
 */

/** What a link in a note points at. */
export type LinkKind = 'note' | 'character' | 'scene' | 'item' | 'move'
/** A link target, as stored: `kind:id`. */
export type LinkRef = `${LinkKind}:${string}`

export interface NoteView {
  id: string
  title: string
  folder?: string
  order: string
  /** What this page links to. */
  links: LinkRef[]
  updatedAt: number
  updatedBy?: string
}

export interface NoteFolderView {
  id: string
  name: string
  order: string
}

/** Every campaign starts with these, under fixed ids so peers never make two. */
export const DEFAULT_NOTE_FOLDERS: NoteFolderView[] = [
  { id: 'sessions', name: 'Sessions', order: 'a0' },
  { id: 'world', name: 'World', order: 'a1' },
]

const byOrder = (a: { order: string }, b: { order: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)

/** Add the default folders, if this campaign has never had them. */
export function ensureNoteFolders(campaign: Campaign) {
  if (campaign.meta.get('noteFoldersMade')) return
  campaign.doc.transact(() => {
    for (const f of DEFAULT_NOTE_FOLDERS) if (!campaign.noteFolders.has(f.id)) campaign.noteFolders.set(f.id, { name: f.name, order: f.order })
    campaign.meta.set('noteFoldersMade', true)
  })
}

export function listNoteFolders(campaign: Campaign): NoteFolderView[] {
  return [...campaign.noteFolders.entries()].map(([id, f]) => ({ id, name: f.name, order: f.order })).sort(byOrder)
}

export function listNotes(campaign: Campaign): NoteView[] {
  return [...campaign.notes.entries()].map(([id, m]) => noteView(id, m)).sort(byOrder)
}

export function getNote(campaign: Campaign, id: string | null | undefined): NoteView | undefined {
  const m = id ? campaign.notes.get(id) : undefined
  return m && id ? noteView(id, m) : undefined
}

function noteView(id: string, m: Y.Map<any>): NoteView {
  return {
    id,
    title: m.get('title') || 'Untitled',
    folder: m.get('folder') ?? undefined,
    order: m.get('order') ?? 'a0',
    links: m.get('links') ?? [],
    updatedAt: m.get('updatedAt') ?? 0,
    updatedBy: m.get('updatedBy') ?? undefined,
  }
}

export function createNote(campaign: Campaign, { title = '', folder }: { title?: string; folder?: string } = {}): string {
  const id = newId()
  const last = listNotes(campaign).filter((n) => n.folder === folder).at(-1)?.order ?? null
  const m = new Y.Map<any>()
  m.set('title', title.trim())
  if (folder) m.set('folder', folder)
  m.set('order', generateKeyBetween(last, null))
  m.set('links', [])
  m.set('updatedAt', Date.now())
  m.set('updatedBy', device.value.id)
  m.set('doc', new Y.Doc({ guid: noteGuid(campaign.id, id) }))
  campaign.notes.set(id, m)
  return id
}

/** The page's text subdocument (not yet loaded). */
export function noteSubdoc(campaign: Campaign, id: string): Y.Doc | null {
  const m = campaign.notes.get(id)
  if (!m) return null
  let doc = m.get('doc')
  if (!(doc instanceof Y.Doc)) {
    // Derived from the ids, so peers doing this at once agree.
    doc = new Y.Doc({ guid: noteGuid(campaign.id, id) })
    m.set('doc', doc)
  }
  return doc
}

export function renameNote(campaign: Campaign, id: string, title: string) {
  const m = campaign.notes.get(id)
  if (m && m.get('title') !== title.trim()) m.set('title', title.trim())
}

/** File a note in a folder, or at the top level. */
export function moveNote(campaign: Campaign, id: string, folder: string | undefined) {
  const m = campaign.notes.get(id)
  if (!m) return
  const last = listNotes(campaign).filter((n) => n.folder === folder && n.id !== id).at(-1)?.order ?? null
  campaign.doc.transact(() => {
    if (folder) m.set('folder', folder)
    else m.delete('folder')
    m.set('order', generateKeyBetween(last, null))
  })
}

export function deleteNote(campaign: Campaign, id: string) {
  campaign.notes.delete(id)
  // This device's copy of the text; peers that have it keep theirs.
  indexedDB.deleteDatabase(noteDbName(noteGuid(campaign.id, id)))
}

/** Record that the page was just edited, and what it links to now. */
export function touchNote(campaign: Campaign, id: string, links: LinkRef[]) {
  const m = campaign.notes.get(id)
  if (!m) return
  const before: LinkRef[] = m.get('links') ?? []
  const same = before.length === links.length && before.every((l, i) => l === links[i])
  campaign.doc.transact(() => {
    if (!same) m.set('links', links)
    m.set('updatedAt', Date.now())
    m.set('updatedBy', device.value.id)
  })
}

/** Pages that link to this one, or to any other target. */
export function backlinks(campaign: Campaign, target: LinkRef): NoteView[] {
  return listNotes(campaign).filter((n) => n.links.includes(target))
}

export function createNoteFolder(campaign: Campaign, name: string): string {
  const id = newId()
  const last = listNoteFolders(campaign).at(-1)?.order ?? null
  campaign.noteFolders.set(id, { name: name.trim() || 'New folder', order: generateKeyBetween(last, null) })
  return id
}

export function renameNoteFolder(campaign: Campaign, id: string, name: string) {
  const f = campaign.noteFolders.get(id)
  if (f && name.trim()) campaign.noteFolders.set(id, { ...f, name: name.trim() })
}

/** Deleting a folder files its pages back at the top. */
export function deleteNoteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.notes.values()) if (m.get('folder') === id) m.delete('folder')
    campaign.noteFolders.delete(id)
  })
}
