import { signal } from '@preact/signals'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { HybridClock } from '../lib/hlc'
import { newId } from '../lib/ids'
import type { ChatMessage } from './types'

/*
 * The campaign's chat log, stored as append-only chunks so long campaigns
 * stay fast. The root document holds `chat`, a Y.Array of chunk
 * subdocuments in the order they were started; each chunk holds up to
 * CHUNK_SIZE messages in a Y.Array named `messages`. Only the newest chunks
 * are loaded (and so synced); "Load earlier" pulls in older ones.
 *
 * Messages sort by their HLC stamp, so two peers starting a chunk at once,
 * or posting at once, still agree on the order.
 */

export const CHUNK_SIZE = 500
/** Chunks loaded when the log opens. */
const INITIAL_CHUNKS = 2

export const chatDbName = (guid: string) => `mam:chat:${guid}`

/** Remove this device's copy of every chunk listed in a campaign's root doc. */
export function deleteChatData(root: Y.Doc) {
  for (const chunk of root.getArray<Y.Doc>('chat').toArray()) indexedDB.deleteDatabase(chatDbName(chunk.guid))
}

interface LoadedChunk {
  doc: Y.Doc
  messages: Y.Array<ChatMessage>
  persistence: IndexeddbPersistence
  stop: () => void
}

export type NewMessage = ChatMessage extends infer M ? (M extends ChatMessage ? Omit<M, 'id' | 'hlc' | 'author' | 'name'> : never) : never

export class ChatLog {
  /** Loaded messages, oldest first. */
  readonly messages = signal<ChatMessage[]>([])
  /** Whether older chunks exist that aren't loaded. */
  readonly hasEarlier = signal(false)

  private readonly chunks: Y.Array<Y.Doc>
  private readonly loaded = new Map<string, LoadedChunk>()
  private readonly clock: HybridClock
  private readonly campaignId: string
  /** Index in `chunks` of the oldest chunk to keep loaded. */
  private from = Infinity
  private destroyed = false
  private stopRoot: () => void

  constructor(root: Y.Doc, campaignId: string, deviceId: string) {
    this.chunks = root.getArray('chat')
    this.campaignId = campaignId
    this.clock = new HybridClock(deviceId)
    // New chunks (ours or a peer's) are always loaded; they're the newest.
    const onChunks = () => void this.loadFrom(Math.min(this.from, Math.max(0, this.chunks.length - INITIAL_CHUNKS)))
    this.chunks.observe(onChunks)
    this.stopRoot = () => this.chunks.unobserve(onChunks)
  }

  /** Load the newest chunks. */
  async start() {
    await this.loadFrom(Math.max(0, this.chunks.length - INITIAL_CHUNKS))
  }

  /** Load the chunk before the oldest one loaded. */
  async loadEarlier() {
    if (this.from > 0) await this.loadFrom(this.from - 1)
  }

  private async loadFrom(index: number) {
    this.from = Math.min(this.from, index)
    this.hasEarlier.value = this.from > 0
    const waits: Promise<unknown>[] = []
    this.chunks.forEach((doc, i) => {
      if (i >= this.from && !this.loaded.has(doc.guid)) waits.push(this.loadChunk(doc))
    })
    await Promise.all(waits)
  }

  private async loadChunk(doc: Y.Doc) {
    if (this.destroyed) return
    doc.load()
    const messages = doc.getArray<ChatMessage>('messages')
    const persistence = new IndexeddbPersistence(chatDbName(doc.guid), doc)
    const onChange = () => this.refresh()
    messages.observe(onChange)
    this.loaded.set(doc.guid, { doc, messages, persistence, stop: () => messages.unobserve(onChange) })
    await persistence.whenSynced
    this.refresh()
  }

  private refresh() {
    const all: ChatMessage[] = []
    for (const { messages } of this.loaded.values()) all.push(...messages.toArray())
    all.sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0))
    // Later local stamps must sort after everything seen.
    const last = all[all.length - 1]
    if (last) this.clock.receive(last.hlc)
    this.messages.value = all
  }

  /** The chunk new messages go into, starting one if needed. */
  private async currentChunk(): Promise<LoadedChunk> {
    const last = this.chunks.length ? this.chunks.get(this.chunks.length - 1) : null
    if (last) {
      if (!this.loaded.has(last.guid)) await this.loadChunk(last)
      const chunk = this.loaded.get(last.guid)!
      if (chunk.messages.length < CHUNK_SIZE) return chunk
    }
    const doc = new Y.Doc({ guid: `${this.campaignId}/chat/${newId()}` })
    this.chunks.push([doc])
    // The chunks observer starts loading it; wait for that to finish.
    await this.loadFrom(this.chunks.length - 1)
    return this.loaded.get(doc.guid)!
  }

  /** Append a message from this device. Posts go one at a time, in order. */
  post(message: NewMessage, author: { id: string; name: string }): Promise<ChatMessage> {
    const next = this.queue.then(async () => {
      const chunk = await this.currentChunk()
      const full = { ...message, id: newId(), hlc: this.clock.tick(), author: author.id, name: author.name } as ChatMessage
      chunk.messages.push([full])
      return full
    })
    this.queue = next.catch(() => {})
    return next
  }

  private queue: Promise<unknown> = Promise.resolve()

  /**
   * Delete a message from the shared log, for everyone. Callers check who may
   * (see canDelete); like other GM rules this is enforced in the UI only.
   */
  remove(id: string): boolean {
    for (const { messages } of this.loaded.values()) {
      const i = messages.toArray().findIndex((m) => m.id === id)
      if (i >= 0) {
        messages.delete(i, 1)
        return true
      }
    }
    return false
  }

  destroy() {
    this.destroyed = true
    this.stopRoot()
    for (const c of this.loaded.values()) {
      c.stop()
      c.persistence.destroy()
    }
    this.loaded.clear()
  }
}
