import { describe, expect, it } from 'vitest'
import { MIN_H, MIN_W, resizeRect } from '../resizeRect'

const start = { x: 100, y: 100, w: 400, h: 300 }

describe('resizeRect', () => {
  it('grows from the east and south edges', () => {
    expect(resizeRect(start, 'se', 20, 30)).toEqual({ x: 100, y: 100, w: 420, h: 330 })
  })
  it('keeps the far edge fixed when resizing from the west or north', () => {
    expect(resizeRect(start, 'nw', 50, 40)).toEqual({ x: 150, y: 140, w: 350, h: 260 })
  })
  it('clamps to the minimum size without moving the far edge', () => {
    const r = resizeRect(start, 'w', 1000, 0)
    expect(r.w).toBe(MIN_W)
    expect(r.x + r.w).toBe(500)
    expect(resizeRect(start, 's', 0, -1000).h).toBe(MIN_H)
  })
  it('rounds to whole pixels', () => {
    expect(resizeRect(start, 'e', 10.6, 0).w).toBe(411)
  })
})
