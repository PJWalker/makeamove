import { fromLocal } from './geometry'
export { insidePolygon } from './geometry'
import type { Point } from './grid'
import type { SceneElement } from './types'

/*
 * Line of sight and light (M12). Walls are segments that block sight;
 * an open door doesn't. Light and sight are worked out per pixel on the GPU
 * (scene/lampShader.ts): each lamp is one quad over its reach, and its
 * shader adds up how much of the lamp's disc each wall near it hides. The
 * same sums are here, for tests and for checking a token is in view.
 */

export interface Segment {
  a: Point
  b: Point
}

/** A wall's two ends in the world: it lies along its length (w), through its centre, at its rotation. */
export function wallEnds(el: { x: number; y: number; w: number; h: number; rot: number }): Segment {
  return { a: fromLocal(el, { x: -el.w / 2, y: 0 }), b: fromLocal(el, { x: el.w / 2, y: 0 }) }
}

/** The segments that block sight: every wall but open doors. */
export function blockingSegments(elements: readonly SceneElement[]): Segment[] {
  return elements.flatMap((el) => (el.type === 'wall' && !(el.door && el.open) ? [wallEnds(el)] : []))
}

/** Whether anything in `segments` stands between a and b. */
export function blocked(a: Point, b: Point, segments: Segment[]): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  return segments.some((s) => cross(a, b, s.a) * cross(a, b, s.b) < 0 && cross(s.a, s.b, a) * cross(s.a, s.b, b) < 0)
}

export function distanceToSegment(p: Point, s: Segment): number {
  const ex = s.b.x - s.a.x
  const ey = s.b.y - s.a.y
  const len2 = ex * ex + ey * ey
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * ex + (p.y - s.a.y) * ey) / len2)) : 0
  return Math.hypot(p.x - (s.a.x + ex * t), p.y - (s.a.y + ey * t))
}

/**
 * How much a light lifts the dark (0 to 1) at distance `d` from its centre:
 * nearly full through its bright radius, easing to 90% at its edge, then a
 * smooth S-curve down to nothing at the end of its dim light, with no hard
 * edge anywhere. A light with no dim reach still gets a short soft edge.
 * The lamp shader works this out per pixel the same way.
 */
export function lightAlpha(bright: number, dim: number, d: number): number {
  const reach = lightReach(bright, dim)
  const b = Math.min(bright, reach) / reach
  const f = d / reach
  if (f >= 1) return 0
  if (f < b) return 1 - 0.1 * (f / b) ** 2
  const u = (f - b) / (1 - b)
  return 0.9 * (1 - u * u * (3 - 2 * u))
}

/** How far a light reaches before it has faded to nothing. */
export function lightReach(bright: number, dim: number): number {
  return Math.max(dim, bright * 1.15, 1)
}

/** The share of a disc (radius 1) lying left of a chord at x = t. */
function discShare(t: number): number {
  const c = Math.max(-1, Math.min(1, t))
  return 0.5 + (c * Math.sqrt(1 - c * c) + Math.asin(c)) / Math.PI
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
  const tx = lamp.x - p.x
  const ty = lamp.y - p.y
  const dist = Math.hypot(tx, ty)
  if (dist < 1e-6) return 0
  const dx = tx / dist
  const dy = ty / dist
  let ax = s.a.x - p.x
  let ay = s.a.y - p.y
  let bx = s.b.x - p.x
  let by = s.b.y - p.y
  let da = ax * dx + ay * dy
  let db = bx * dx + by * dy
  const near = dist * 1e-4
  if (Math.max(da, db) <= near || Math.min(da, db) >= dist) return 0
  // Clip to what lies between p and the lamp.
  const clip = (lo: number, keepAbove: boolean) => {
    const t = (lo - da) / (db - da)
    if (keepAbove ? da < lo : da > lo) {
      ax += (bx - ax) * t
      ay += (by - ay) * t
      da = lo
    } else if (keepAbove ? db < lo : db > lo) {
      bx = ax + (bx - ax) * t
      by = ay + (by - ay) * t
      db = lo
    }
  }
  clip(near, true)
  clip(dist, false)
  const r = Math.max(radius, 1e-6)
  const xa = ((ax * -dy + ay * dx) * dist) / (da * r)
  const xb = ((bx * -dy + by * dx) * dist) / (db * r)
  return Math.abs(discShare(xb) - discShare(xa))
}

/** How much of a token's width blocks light: creatures don't fill their space. */
export const TOKEN_BODY = 0.7
/** How much of the light a token's shadow takes, at most. */
export const TOKEN_SHADE = 0.85

/**
 * What a token at `c`, `size` across, blocks of a light at `from`: a segment
 * across its back edge (so its shadow doesn't darken the token itself), as
 * wide as its body seen from the light, and the distances from the light
 * over which its shadow fades out (0.6 to 1.8 of its size past its centre).
 * Null if the light is inside the token.
 */
export function tokenBlocker(from: Point, c: Point, size: number): { seg: Segment; fade: [number, number] } | null {
  const dx = c.x - from.x
  const dy = c.y - from.y
  const d = Math.hypot(dx, dy)
  const r = (size / 2) * TOKEN_BODY
  if (d <= r) return null
  const ux = dx / d
  const uy = dy / d
  const back = size / 2
  const half = (r * (d + back)) / d
  const bx = c.x + ux * back
  const by = c.y + uy * back
  return {
    seg: { a: { x: bx + uy * half, y: by - ux * half }, b: { x: bx - uy * half, y: by + ux * half } },
    fade: [d + 0.6 * size, d + 1.8 * size],
  }
}
