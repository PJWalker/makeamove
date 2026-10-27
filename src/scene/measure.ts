import { type DiagonalRule, type Grid, type Point, hexAt, hexCentre } from './grid'
import type { Transform } from './types'

/*
 * Distances on a scene, in the scene's units (see design, "D&D 5.5e plugin
 * and a general rules engine", core change 7). On a square grid, distances
 * count cells, with the scene's rule for diagonals; hex grids count hexes;
 * with no grid, distances are straight lines, at the grid size per unit
 * step.
 */

/** How many cells a move of di × dj cells counts as. */
export function steps(di: number, dj: number, rule: DiagonalRule): number {
  const a = Math.abs(di)
  const b = Math.abs(dj)
  if (rule === 'euclid') return Math.hypot(a, b)
  const long = Math.max(a, b)
  const short = Math.min(a, b)
  return rule === 'alternate' ? long + Math.floor(short / 2) : long
}

/** The square cell containing p. */
export function cellAt(grid: Grid, p: Point): { i: number; j: number } {
  return { i: Math.floor((p.x - grid.offsetX) / grid.size), j: Math.floor((p.y - grid.offsetY) / grid.size) }
}

export const cellCentre = (grid: Grid, i: number, j: number): Point => ({
  x: grid.offsetX + (i + 0.5) * grid.size,
  y: grid.offsetY + (j + 0.5) * grid.size,
})

/** Hexes between two hexes in axial coordinates. */
export const hexSteps = (a: { q: number; r: number }, b: { q: number; r: number }) => {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export interface Measure {
  /** Distance in the scene's units. */
  distance: number
  /** The points measured between: cell centres on a grid. */
  a: Point
  b: Point
}

/** The distance between two points, cell to cell on a grid. */
export function measure(grid: Grid, a: Point, b: Point): Measure {
  if (grid.type === 'square') {
    const ca = cellAt(grid, a)
    const cb = cellAt(grid, b)
    return {
      distance: steps(cb.i - ca.i, cb.j - ca.j, grid.diagonal) * grid.unit,
      a: cellCentre(grid, ca.i, ca.j),
      b: cellCentre(grid, cb.i, cb.j),
    }
  }
  if (grid.type === 'hex') {
    const ha = hexAt(grid, a)
    const hb = hexAt(grid, b)
    return { distance: hexSteps(ha, hb) * grid.unit, a: hexCentre(grid, ha.q, ha.r), b: hexCentre(grid, hb.q, hb.r) }
  }
  return { distance: (Math.hypot(b.x - a.x, b.y - a.y) / grid.size) * grid.unit, a, b }
}

/**
 * The cells a token covers, as inclusive ranges. A token smaller than a cell
 * covers the cell its centre is in.
 */
export function tokenCells(grid: Grid, t: Transform) {
  const span = (centre: number, size: number, offset: number) => {
    const lo = Math.round((centre - size / 2 - offset) / grid.size)
    const hi = Math.round((centre + size / 2 - offset) / grid.size) - 1
    if (hi >= lo) return [lo, hi]
    const c = Math.floor((centre - offset) / grid.size)
    return [c, c]
  }
  const [i0, i1] = span(t.x, t.w, grid.offsetX)
  const [j0, j1] = span(t.y, t.h, grid.offsetY)
  return { i0, i1, j0, j1 }
}

/**
 * The distance between two tokens, edge to edge, in the scene's units.
 * On a grid, tokens in neighbouring cells are one cell apart (5 ft); with no
 * grid, touching tokens are 0 apart.
 */
export function tokenDistance(grid: Grid, a: Transform, b: Transform): number {
  if (grid.type === 'square') {
    const p = tokenCells(grid, a)
    const q = tokenCells(grid, b)
    const di = Math.max(0, q.i0 - p.i1, p.i0 - q.i1)
    const dj = Math.max(0, q.j0 - p.j1, p.j0 - q.j1)
    return steps(di, dj, grid.diagonal) * grid.unit
  }
  if (grid.type === 'hex') {
    // A big token reaches about half its width in hexes from its centre.
    const reach = (t: Transform) => Math.floor(Math.round(Math.max(t.w, t.h) / grid.size) / 2)
    const d = hexSteps(hexAt(grid, a), hexAt(grid, b)) - reach(a) - reach(b)
    return Math.max(d, 0) * grid.unit
  }
  const gap = Math.hypot(b.x - a.x, b.y - a.y) - Math.max(a.w, a.h) / 2 - Math.max(b.w, b.h) / 2
  return (Math.max(0, gap) / grid.size) * grid.unit
}

/** "30 ft"; a decimal place only when the distance isn't whole. */
export function formatDistance(grid: Grid, distance: number): string {
  return `${Math.round(distance * 10) / 10} ${grid.unitName}`.trim()
}

/** A range: up to `normal`, or out to `long` at a cost (5.5e: disadvantage). */
export interface Range {
  normal: number
  long?: number
}

/** Whether a distance is within a range, at long range, or out of it. */
export function inRange(distance: number, range: Range): 'normal' | 'long' | 'out' {
  if (distance <= range.normal) return 'normal'
  if (range.long !== undefined && distance <= range.long) return 'long'
  return 'out'
}
