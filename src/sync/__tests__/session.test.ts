import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { SyncSession } from '../session'
import { MemoryRoom } from './memoryRoom'

const rootDoc = () => new Y.Doc({ guid: 'camp' })

describe('SyncSession', () => {
  it('brings a late joiner up to date', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    a.getMap('meta').set('name', 'The Lost Barrows')
    const sa = new SyncSession(a, room.join('a'))

    const b = rootDoc()
    const sb = new SyncSession(b, room.join('b'))
    await room.settle()

    expect(b.getMap('meta').get('name')).toBe('The Lost Barrows')
    sa.destroy()
    sb.destroy()
  })

  it('merges concurrent edits and does not echo updates back', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    const b = rootDoc()
    const sa = new SyncSession(a, room.join('a'))
    const sb = new SyncSession(b, room.join('b'))
    await room.settle()

    let updatesOnA = 0
    a.on('update', () => updatesOnA++)
    b.getMap('m').set('x', 1)
    a.getMap('m').set('y', 2)
    await room.settle()

    expect(a.getMap('m').toJSON()).toEqual({ x: 1, y: 2 })
    expect(b.getMap('m').toJSON()).toEqual({ x: 1, y: 2 })
    // One local edit plus one from b; no bounce.
    expect(updatesOnA).toBe(2)
    sa.destroy()
    sb.destroy()
  })

  it('syncs a scene subdocument once both peers have it loaded', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    const b = rootDoc()
    const sa = new SyncSession(a, room.join('a'))
    const sb = new SyncSession(b, room.join('b'))

    const scene = new Y.Doc({ guid: 'camp/s1' })
    a.getMap('scenes').set('s1', scene)
    await room.settle()
    const theirs = b.getMap('scenes').get('s1') as Y.Doc
    expect(theirs.guid).toBe('camp/s1')

    scene.load()
    scene.getMap('elements').set('t1', 'token')
    await room.settle()
    // b hasn't opened the scene, so it holds nothing yet.
    expect(theirs.getMap('elements').size).toBe(0)

    theirs.load()
    await room.settle()
    expect(theirs.getMap('elements').get('t1')).toBe('token')

    scene.getMap('elements').set('t2', 'token')
    await room.settle()
    expect(theirs.getMap('elements').size).toBe(2)
    sa.destroy()
    sb.destroy()
  })

  it('syncs subdocuments that were loaded before the session started (a campaign opened from storage)', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    const b = rootDoc()
    // Both already hold the chunk, loaded, as when a campaign reopens and its chat loads before connecting.
    const chunk = new Y.Doc({ guid: 'camp/chat/c1' })
    a.getArray('chat').push([chunk])
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const theirs = b.getArray<Y.Doc>('chat').get(0)
    theirs.load()
    const sa = new SyncSession(a, room.join('a'))
    const sb = new SyncSession(b, room.join('b'))
    await room.settle()

    chunk.getArray('messages').push(['Hello'])
    await room.settle()
    expect(theirs.getArray('messages').toArray()).toEqual(['Hello'])
    sa.destroy()
    sb.destroy()
  })

  it('shares presence and clears it when a peer leaves', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    const b = rootDoc()
    const sa = new SyncSession(a, room.join('a'))
    const sb = new SyncSession(b, room.join('b'))
    await room.settle()

    sb.awareness.setLocalStateField('user', { name: 'Robin' })
    await room.settle()
    const seen = [...sa.awareness.getStates().values()].map((s) => s.user?.name)
    expect(seen).toContain('Robin')

    sb.destroy()
    await room.settle()
    expect([...sa.awareness.getStates().values()].map((s) => s.user?.name)).not.toContain('Robin')
    sa.destroy()
  })

  it('shares a subdocument’s own awareness only between peers who have it open', async () => {
    const room = new MemoryRoom()
    const a = rootDoc()
    const b = rootDoc()
    const sa = new SyncSession(a, room.join('a'))
    const sb = new SyncSession(b, room.join('b'))
    const note = new Y.Doc({ guid: 'camp/note/n1' })
    a.getMap('notes').set('n1', note)
    await room.settle()
    const theirs = b.getMap('notes').get('n1') as Y.Doc

    note.load()
    sa.awarenessFor(note).setLocalStateField('user', { name: 'Ann' })
    theirs.load()
    const bAware = sb.awarenessFor(theirs)
    bAware.setLocalStateField('user', { name: 'Bo' })
    await room.settle()
    const names = (x: typeof bAware) => [...x.getStates().values()].map((s) => s.user?.name).sort()
    // Bo hears Ann on joining the note, and Ann hears Bo.
    expect(names(bAware)).toEqual(['Ann', 'Bo'])
    expect(names(sa.awarenessFor(note))).toEqual(['Ann', 'Bo'])
    // The root's presence isn't touched.
    expect([...sb.awareness.getStates().values()].map((s) => s.user?.name)).not.toContain('Ann')

    theirs.destroy()
    await room.settle()
    expect(names(sa.awarenessFor(note))).toEqual(['Ann'])
    sa.destroy()
    sb.destroy()
  })
})
