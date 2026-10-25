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
})
