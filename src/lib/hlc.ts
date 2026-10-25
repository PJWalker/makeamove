/*
 * Hybrid logical clock. Stamps sort by wall-clock time where peers' clocks
 * agree, and still sort causally where they don't: a message stamped after
 * receiving another always sorts after it, even if this device's clock runs
 * slow. Stamps are strings that sort correctly as plain strings:
 *
 *   <wall ms, base 36, 9 chars>:<counter, base 36, 4 chars>:<node id>
 */

export interface Hlc {
  wall: number
  counter: number
  node: string
}

const encode = ({ wall, counter, node }: Hlc) =>
  `${wall.toString(36).padStart(9, '0')}:${counter.toString(36).padStart(4, '0')}:${node}`

export function decode(stamp: string): Hlc {
  const [wall, counter, ...node] = stamp.split(':')
  return { wall: parseInt(wall, 36), counter: parseInt(counter, 36), node: node.join(':') }
}

/** Wall-clock milliseconds of a stamp, for showing when a message was sent. */
export const stampTime = (stamp: string) => decode(stamp).wall

export class HybridClock {
  private last: Hlc
  private readonly now: () => number

  constructor(node: string, now: () => number = Date.now) {
    this.now = now
    this.last = { wall: 0, counter: 0, node }
  }

  /** A new stamp for a local event, later than every stamp seen so far. */
  tick(): string {
    const now = this.now()
    if (now > this.last.wall) this.last = { ...this.last, wall: now, counter: 0 }
    else this.last = { ...this.last, counter: this.last.counter + 1 }
    return encode(this.last)
  }

  /** Account for a stamp from a peer, so later local stamps sort after it. */
  receive(stamp: string) {
    const remote = decode(stamp)
    const now = this.now()
    const wall = Math.max(now, this.last.wall, remote.wall)
    let counter = 0
    if (wall === this.last.wall && wall === remote.wall) counter = Math.max(this.last.counter, remote.counter) + 1
    else if (wall === this.last.wall) counter = this.last.counter + 1
    else if (wall === remote.wall) counter = remote.counter + 1
    this.last = { ...this.last, wall, counter }
  }
}
