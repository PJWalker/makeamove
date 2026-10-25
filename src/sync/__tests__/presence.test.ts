import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Presence } from '../../scene/presence'
import { SyncSession } from '../session'
import { MemoryRoom } from './memoryRoom'

function peer(room: MemoryRoom, id: string) {
  const session = new SyncSession(new Y.Doc(), room.join(id))
  session.awareness.setLocalStateField('user', { id, name: id.toUpperCase() })
  const presence = new Presence()
  presence.attach(session.awareness)
  return { session, presence }
}

describe('presence', () => {
  it('shows a peer\'s cursor and ruler only on the same scene', async () => {
    const room = new MemoryRoom()
    const a = peer(room, 'a')
    const b = peer(room, 'b')
    a.presence.setScene('s1')
    a.presence.setCursor({ x: 5, y: 6 })
    a.presence.setRuler({ a: { x: 0, y: 0 }, b: { x: 70, y: 0 } })
    await room.settle()

    const seen = b.presence.marks('s1', 'b', 'B').find((m) => m.id === 'a')
    expect(seen?.cursor).toEqual({ x: 5, y: 6 })
    expect(seen?.ruler?.b).toEqual({ x: 70, y: 0 })
    expect(b.presence.marks('s2', 'b', 'B').some((m) => m.id === 'a')).toBe(false)
  })

  it('delivers pings and drops a peer who leaves', async () => {
    const room = new MemoryRoom()
    const a = peer(room, 'a')
    const b = peer(room, 'b')
    a.presence.setScene('s1')
    a.presence.ping({ x: 1, y: 2 })
    await room.settle()
    expect(b.presence.marks('s1', 'b', 'B').find((m) => m.id === 'a')?.ping?.p).toEqual({ x: 1, y: 2 })

    room.leave('a')
    await room.settle()
    expect(b.presence.marks('s1', 'b', 'B').some((m) => m.id === 'a')).toBe(false)
  })
})

describe('laser trail', () => {
  it('reaches peers, replaces the ping and fades out', async () => {
    const room = new MemoryRoom()
    const a = peer(room, 'a')
    const b = peer(room, 'b')
    a.presence.setScene('s1')
    a.presence.ping({ x: 0, y: 0 })
    a.presence.trailTo({ x: 0, y: 0 })
    a.presence.trailTo({ x: 10, y: 5 })
    a.presence.endTrail()
    await room.settle()
    const seen = b.presence.marks('s1', 'b', 'B').find((m) => m.id === 'a')
    expect(seen?.trail?.map((q) => [q.x, q.y])).toEqual([[0, 0], [10, 5]])
    expect(seen?.ping).toBeNull()
  })
})

describe('laser trail fade', () => {
  it('is not restarted by later cursor moves', async () => {
    const room = new MemoryRoom()
    const a = peer(room, 'a')
    const b = peer(room, 'b')
    a.presence.setScene('s1')
    a.presence.trailTo({ x: 0, y: 0 })
    a.presence.endTrail()
    await room.settle()
    const first = b.presence.marks('s1', 'b', 'B').find((m) => m.id === 'a')!.trail![0].t
    await new Promise((r) => setTimeout(r, 30))
    a.presence.setCursor({ x: 9, y: 9 })
    await room.settle()
    const again = b.presence.marks('s1', 'b', 'B').find((m) => m.id === 'a')!.trail![0].t
    expect(again).toBe(first)
  })
})
