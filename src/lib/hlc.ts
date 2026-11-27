/*
 * Hybrid logical clock. Stamps sort by wall-clock time where peers' clocks
 * agree, and still sort causally where they don't: a message stamped after
 * receiving another always sorts after it, even if this device's clock runs
 * slow. Stamps are strings that sort correctly as plain strings:
 *
 *   <wall ms, base 36, 9 chars>:<counter, base 36, 4 chars>:<node id>
 */

export interface Hlc {
  wall: number;
  counter: number;
  node: string;
}

const encode = ({ wall, counter, node }: Hlc) =>
  `${wall.toString(36).padStart(9, "0")}:${counter.toString(36).padStart(4, "0")}:${node}`;

export function decode(stamp: string): Hlc {
  const [wall = "0", counter = "0", ...node] = stamp.split(":");
  return {
    wall: Number.parseInt(wall, 36),
    counter: Number.parseInt(counter, 36),
    node: node.join(":"),
  };
}

/** Wall-clock milliseconds of a stamp, for showing when a message was sent. */
export const stampTime = (stamp: string) => decode(stamp).wall;

/** Whether `a` is strictly later than `b`: by wall time, then by counter. */
export function isLater(a: Hlc, b: Hlc): boolean {
  //@ verify
  return a.wall > b.wall || (a.wall === b.wall && a.counter > b.counter);
}

/** The clock after a local event at wall time `now`: later than `last`, and never behind `now`. */
export function ticked(last: Hlc, now: number): Hlc {
  //@ verify
  //@ requires last.counter >= 0
  //@ ensures isLater(\result, last)
  //@ ensures \result.wall >= now && \result.counter >= 0
  //@ ensures \result.node === last.node
  if (now > last.wall) return { wall: now, counter: 0, node: last.node };
  return { wall: last.wall, counter: last.counter + 1, node: last.node };
}

/**
 * The clock after receiving `remote` at wall time `now`: later than both
 * `last` and `remote`, so the next local stamp sorts after the peer's.
 */
export function received(last: Hlc, remote: Hlc, now: number): Hlc {
  //@ verify
  //@ requires last.counter >= 0 && remote.counter >= 0
  //@ ensures isLater(\result, last) && isLater(\result, remote)
  //@ ensures \result.wall >= now && \result.counter >= 0
  //@ ensures \result.node === last.node
  const wall = Math.max(now, last.wall, remote.wall);
  let counter = 0;
  if (wall === last.wall && wall === remote.wall)
    counter = Math.max(last.counter, remote.counter) + 1;
  else if (wall === last.wall) counter = last.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  return { wall, counter, node: last.node };
}

export class HybridClock {
  private last: Hlc;
  private readonly now: () => number;

  constructor(node: string, now: () => number = Date.now) {
    this.now = now;
    this.last = { wall: 0, counter: 0, node };
  }

  /** A new stamp for a local event, later than every stamp seen so far. */
  tick(): string {
    this.last = ticked(this.last, this.now());
    return encode(this.last);
  }

  /** Account for a stamp from a peer, so later local stamps sort after it. */
  receive(stamp: string) {
    this.last = received(this.last, decode(stamp), this.now());
  }
}
