import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Campaign, createCampaign } from '../../store/campaign'
import { device } from '../../store/device'
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
  noteSubdoc,
  renameNote,
  touchNote,
} from '../api'
import { linksIn, parseLink } from '../links'

async function setUp() {
  device.value = { id: 'gm', name: 'Gwen' }
  return Campaign.open(await createCampaign('Barrows', 'Gwen'))
}

describe('notes', () => {
  it('starts with Sessions and World folders, once', async () => {
    const c = await setUp()
    ensureNoteFolders(c)
    ensureNoteFolders(c)
    expect(listNoteFolders(c).map((f) => f.name)).toEqual(['Sessions', 'World'])
    // Deleting a default folder sticks; it isn't made again.
    deleteNoteFolder(c, 'world')
    ensureNoteFolders(c)
    expect(listNoteFolders(c).map((f) => f.name)).toEqual(['Sessions'])
    c.destroy()
  })

  it('creates, renames, files and deletes pages in order', async () => {
    const c = await setUp()
    const a = createNote(c, { title: 'Goblin warren', folder: 'world' })
    const b = createNote(c, { title: 'Session 1', folder: 'sessions' })
    const d = createNote(c, { folder: 'world' })
    expect(listNotes(c).filter((n) => n.folder === 'world').map((n) => n.id)).toEqual([a, d])
    expect(getNote(c, d)?.title).toBe('Untitled')
    renameNote(c, d, '  The Duke ')
    expect(getNote(c, d)?.title).toBe('The Duke')
    moveNote(c, a, undefined)
    expect(getNote(c, a)?.folder).toBeUndefined()
    expect(noteSubdoc(c, b)?.guid).toBe(`${c.id}/note/${b}`)
    deleteNote(c, b)
    expect(getNote(c, b)).toBeUndefined()
    c.destroy()
  })

  it('finds backlinks from the links each page records', async () => {
    const c = await setUp()
    const duke = createNote(c, { title: 'The Duke' })
    const s1 = createNote(c, { title: 'Session 1' })
    touchNote(c, s1, [`note:${duke}`, 'character:ayla'])
    expect(backlinks(c, `note:${duke}`).map((n) => n.id)).toEqual([s1])
    expect(backlinks(c, 'character:ayla').map((n) => n.id)).toEqual([s1])
    expect(backlinks(c, `note:${s1}`)).toEqual([])
    c.destroy()
  })

  it('files a deleted folder’s pages back at the top', async () => {
    const c = await setUp()
    const f = createNoteFolder(c, 'Factions')
    const n = createNote(c, { title: 'Thieves’ guild', folder: f })
    deleteNoteFolder(c, f)
    expect(getNote(c, n)?.folder).toBeUndefined()
    c.destroy()
  })
})

describe('note links', () => {
  it('collects distinct links in document order', () => {
    const link = (kind: string, id: string) => ({ type: 'entityLink', attrs: { kind, id, label: id } })
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text' }, link('note', 'n1'), link('character', 'c1')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [link('note', 'n1'), link('bogus', 'x')] }] }] },
      ],
    }
    expect(linksIn(doc)).toEqual(['note:n1', 'character:c1'])
    expect(parseLink('scene:abc:def')).toEqual({ kind: 'scene', id: 'abc:def' })
  })
})
