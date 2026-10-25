import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID, hexAt, hexCentre, hexCellsIn, snapPoint, snapSize, squareLines, type Grid } from '../grid'

const square: Grid = { ...DEFAULT_GRID, type: 'square', size: 50 }
const hex: Grid = { ...DEFAULT_GRID, type: 'hex', size: 60 }

describe('square snapping', () => {
  it('centres odd-sized tokens on a cell', () => {
    expect(snapPoint(square, { x: 12, y: 40 })).toEqual({ x: 25, y: 25 })
    expect(snapPoint(square, { x: 140, y: -10 }, 3)).toEqual({ x: 125, y: -25 })
  })
  it('centres even-sized tokens on an intersection', () => {
    expect(snapPoint(square, { x: 60, y: 30 }, 2)).toEqual({ x: 50, y: 50 })
  })
  it('respects the grid offset', () => {
    expect(snapPoint({ ...square, offsetX: 10, offsetY: 5 }, { x: 12, y: 8 })).toEqual({ x: 35, y: 30 })
  })
  it('leaves points alone without a grid', () => {
    expect(snapPoint({ ...square, type: 'none' }, { x: 12.5, y: 3 })).toEqual({ x: 12.5, y: 3 })
  })
  it('rounds sizes to whole cells, at least one', () => {
    expect(snapSize(square, 20)).toBe(50)
    expect(snapSize(square, 130)).toBe(150)
  })
})

describe('hex grids', () => {
  it('round-trips centres through hexAt', () => {
    for (const [q, r] of [[0, 0], [3, -2], [-4, 5], [1, 1]]) {
      expect(hexAt(hex, hexCentre(hex, q, r))).toEqual({ q, r })
    }
  })
  it('puts neighbours in a row `size` apart', () => {
    const a = hexCentre(hex, 0, 0)
    const b = hexCentre(hex, 1, 0)
    expect(b.x - a.x).toBeCloseTo(60)
    expect(b.y).toBeCloseTo(a.y)
  })
  it('snaps points near a centre to it', () => {
    const c = hexCentre(hex, 2, 1)
    const s = snapPoint(hex, { x: c.x + 8, y: c.y - 9 })
    expect(s.x).toBeCloseTo(c.x)
    expect(s.y).toBeCloseTo(c.y)
  })
  it('lists cells covering a view', () => {
    const view = { x: -100, y: -100, w: 200, h: 200 }
    const cells = hexCellsIn(hex, view)
    // Every hex whose centre is in view must be listed.
    for (let x = -100; x <= 100; x += 10) {
      for (let y = -100; y <= 100; y += 10) {
        const { q, r } = hexAt(hex, { x, y })
        expect(cells.some((c) => c.q === q && c.r === r)).toBe(true)
      }
    }
  })
})

describe('square lines', () => {
  it('covers the view', () => {
    const { xs, ys } = squareLines(square, { x: -30, y: 10, w: 100, h: 60 })
    expect(xs).toEqual([-50, 0, 50])
    expect(ys).toEqual([0, 50])
  })
})
