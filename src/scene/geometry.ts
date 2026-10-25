import type { Rect } from './camera'
import type { Point } from './grid'
import { distanceToStroke } from './stroke'
import { isPlainToken, type SceneElement, type Transform } from './types'

/** p in the element's own frame: origin at its centre, unrotated, unscaled. */
export function toLocal(t: Transform, p: Point): Point {
  const dx = p.x - t.x
  const dy = p.y - t.y
  const c = Math.cos(-t.rot)
  const s = Math.sin(-t.rot)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

export function fromLocal(t: Transform, p: Point): Point {
  const c = Math.cos(t.rot)
  const s = Math.sin(t.rot)
  return { x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c }
}

/** Corners in world space: top-left, top-right, bottom-right, bottom-left. */
export function corners(t: Transform): Point[] {
  const hw = t.w / 2
  const hh = t.h / 2
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => fromLocal(t, p))
}

/** Axis-aligned bounds of one or more elements. */
export function bounds(ts: Transform[]): Rect | null {
  if (!ts.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const t of ts) {
    for (const c of corners(t)) {
      x0 = Math.min(x0, c.x)
      y0 = Math.min(y0, c.y)
      x1 = Math.max(x1, c.x)
      y1 = Math.max(y1, c.y)
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const intersects = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h

export const contains = (outer: Rect, inner: Rect) =>
  outer.x <= inner.x && outer.y <= inner.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/** Whether world point p touches the element, within `tolerance` world px. */
export function hits(el: SceneElement, p: Point, tolerance = 0): boolean {
  const l = toLocal(el, p)
  const hw = el.w / 2
  const hh = el.h / 2
  switch (el.type) {
    case 'map':
      return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= hh + tolerance
    case 'token':
      if (isPlainToken(el)) return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= hh + tolerance
      return Math.hypot(l.x, l.y) <= Math.min(hw, hh) + tolerance
    case 'drawing': {
      if (Math.abs(l.x) > hw + tolerance || Math.abs(l.y) > hh + tolerance) return false
      const sx = el.w / el.bw
      const sy = el.h / el.bh
      const scale = (sx + sy) / 2
      const d = distanceToStroke(el.points, l.x / sx, l.y / sy) * scale
      return d <= (el.width / 2) * scale + tolerance
    }
  }
}

export type Corner = 0 | 1 | 2 | 3
export const CORNER_SIGNS: Point[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
]

/**
 * Resize by dragging `corner` to world point p, keeping the opposite corner
 * where it is. With `keepAspect` the shape scales uniformly.
 */
export function resizeFromCorner(t: Transform, corner: Corner, p: Point, keepAspect: boolean, min = 8): Transform {
  const sign = CORNER_SIGNS[corner]
  const opposite = { x: (-sign.x * t.w) / 2, y: (-sign.y * t.h) / 2 }
  const l = toLocal(t, p)
  let w = Math.max(min, (l.x - opposite.x) * sign.x)
  let h = Math.max(min, (l.y - opposite.y) * sign.y)
  if (keepAspect) {
    const k = Math.max(w / t.w, h / t.h)
    w = Math.max(min, t.w * k)
    h = Math.max(min, t.h * k)
  }
  const centre = fromLocal(t, { x: opposite.x + (sign.x * w) / 2, y: opposite.y + (sign.y * h) / 2 })
  return { ...t, x: centre.x, y: centre.y, w, h }
}

/** Rotation that points the element's top towards p, optionally in steps. */
export function rotationTowards(t: Transform, p: Point, stepDeg = 0): number {
  let rot = Math.atan2(p.y - t.y, p.x - t.x) + Math.PI / 2
  if (stepDeg) {
    const step = (stepDeg * Math.PI) / 180
    rot = Math.round(rot / step) * step
  }
  // Normalise to (-π, π].
  rot = Math.atan2(Math.sin(rot), Math.cos(rot))
  return Math.abs(rot) < 1e-9 ? 0 : rot
}
