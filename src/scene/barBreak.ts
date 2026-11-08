import type { Point } from "./grid";

/** A piece of a broken bar, and how it falls. */
export interface BarShard {
  /** Its outline, in the bar's own frame: 0 to 1 across and down. */
  outline: Point[];
  /** Its middle, in the same frame; it turns about this. */
  centre: Point;
  /** How it's thrown, in screen px per second, and how fast it spins, in radians per second. */
  vx: number;
  vy: number;
  spin: number;
}

/** Where a shard is, some time after its bar snapped. */
export interface ShardFrame {
  /** How far it has moved, in screen px. */
  dx: number;
  dy: number;
  rotation: number;
  alpha: number;
}

const SHARDS = 6;
/** Pull on a falling shard, in screen px per second squared. */
const GRAVITY = 1100;

/** A random number generator seeded from a string, so a bar breaks the same way on every frame. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** The pieces a bar breaks into: jagged cuts across it, each piece thrown out from the middle. */
export function barShards(seed: string): BarShard[] {
  const random = seeded(seed);
  const jitter = (n: number) => (random() - 0.5) * n;
  // Each cut runs top to bottom with a kink in the middle; the ends are straight.
  const cuts = Array.from({ length: SHARDS + 1 }, (_, i) => {
    if (i === 0 || i === SHARDS) return [i / SHARDS, i / SHARDS, i / SHARDS];
    const x = i / SHARDS + jitter(0.06);
    return [x + jitter(0.08), x + jitter(0.1), x + jitter(0.08)];
  });
  return cuts.slice(0, -1).map((left, i) => {
    const right = cuts[i + 1]!;
    const outline = [
      { x: left[0]!, y: 0 },
      { x: right[0]!, y: 0 },
      { x: right[1]!, y: 0.5 },
      { x: right[2]!, y: 1 },
      { x: left[2]!, y: 1 },
      { x: left[1]!, y: 0.5 },
    ];
    const centre = {
      x: outline.reduce((sum, p) => sum + p.x, 0) / outline.length,
      y: 0.5,
    };
    const out = centre.x - 0.5;
    return {
      outline,
      centre,
      vx: out * 260 + jitter(60),
      vy: -90 - random() * 110,
      spin: (Math.sign(out) || 1) * (2 + random() * 5),
    };
  });
}

/** Where a shard has fallen to, `elapsed` ms after its bar snapped; it fades as it falls. */
export function shardFrame(shard: BarShard, elapsed: number, lasts: number): ShardFrame {
  const s = Math.max(0, elapsed) / 1000;
  const fade = Math.min(1, Math.max(0, (elapsed - lasts * 0.4) / (lasts * 0.6)));
  return {
    dx: shard.vx * s,
    dy: shard.vy * s + 0.5 * GRAVITY * s * s,
    rotation: shard.spin * s,
    alpha: 1 - fade * fade,
  };
}
