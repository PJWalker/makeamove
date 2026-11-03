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
  revealNote,
  touchNote,
} from '../api'
import { NoteDoc } from '../noteDoc'
import * as Y from 'yjs'
import { linksIn, parseLink } from '../links'
import { makeSessionPage, sessionPageId } from '../sessions'

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

describe('session pages', () => {
  it('makes one page per session, in Sessions, with the recap headings', async () => {
    const c = await setUp()
    ensureNoteFolders(c)
    const id = await makeSessionPage(c, 3)
    expect(await makeSessionPage(c, 3)).toBe(id)
    expect(sessionPageId(c, 3)).toBe(id)
    expect(getNote(c, id)).toMatchObject({ title: 'Session 3', folder: 'sessions', gmOnly: false })
    const page = await NoteDoc.open(noteSubdoc(c, id)!)
    const text = page.body.toString()
    expect(text).toContain('<heading level="2">Recap</heading>')
    expect(text).toContain('Loose threads')
    page.destroy()
    c.destroy()
  })
})

describe('the GM vault', () => {
  it('keeps GM-only pages out of the campaign', async () => {
    const c = await setUp()
    expect(c.vault.value).not.toBeNull()
    const secret = createNote(c, { title: 'The Duke is a lich', folder: 'world', gmOnly: true })
    expect(c.notes.has(secret)).toBe(false)
    expect(c.vault.value!.notes.has(secret)).toBe(true)
    expect(getNote(c, secret)).toMatchObject({ title: 'The Duke is a lich', folder: 'world', gmOnly: true })
    expect(listNotes(c).find((n) => n.id === secret)?.gmOnly).toBe(true)
    // The vault's own key, never written to the shared campaign.
    expect(c.vault.value!.key).toMatch(/.{20,}/)
    expect(JSON.stringify(c.doc.toJSON())).not.toContain(c.vault.value!.key)
    c.destroy()
  })

  it('reveals a page with its text, under the same id', async () => {
    const c = await setUp()
    const id = createNote(c, { title: 'Prophecy', gmOnly: true })
    const page = await NoteDoc.open(noteSubdoc(c, id)!)
    page.doc.transact(() => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('The tower falls at midwinter.')])
      page.body.insert(0, [p])
    })
    page.destroy()

    await revealNote(c, id)
    expect(c.vault.value!.notes.has(id)).toBe(false)
    expect(getNote(c, id)).toMatchObject({ title: 'Prophecy', gmOnly: false })
    const shown = await NoteDoc.open(noteSubdoc(c, id)!)
    expect(shown.body.toString()).toContain('The tower falls at midwinter.')
    shown.destroy()
    c.destroy()
  })

  it('is only opened on GM devices', async () => {
    const c = await setUp()
    const id = c.id
    c.destroy()
    device.value = { id: 'pat', name: 'Pat' }
    const asPlayer = await Campaign.open(id)
    expect(asPlayer.vault.value).toBeNull()
    expect(() => createNote(asPlayer, { gmOnly: true })).toThrow()
    asPlayer.destroy()
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
