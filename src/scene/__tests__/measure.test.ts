import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID, hexCentre, type Grid } from '../grid'
import { formatDistance, inRange, measure, steps, tokenCells, tokenDistance } from '../measure'

const square: Grid = { ...DEFAULT_GRID, type: 'square', size: 50 }
const hex: Grid = { ...DEFAULT_GRID, type: 'hex', size: 60 }
const none: Grid = { ...DEFAULT_GRID, type: 'none', size: 50 }

/** A token `cells` wide, centred on the cell (i, j) of the square grid (or the intersection for even sizes). */
const token = (i: number, j: number, cells = 1) => {
  const w = cells * 50
  const shift = cells % 2 === 1 ? 25 : 0
  return { x: i * 50 + shift, y: j * 50 + shift, w, h: w, rot: 0 }
}

describe('diagonal rules', () => {
  it('counts every diagonal as one cell', () => {
    expect(steps(3, 2, 'one')).toBe(3)
  })
  it('alternates one and two cells', () => {
    expect(steps(1, 1, 'alternate')).toBe(1)
    expect(steps(2, 2, 'alternate')).toBe(3)
    expect(steps(3, 3, 'alternate')).toBe(4)
    expect(steps(4, 1, 'alternate')).toBe(4)
  })
  it('measures the true distance', () => {
    expect(steps(3, 4, 'euclid')).toBe(5)
  })
})

describe('the ruler', () => {
  it('measures cell to cell in the scene units', () => {
    const m = measure(square, { x: 10, y: 10 }, { x: 160, y: 110 })
    expect(m.distance).toBe(15)
    expect(m.a).toEqual({ x: 25, y: 25 })
    expect(m.b).toEqual({ x: 175, y: 125 })
    expect(measure({ ...square, diagonal: 'alternate' }, { x: 10, y: 10 }, { x: 160, y: 110 }).distance).toBe(20)
  })
  it('counts hexes on a hex grid', () => {
    expect(measure(hex, hexCentre(hex, 0, 0), hexCentre(hex, 3, -1)).distance).toBe(15)
  })
  it('measures straight lines with no grid, a grid size per unit step', () => {
    expect(measure(none, { x: 0, y: 0 }, { x: 300, y: 400 }).distance).toBe(50)
  })
  it('formats distances with their unit', () => {
    expect(formatDistance(square, 15)).toBe('15 ft')
    expect(formatDistance({ ...square, unitName: 'm' }, 21.2132)).toBe('21.2 m')
  })
})

describe('distances between tokens', () => {
  it('finds the cells a token covers', () => {
    expect(tokenCells(square, token(2, 3))).toEqual({ i0: 2, i1: 2, j0: 3, j1: 3 })
    expect(tokenCells(square, token(2, 3, 2))).toEqual({ i0: 1, i1: 2, j0: 2, j1: 3 })
    // A tiny token covers the cell its centre is in.
    expect(tokenCells(square, { x: 120, y: 120, w: 25, h: 25, rot: 0 })).toEqual({ i0: 2, i1: 2, j0: 2, j1: 2 })
  })
  it('puts neighbours 5 ft apart, diagonally too', () => {
    expect(tokenDistance(square, token(0, 0), token(1, 0))).toBe(5)
    expect(tokenDistance(square, token(0, 0), token(1, 1))).toBe(5)
    expect(tokenDistance(square, token(0, 0), token(0, 0))).toBe(0)
  })
  it('measures from the nearest edge of a big token', () => {
    // A Large token covers cells 1–2; a token at cell 6 is 4 cells from its edge.
    expect(tokenDistance(square, token(2, 2, 2), token(6, 1))).toBe(20)
  })
  it('measures edge to edge with no grid', () => {
    const a = { x: 0, y: 0, w: 50, h: 50, rot: 0 }
    expect(tokenDistance(none, a, { ...a, x: 50 })).toBe(0)
    expect(tokenDistance(none, a, { ...a, x: 150 })).toBe(10)
  })
})

describe('range checks', () => {
  it('sorts distances into normal range, long range and out of range', () => {
    expect(inRange(80, { normal: 80, long: 320 })).toBe('normal')
    expect(inRange(85, { normal: 80, long: 320 })).toBe('long')
    expect(inRange(325, { normal: 80, long: 320 })).toBe('out')
    expect(inRange(10, { normal: 5 })).toBe('out')
  })
})
