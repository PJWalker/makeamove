import { fromLocal } from './geometry'
import type { Point } from './grid'
import type { SceneElement } from './types'

/*
 * Line of sight and light (M12). Walls are segments that block sight;
 * an open door doesn't. From a point, the visibility polygon is what can be
 * seen out to a radius: rays are cast at every wall end (and just either
 * side of it) and at even steps round the circle, each stopping at the
 * nearest wall or the radius, and joined in order of angle.
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

/** Where a ray from `o` in direction (dx, dy) first meets segment s, as a distance along the ray; null if it misses. */
function hitDistance(o: Point, dx: number, dy: number, s: Segment): number | null {
  const ex = s.b.x - s.a.x
  const ey = s.b.y - s.a.y
  const denom = dx * ey - dy * ex
  if (Math.abs(denom) < 1e-12) return null
  const t = ((s.a.x - o.x) * ey - (s.a.y - o.y) * ex) / denom
  const u = ((s.a.x - o.x) * dy - (s.a.y - o.y) * dx) / denom
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null
}

/** Rays at even steps round the circle, so an open area still comes out round. */
const CIRCLE_RAYS = 96
const EPS = 1e-4

/** What can be seen from `origin` out to `radius`, past no wall, as a polygon in order round it. */
export function visibilityPolygon(origin: Point, segments: Segment[], radius: number): Point[] {
  // Only walls that come within the radius matter.
  const near = segments.filter((s) => distanceToSegment(origin, s) < radius)
  const angles: number[] = []
  for (let i = 0; i < CIRCLE_RAYS; i++) angles.push((i / CIRCLE_RAYS) * Math.PI * 2 - Math.PI)
  for (const s of near) {
    for (const p of [s.a, s.b]) {
      if (Math.hypot(p.x - origin.x, p.y - origin.y) > radius) continue
      const a = Math.atan2(p.y - origin.y, p.x - origin.x)
      angles.push(a - EPS, a, a + EPS)
    }
  }
  angles.sort((x, y) => x - y)
  const out: Point[] = []
  for (const a of angles) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let d = radius
    for (const s of near) {
      const t = hitDistance(origin, dx, dy, s)
      if (t !== null && t < d) d = t
    }
    out.push({ x: origin.x + dx * d, y: origin.y + dy * d })
  }
  return out
}

export function distanceToSegment(p: Point, s: Segment): number {
  const ex = s.b.x - s.a.x
  const ey = s.b.y - s.a.y
  const len2 = ex * ex + ey * ey
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * ex + (p.y - s.a.y) * ey) / len2)) : 0
  return Math.hypot(p.x - (s.a.x + ex * t), p.y - (s.a.y + ey * t))
}

/** Whether p is inside a polygon (even-odd). */
export function insidePolygon(poly: Point[], p: Point): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A light, as the renderer draws it: where, how far its bright and dim light reach, and what it can reach past walls. */
export interface LitArea {
  bright: Point[]
  dim: Point[]
}

/** The areas a light reaches: bright out to its bright radius, dim out to its dim one, both stopped by walls. */
export function lightArea(origin: Point, segments: Segment[], bright: number, dim: number): LitArea {
  return { bright: visibilityPolygon(origin, segments, bright), dim: visibilityPolygon(origin, segments, Math.max(bright, dim)) }
}
