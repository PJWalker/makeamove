import type { Channel, JoinRoom, Transport } from "../transport";

interface Delivery {
  to: string;
  run: () => void;
}

export interface MemoryRoomOptions {
  /** Runs each delivery, given the member it's delivered to (to act as that member). */
  deliverTo?: (member: string, deliver: () => void) => void;
  /** Picks which pending delivery goes next, from 0 to `pending - 1`; first-in, first-out by default. */
  pick?: (pending: number) => number;
}

/** An in-memory room: delivers messages between its members, asynchronously. */
export class MemoryRoom {
  private members = new Map<string, MemoryTransport>();
  /** Messages and arrivals sent but not yet delivered. */
  private queue: Delivery[] = [];

  constructor(private options: MemoryRoomOptions = {}) {}

  join(id: string): MemoryTransport {
    const t = new MemoryTransport(id, this);
    const existing = [...this.members.values()];
    this.members.set(id, t);
    for (const other of existing) {
      this.enqueue(other.selfId, () => other.onPeerJoin?.(id));
      this.enqueue(id, () => t.onPeerJoin?.(other.selfId));
    }
    return t;
  }

  leave(id: string) {
    this.members.delete(id);
    // Whatever was still on its way to the leaver is lost.
    this.queue = this.queue.filter((d) => d.to !== id);
    for (const other of this.members.values())
      this.enqueue(other.selfId, () => other.onPeerLeave?.(id));
  }

  peersOf(id: string) {
    return [...this.members.keys()].filter((m) => m !== id);
  }

  deliver(from: string, channel: Channel, data: Uint8Array, target?: string) {
    const copy = data.slice();
    for (const m of this.members.values()) {
      if (m.selfId === from || (target && m.selfId !== target)) continue;
      this.enqueue(m.selfId, () => m.onMessage?.(channel, copy, from));
    }
  }

  private enqueue(to: string, run: () => void) {
    this.queue.push({ to, run });
  }

  get pending() {
    return this.queue.length;
  }

  /** Deliver one pending message or arrival. */
  step() {
    const i = this.options.pick?.(this.queue.length) ?? 0;
    const [next] = this.queue.splice(i, 1);
    if (!next || !this.members.has(next.to)) return;
    const { deliverTo = (_, deliver) => deliver() } = this.options;
    deliverTo(next.to, next.run);
  }

  /** Deliver everything, including messages that delivery causes. */
  async settle() {
    while (this.queue.length) this.step();
    await Promise.resolve();
    if (this.queue.length) await this.settle();
  }
}

class MemoryTransport implements Transport {
  onMessage: Transport["onMessage"] = null;
  onPeerJoin: Transport["onPeerJoin"] = null;
  onPeerLeave: Transport["onPeerLeave"] = null;
  constructor(
    readonly selfId: string,
    private room: MemoryRoom,
  ) {}
  peers() {
    return this.room.peersOf(this.selfId);
  }
  send(channel: Channel, data: Uint8Array, target?: string) {
    this.room.deliver(this.selfId, channel, data, target);
  }
  close() {
    this.room.leave(this.selfId);
  }
}

/** In-memory rooms by id and key, standing in for the public relays. */
export class MemoryNetwork {
  readonly rooms = new Map<string, MemoryRoom>();

  constructor(private options: MemoryRoomOptions = {}) {}

  /** How `member` joins rooms on this network. */
  joinAs(member: string): JoinRoom {
    return (roomId, roomKey) => Promise.resolve(this.room(roomId, roomKey).join(member));
  }

  room(roomId: string, roomKey: string): MemoryRoom {
    const name = `${roomId} ${roomKey}`;
    let room = this.rooms.get(name);
    if (!room) {
      room = new MemoryRoom(this.options);
      this.rooms.set(name, room);
    }
    return room;
  }

  get pending() {
    let n = 0;
    for (const room of this.rooms.values()) n += room.pending;
    return n;
  }

  /** Deliver one message in every room that has one waiting. */
  step() {
    for (const room of this.rooms.values()) if (room.pending) room.step();
  }
}
