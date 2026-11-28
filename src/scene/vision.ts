import { fromLocal, shapePolygon } from "./geometry";
import type { Point } from "./grid";
import { distanceToSegment } from "./stroke";
import type { SceneElement, Transform } from "./types";

/*
 * Line of sight and light (M12). Walls are segments that block sight;
 * an open door doesn't. Light and sight are worked out per pixel on the GPU
 * (scene/lampShader.ts): each lamp is one quad over its reach, and its
 * shader adds up how much of the lamp's disc each wall near it hides. The
 * same sums are here, for tests and for checking a token is in view.
 */

export interface Segment {
  a: Point;
  b: Point;
}

/** How thick a wall is to pick, in world px; it blocks sight along its line alone. */
const WALL_THICKNESS = 6;

/** A wall from `a` to `b`: the inverse of wallEnds. */
export function wallBetween(a: Point, b: Point): Transform {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    w: Math.hypot(b.x - a.x, b.y - a.y),
    h: WALL_THICKNESS,
    rot: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** A wall's two ends in the world: it lies along its length (w), through its centre, at its rotation. */
export function wallEnds(element: {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}): Segment {
  return {
    a: fromLocal(element, { x: -element.w / 2, y: 0 }),
    b: fromLocal(element, { x: element.w / 2, y: 0 }),
  };
}

/** The segments that block sight: every wall but open doors. */
export function blockingSegments(elements: readonly SceneElement[]): Segment[] {
  return elements.flatMap((element) =>
    element.type === "wall" && !(element.door && element.open) ? [wallEnds(element)] : [],
  );
}

/**
 * The segments that block sight but not light: walls, and the edges of
 * effects that obscure (fog), which can't be seen into, out of or through.
 */
export function sightSegments(elements: readonly SceneElement[]): Segment[] {
  return [
    ...blockingSegments(elements),
    ...elements.flatMap((element) => {
      if (element.type !== "effect" || !element.obscures) return [];
      const poly = shapePolygon(element);
      return poly.map((a, index) => ({ a, b: poly[(index + 1) % poly.length]! }));
    }),
  ];
}

/** Whether anything in `segments` stands between a and b. */
export function blocked(a: Point, b: Point, segments: Segment[]): boolean {
  const cross = (o: Point, p: Point, q: Point) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  return segments.some(
    (s) => cross(a, b, s.a) * cross(a, b, s.b) < 0 && cross(s.a, s.b, a) * cross(s.a, s.b, b) < 0,
  );
}

/** Shortest distance from p to a segment. */
export function segmentDistance(p: Point, s: Segment): number {
  return distanceToSegment(p.x, p.y, s.a.x, s.a.y, s.b.x, s.b.y);
}

/**
 * How much a light lifts the dark (0 to 1) at distance `d` from its centre:
 * nearly full through its bright radius, easing to 90% at its edge, then a
 * smooth S-curve down to nothing at the end of its dim light, with no hard
 * edge anywhere. A light with no dim reach still gets a short soft edge.
 * The lamp shader works this out per pixel the same way.
 */
export function lightAlpha(bright: number, dim: number, d: number): number {
  const reach = lightReach(bright, dim);
  const b = Math.min(bright, reach) / reach;
  const f = d / reach;
  if (f >= 1) return 0;
  if (f < b) return 1 - 0.1 * (f / b) ** 2;
  const u = (f - b) / (1 - b);
  return 0.9 * (1 - u * u * (3 - 2 * u));
}

/** How far a light reaches before it has faded to nothing. */
export function lightReach(bright: number, dim: number): number {
  return Math.max(dim, bright * 1.15, 1);
}

/** The share of a disc (radius 1) lying left of a chord at x = t. */
function discShare(t: number): number {
  const c = Math.max(-1, Math.min(1, t));
  return 0.5 + (c * Math.sqrt(1 - c * c) + Math.asin(c)) / Math.PI;
}

/**
 * How much of a lamp at `lamp`, `radius` across, a segment hides from `p`
 * (0 to 1). The lamp is seen face-on from p, so the segment's ends are
 * projected onto the lamp's diameter across the line of sight, and the share
 * of the disc between them is hidden; the part of the segment behind p or
 * beyond the lamp hides nothing. Segments that meet end to end hide shares
 * that add up exactly, so a run of walls casts one unbroken shadow, and the
 * penumbra widens with distance behind a wall as the lamp's size shows.
 * The lamp shader works this out per pixel the same way.
 */
export function lampHidden(p: Point, lamp: Point, radius: number, s: Segment): number {
  const tx = lamp.x - p.x;
  const ty = lamp.y - p.y;
  const distribution = Math.hypot(tx, ty);
  if (distribution < 1e-6) return 0;
  const dx = tx / distribution;
  const dy = ty / distribution;
  let ax = s.a.x - p.x;
  let ay = s.a.y - p.y;
  let bx = s.b.x - p.x;
  let by = s.b.y - p.y;
  let da = ax * dx + ay * dy;
  let database = bx * dx + by * dy;
  const near = distribution * 1e-4;
  if (Math.max(da, database) <= near || Math.min(da, database) >= distribution) return 0;
  // Clip to what lies between p and the lamp.
  const clip = (lo: number, keepAbove: boolean) => {
    const t = (lo - da) / (database - da);
    if (keepAbove ? da < lo : da > lo) {
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      da = lo;
    } else if (keepAbove ? database < lo : database > lo) {
      bx = ax + (bx - ax) * t;
      by = ay + (by - ay) * t;
      database = lo;
    }
  };
  clip(near, true);
  clip(distribution, false);
  const r = Math.max(radius, 1e-6);
  const xa = ((ax * -dy + ay * dx) * distribution) / (da * r);
  const xb = ((bx * -dy + by * dx) * distribution) / (database * r);
  return Math.abs(discShare(xb) - discShare(xa));
}

/** How much of a token's width blocks light: creatures don't fill their space. */
export const TOKEN_BODY = 0.7;
/** How much of the light a token's shadow takes, at most. */
export const TOKEN_SHADE = 0.85;

/**
 * What a token at `c`, `size` across, blocks of a light at `from`: a segment
 * across its back edge (so its shadow doesn't darken the token itself), as
 * wide as its body seen from the light, and the distances from the light
 * over which its shadow fades out (0.6 to 1.8 of its size past its centre).
 * Null if the light is inside the token.
 */
export function tokenBlocker(
  from: Point,
  c: Point,
  size: number,
): { seg: Segment; fade: [number, number] } | null {
  const dx = c.x - from.x;
  const dy = c.y - from.y;
  const d = Math.hypot(dx, dy);
  const r = (size / 2) * TOKEN_BODY;
  if (d <= r) return null;
  const ux = dx / d;
  const uy = dy / d;
  const back = size / 2;
  const half = (r * (d + back)) / d;
  const bx = c.x + ux * back;
  const by = c.y + uy * back;
  return {
    seg: {
      a: { x: bx + uy * half, y: by - ux * half },
      b: { x: bx - uy * half, y: by + ux * half },
    },
    fade: [d + 0.6 * size, d + 1.8 * size],
  };
}

/** A box in the world. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a ray from `from` along `d` first meets `s`, as a distance along the ray (in units of its length); Infinity if it misses. */
function rayHit(from: Point, { x: dx, y: dy }: Point, s: Segment): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const ax = s.a.x - from.x;
  const ay = s.a.y - from.y;
  const t = (ax * ey - ay * ex) / denom;
  const u = (ax * dy - ay * dx) / denom;
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

/**
 * What can be seen from `from` within `box`: the polygon swept by rays to
 * every wall end (and just either side of it, to see past it), each stopped
 * at the first segment in its way. Flat [x, y, …] in the world, rounded to
 * whole px.
 */
export function sightPolygon(from: Point, segments: readonly Segment[], box: Box): number[] {
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const edges: Segment[] = [
    { a: { x: box.x, y: box.y }, b: { x: x1, y: box.y } },
    { a: { x: x1, y: box.y }, b: { x: x1, y: y1 } },
    { a: { x: x1, y: y1 }, b: { x: box.x, y: y1 } },
    { a: { x: box.x, y: y1 }, b: { x: box.x, y: box.y } },
  ];
  const inside = (p: Point) => p.x >= box.x && p.x <= x1 && p.y >= box.y && p.y <= y1;
  const all = [
    ...segments.filter((s) => inside(s.a) || inside(s.b) || crossesBox(s, box)),
    ...edges,
  ];
  const angles: number[] = [];
  for (const s of all)
    for (const p of [s.a, s.b]) {
      if (!inside(p)) continue;
      const a = Math.atan2(p.y - from.y, p.x - from.x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  angles.sort((a, b) => a - b);
  const reach = Math.hypot(box.w, box.h) * 2;
  const points: number[] = [];
  for (const a of angles) {
    const dx = Math.cos(a) * reach;
    const dy = Math.sin(a) * reach;
    let t = 1;
    for (const s of all) t = Math.min(t, rayHit(from, { x: dx, y: dy }, s));
    const x = Math.round(from.x + dx * t);
    const y = Math.round(from.y + dy * t);
    // eslint-disable-next-line unicorn/prefer-at
    if (points.length > 0 && points[points.length - 2] === x && points[points.length - 1] === y)
      continue;
    points.push(x, y);
  }
  return points;
}

/** Whether a segment with both ends outside a box passes through it. */
function crossesBox(s: Segment, box: Box): boolean {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  return corners.some((c, index) => {
    const d = corners[(index + 1) % 4]!;
    return blocked(s.a, s.b, [{ a: c, b: d }]);
  });
}
