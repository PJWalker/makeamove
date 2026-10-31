/*
 * Grid maths. Square grids are axis-aligned cells of `size` px. Hex grids are
 * pointy-topped, with `size` as the distance between neighbouring centres in
 * a row (the hex's width), so a 70 px hex grid and a 70 px square grid hold
 * tokens of the same size.
 */

export type GridType = 'none' | 'square' | 'hex'

/**
 * How a square grid counts a diagonal step: always one cell (5.5e's default),
 * alternately one and two cells, or its true length.
 */
export type DiagonalRule = 'one' | 'alternate' | 'euclid'

export interface Grid {
  type: GridType
  size: number
  offsetX: number
  offsetY: number
  /** How far one cell is, in `unitName`s: 5 ft. */
  unit: number
  unitName: string
  diagonal: DiagonalRule
}

export const DEFAULT_GRID: Grid = { type: 'square', size: 70, offsetX: 0, offsetY: 0, unit: 5, unitName: 'ft', diagonal: 'one' }
export const MIN_GRID_SIZE = 10

export interface Point {
  x: number
  y: number
}

const SQRT3 = Math.sqrt(3)

/** Circumradius of a hex whose width is `size`. */
export const hexRadius = (size: number) => size / SQRT3

/** Centre of the hex at axial coordinates (q, r). */
export function hexCentre(grid: Grid, q: number, r: number): Point {
  const R = hexRadius(grid.size)
  return { x: grid.offsetX + R * (SQRT3 * q + (SQRT3 / 2) * r), y: grid.offsetY + R * 1.5 * r }
}

/** Axial coordinates of the hex containing point p. */
export function hexAt(grid: Grid, p: Point): { q: number; r: number } {
  const R = hexRadius(grid.size)
  const x = p.x - grid.offsetX
  const y = p.y - grid.offsetY
  const fq = ((SQRT3 / 3) * x - y / 3) / R
  const fr = ((2 / 3) * y) / R
  // Round in cube coordinates, then fix the component with the largest error.
  const fs = -fq - fr
  let q = Math.round(fq)
  let r = Math.round(fr)
  const s = Math.round(fs)
  const dq = Math.abs(q - fq)
  const dr = Math.abs(r - fr)
  const ds = Math.abs(s - fs)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return { q: q + 0, r: r + 0 }
}

/** Corners of a pointy-topped hex, clockwise from the upper right. */
export function hexCorners(c: Point, size: number): Point[] {
  const R = hexRadius(size)
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) }
  })
}

/**
 * Where a token `cells` wide should sit if dropped at p. Odd-sized tokens
 * centre on a cell; even-sized ones centre on a grid intersection, so their
 * edges line up with the grid. Hex grids always snap to a hex centre.
 */
export function snapPoint(grid: Grid, p: Point, cells = 1): Point {
  if (grid.type === 'none') return p
  if (grid.type === 'hex') {
    const { q, r } = hexAt(grid, p)
    return hexCentre(grid, q, r)
  }
  const half = Math.round(cells) % 2 === 1 ? grid.size / 2 : 0
  const snap = (v: number, offset: number) =>
    offset + half + Math.round((v - offset - half) / grid.size) * grid.size
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) }
}

/** Round a token's size to a whole number of cells (at least one). */
export function snapSize(grid: Grid, size: number): number {
  if (grid.type === 'none') return size
  return Math.max(1, Math.round(size / grid.size)) * grid.size
}

/** Lines of a square grid covering a world-space rectangle. */
export function squareLines(grid: Grid, view: { x: number; y: number; w: number; h: number }) {
  const { size, offsetX, offsetY } = grid
  const xs: number[] = []
  const ys: number[] = []
  for (let x = offsetX + Math.floor((view.x - offsetX) / size) * size; x <= view.x + view.w; x += size) xs.push(x)
  for (let y = offsetY + Math.floor((view.y - offsetY) / size) * size; y <= view.y + view.h; y += size) ys.push(y)
  return { xs, ys }
}

/**
 * Hex cells whose shapes may overlap a world-space rectangle. Rows are
 * shifted half a hex per row in axial coordinates, so each row's q range is
 * computed separately.
 */
export function hexCellsIn(grid: Grid, view: { x: number; y: number; w: number; h: number }) {
  const R = hexRadius(grid.size)
  const r0 = Math.floor((view.y - grid.offsetY - R) / (1.5 * R)) - 1
  const r1 = Math.ceil((view.y + view.h - grid.offsetY + R) / (1.5 * R)) + 1
  const cells: { q: number; r: number }[] = []
  for (let r = r0; r <= r1; r++) {
    const rowShift = (SQRT3 / 2) * r * R
    const q0 = Math.floor((view.x - grid.offsetX - rowShift) / grid.size) - 1
    const q1 = Math.ceil((view.x + view.w - grid.offsetX - rowShift) / grid.size) + 1
    for (let q = q0; q <= q1; q++) cells.push({ q, r })
  }
  return cells
}

export const DIAGONAL_RULES: { id: DiagonalRule; label: string; title: string }[] = [
  { id: "one", label: "1", title: "Every diagonal step is one cell" },
  {
    id: "alternate",
    label: "1, 2, 1",
    title: "Diagonal steps alternate between one and two cells",
  },
  { id: "euclid", label: "√2", title: "Measure the true distance" },
];

export const GRID_TYPES: { id: GridType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'square', label: 'Square' },
  { id: 'hex', label: 'Hex' },
]
