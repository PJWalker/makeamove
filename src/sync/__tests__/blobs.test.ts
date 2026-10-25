import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { BlobExchange, type BlobStore } from '../blobs'
import { SyncSession } from '../session'
import { MemoryRoom } from './memoryRoom'

async function hashOf(blob: Blob) {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function memoryStore(): BlobStore & { blobs: Map<string, Blob> } {
  const blobs = new Map<string, Blob>()
  return {
    blobs,
    async get(h) {
      return blobs.get(h) ?? null
    },
    async put(b) {
      const h = await hashOf(b)
      blobs.set(h, b)
      return h
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 10))

describe('blob exchange', () => {
  it('fetches a multi-chunk image from a peer, even one that joins later', async () => {
    const room = new MemoryRoom()
    const a = new SyncSession(new Y.Doc(), room.join('a'))
    const b = new SyncSession(new Y.Doc(), room.join('b'))
    const storeA = memoryStore()
    const storeB = memoryStore()
    const bytes = new Uint8Array(50_000).map((_, i) => i % 251)
    const blob = new Blob([bytes])
    const hash = await storeA.put(blob)
    new BlobExchange(a, storeA)
    const exB = new BlobExchange(b, storeB)

    const got = exB.fetch(hash)
    await room.settle()
    await tick()
    await room.settle()
    await tick()
    await room.settle()
    const result = await got
    expect(result && new Uint8Array(await result.arrayBuffer())).toEqual(bytes)
    expect(storeB.blobs.has(hash)).toBe(true)
  })

  it('rejects data that does not match the hash', async () => {
    const room = new MemoryRoom()
    const a = new SyncSession(new Y.Doc(), room.join('a'))
    const b = new SyncSession(new Y.Doc(), room.join('b'))
    const storeA = memoryStore()
    const storeB = memoryStore()
    const real = new Blob(['real image'])
    const hash = await hashOf(real)
    storeA.blobs.set(hash, new Blob(['forged']))
    new BlobExchange(a, storeA)
    const exB = new BlobExchange(b, storeB)

    let settled = false
    exB.fetch(hash).then(() => (settled = true))
    for (let i = 0; i < 4; i++) {
      await room.settle()
      await tick()
    }
    expect(settled).toBe(false)
    expect(storeB.blobs.size).toBe(0)
    exB.close()
  })
})
