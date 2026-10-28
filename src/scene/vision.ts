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

/** Stops for a light's falloff: how much of the dark it lifts (0 to 1) at each fraction of its reach. */
export interface FalloffStop {
  offset: number
  alpha: number
}

/**
 * How a light fades, as gradient stops from its centre to the end of its dim
 * light: nearly full through its bright radius, easing a little towards its
 * edge, then a smooth S-curve down to nothing at the dim radius, with no
 * hard edge anywhere. A light with no dim reach still gets a short soft edge.
 */
export function lightFalloff(bright: number, dim: number, steps = 8): FalloffStop[] {
  const reach = Math.max(dim, bright * 1.15, 1)
  const b = Math.min(bright, reach) / reach
  const stops: FalloffStop[] = []
  // Through the bright light: from full to 90%.
  for (let i = 0; i <= 3; i++) {
    const f = i / 3
    stops.push({ offset: b * f, alpha: 1 - 0.1 * f * f })
  }
  // Out through the dim light: 90% easing to nothing.
  for (let i = 1; i <= steps; i++) {
    const u = i / steps
    stops.push({ offset: b + (1 - b) * u, alpha: 0.9 * (1 - u * u * (3 - 2 * u)) })
  }
  return stops
}

/** How many points across a lamp's disc its light is cast from: more, smoother penumbrae. */
export const LIGHT_SAMPLES = 16

/**
 * Points spread evenly over a light's own disc (a sunflower pattern), from
 * which its light is cast: a lamp has size, so a wall hides it from some
 * places only in part, which gives shadows a penumbra that widens with
 * distance. A point on the far side of a wall from the centre is pulled back
 * to the near side, so a lamp against a wall doesn't shine through it.
 */
export function lightSamples(origin: Point, radius: number, segments: Segment[], n = LIGHT_SAMPLES): Point[] {
  if (radius <= 0 || n <= 1) return [origin]
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n)
    const a = i * golden
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let d = r
    for (const s of segments) {
      const t = hitDistance(origin, dx, dy, s)
      if (t !== null && t < d) d = t * 0.9
    }
    out.push({ x: origin.x + dx * d, y: origin.y + dy * d })
  }
  return out
}

/**
 * The strength of one of `n` passes, so that all of them together lift the
 * dark by `alpha`: erasing multiplies what's left by (1 − a) each time.
 * Where only some passes reach, the dark lifts part way: the penumbra.
 * Full strength is capped just short of 1, or a single pass would clear it.
 */
export function passAlpha(alpha: number, n: number): number {
  return 1 - Math.pow(1 - Math.min(alpha, 0.995), 1 / n)
}
