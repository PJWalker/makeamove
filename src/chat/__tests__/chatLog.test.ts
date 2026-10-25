import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { SyncSession } from '../../sync/session'
import { MemoryRoom } from '../../sync/__tests__/memoryRoom'
import { ChatLog, CHUNK_SIZE } from '../chatLog'

let n = 0
/** Two peers with their own copy of a campaign, connected. */
async function pair() {
  const id = `camp${n++}`
  const room = new MemoryRoom()
  const make = (who: string) => {
    const root = new Y.Doc({ guid: id })
    const log = new ChatLog(root, id, who)
    const session = new SyncSession(root, room.join(who))
    return { root, log, session, who }
  }
  const a = make('a')
  const b = make('b')
  await Promise.all([a.log.start(), b.log.start()])
  await room.settle()
  return { room, a, b }
}

const text = (t: string) => ({ kind: 'text' as const, text: t })
const until = async (check: () => boolean, room: MemoryRoom) => {
  for (let i = 0; i < 50 && !check(); i++) {
    await room.settle()
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('chat log', () => {
  it('delivers a post to a peer', async () => {
    const { room, a, b } = await pair()
    await a.log.post(text('Hello'), { id: 'a', name: 'Ann' })
    await until(() => b.log.messages.value.length === 1, room)
    expect(b.log.messages.value).toMatchObject([{ kind: 'text', text: 'Hello', author: 'a', name: 'Ann' }])
  })

  it('agrees on the order of posts made at the same time', async () => {
    const { room, a, b } = await pair()
    await a.log.post(text('first'), { id: 'a', name: 'Ann' })
    await until(() => b.log.messages.value.length === 1, room)
    await Promise.all([
      a.log.post(text('from a'), { id: 'a', name: 'Ann' }),
      b.log.post(text('from b'), { id: 'b', name: 'Bo' }),
    ])
    await until(() => a.log.messages.value.length === 3 && b.log.messages.value.length === 3, room)
    const order = (log: ChatLog) => log.messages.value.map((m) => m.kind === 'text' && m.text)
    expect(order(a.log)).toEqual(order(b.log))
    expect(order(a.log)[0]).toBe('first')
  })

  it('replies after what it has seen, even with a slow clock', async () => {
    const { room, a, b } = await pair()
    const theirs = await a.log.post(text('question'), { id: 'a', name: 'Ann' })
    await until(() => b.log.messages.value.length === 1, room)
    const mine = await b.log.post(text('answer'), { id: 'b', name: 'Bo' })
    expect(mine.hlc > theirs.hlc).toBe(true)
  })

  it('starts a new chunk when one fills up', async () => {
    const { a } = await pair()
    const chunks = a.root.getArray<Y.Doc>('chat')
    // Fill a chunk directly; posting 500 messages one by one is slow.
    await a.log.post(text('seed'), { id: 'a', name: 'Ann' })
    const first = chunks.get(0).getArray('messages')
    first.push(Array.from({ length: CHUNK_SIZE - 1 }, (_, i) => ({ kind: 'text', text: `m${i}`, id: `x${i}`, hlc: `0:${i}`, author: 'a', name: 'Ann' })))
    await a.log.post(text('overflow'), { id: 'a', name: 'Ann' })
    expect(chunks.length).toBe(2)
    expect(a.log.messages.value.at(-1)).toMatchObject({ text: 'overflow' })
  })
})

describe('deleting from the chat log', () => {
  it('removes a message for every peer', async () => {
    const { room, a, b } = await pair()
    const keep = await a.log.post(text('keep'), { id: 'a', name: 'Ann' })
    const gone = await a.log.post(text('oops'), { id: 'a', name: 'Ann' })
    await until(() => b.log.messages.value.length === 2, room)
    expect(b.log.remove(gone.id)).toBe(true)
    await until(() => a.log.messages.value.length === 1, room)
    expect(a.log.messages.value.map((m) => m.id)).toEqual([keep.id])
    expect(a.log.remove('nope')).toBe(false)
  })
})
