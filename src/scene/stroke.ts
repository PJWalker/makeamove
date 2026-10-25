import { getStroke } from 'perfect-freehand'
import type { Transform } from './types'

/*
 * Freehand strokes are stored as the input points, flat [x, y, pressure, …],
 * and turned into a filled outline with perfect-freehand when drawn.
 */

export const STRIDE = 3

/** Outline polygon (flat [x, y, …]) for a stroke's points. */
export function strokeOutline(points: number[], width: number, realPressure: boolean): number[] {
  const input: number[][] = []
  for (let i = 0; i < points.length; i += STRIDE) input.push([points[i], points[i + 1], points[i + 2]])
  const outline = getStroke(input, {
    size: width,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: !realPressure,
    last: true,
  })
  return outline.flat()
}

/** Whether a stroke's pressure values came from a pen rather than a default. */
export function hasRealPressure(points: number[]): boolean {
  for (let i = 2; i < points.length; i += STRIDE) if (points[i] !== 0.5) return true
  return false
}

/**
 * Turn world-space points into a drawing element's geometry: a centre and
 * size (padded by the stroke width) and points relative to that centre.
 */
export function finishStroke(world: number[], width: number): Transform & { points: number[]; bw: number; bh: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < world.length; i += STRIDE) {
    x0 = Math.min(x0, world[i])
    x1 = Math.max(x1, world[i])
    y0 = Math.min(y0, world[i + 1])
    y1 = Math.max(y1, world[i + 1])
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const w = Math.max(1, x1 - x0 + width)
  const h = Math.max(1, y1 - y0 + width)
  const points: number[] = []
  for (let i = 0; i < world.length; i += STRIDE) {
    points.push(round(world[i] - cx, 10), round(world[i + 1] - cy, 10), round(world[i + 2], 100))
  }
  return { x: cx, y: cy, w, h, rot: 0, points, bw: w, bh: h }
}

const round = (v: number, k: number) => Math.round(v * k) / k

/** Shortest distance from (x, y) to the stroke's centre line. */
export function distanceToStroke(points: number[], x: number, y: number): number {
  let best = Infinity
  if (points.length === STRIDE) return Math.hypot(points[0] - x, points[1] - y)
  for (let i = STRIDE; i < points.length; i += STRIDE) {
    best = Math.min(best, distanceToSegment(x, y, points[i - STRIDE], points[i - STRIDE + 1], points[i], points[i + 1]))
  }
  return best
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
