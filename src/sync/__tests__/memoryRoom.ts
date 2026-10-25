import type { Channel, Transport } from '../transport'

/** An in-memory room: delivers messages between its members, asynchronously. */
export class MemoryRoom {
  private members = new Map<string, MemoryTransport>()
  /** Messages sent but not yet delivered. */
  private queue: (() => void)[] = []

  join(id: string): MemoryTransport {
    const t = new MemoryTransport(id, this)
    const existing = [...this.members.values()]
    this.members.set(id, t)
    for (const other of existing) {
      this.queue.push(() => other.onPeerJoin?.(id))
      this.queue.push(() => t.onPeerJoin?.(other.selfId))
    }
    return t
  }

  leave(id: string) {
    this.members.delete(id)
    for (const other of this.members.values()) this.queue.push(() => other.onPeerLeave?.(id))
  }

  peersOf(id: string) {
    return [...this.members.keys()].filter((m) => m !== id)
  }

  deliver(from: string, channel: Channel, data: Uint8Array, target?: string) {
    const copy = data.slice()
    for (const m of this.members.values()) {
      if (m.selfId === from || (target && m.selfId !== target)) continue
      this.queue.push(() => m.onMessage?.(channel, copy, from))
    }
  }

  /** Deliver everything, including messages that delivery causes. */
  async settle() {
    while (this.queue.length) this.queue.shift()!()
    await Promise.resolve()
    if (this.queue.length) await this.settle()
  }
}

class MemoryTransport implements Transport {
  onMessage: Transport['onMessage'] = null
  onPeerJoin: Transport['onPeerJoin'] = null
  onPeerLeave: Transport['onPeerLeave'] = null
  constructor(
    readonly selfId: string,
    private room: MemoryRoom,
  ) {}
  peers() {
    return this.room.peersOf(this.selfId)
  }
  send(channel: Channel, data: Uint8Array, target?: string) {
    this.room.deliver(this.selfId, channel, data, target)
  }
  close() {
    this.room.leave(this.selfId)
  }
}
