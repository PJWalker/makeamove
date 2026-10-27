import { describe, expect, it } from 'vitest'
import { blockingSegments, insidePolygon, visibilityPolygon, wallEnds } from '../vision'
import type { SceneElement } from '../types'

const wall = (x1: number, y1: number, x2: number, y2: number, door?: { open: boolean }): SceneElement => ({
  id: `w${x1}${y1}`,
  type: 'wall',
  x: (x1 + x2) / 2,
  y: (y1 + y2) / 2,
  w: Math.hypot(x2 - x1, y2 - y1),
  h: 4,
  rot: Math.atan2(y2 - y1, x2 - x1),
  layer: 'over',
  z: 'a',
  locked: false,
  createdBy: 'gm',
  ...(door ? { door: true, open: door.open } : {}),
})

describe('line of sight', () => {
  it('puts a wall’s ends where it was drawn', () => {
    const ends = wallEnds(wall(0, 0, 100, 100))
    expect(ends.a.x).toBeCloseTo(0)
    expect(ends.b.y).toBeCloseTo(100)
  })

  it('sees round an open room out to the radius', () => {
    const poly = visibilityPolygon({ x: 0, y: 0 }, [], 100)
    expect(insidePolygon(poly, { x: 90, y: 0 })).toBe(true)
    expect(insidePolygon(poly, { x: 110, y: 0 })).toBe(false)
  })

  it('stops at walls, but not at open doors', () => {
    const walls = [wall(50, -200, 50, 200)]
    const poly = visibilityPolygon({ x: 0, y: 0 }, blockingSegments(walls), 500)
    expect(insidePolygon(poly, { x: 40, y: 0 })).toBe(true)
    expect(insidePolygon(poly, { x: 60, y: 0 })).toBe(false)
    // Past the end of the wall is in view.
    expect(insidePolygon(poly, { x: 60, y: 300 })).toBe(true)
    const open = visibilityPolygon({ x: 0, y: 0 }, blockingSegments([wall(50, -200, 50, 200, { open: true })]), 500)
    expect(insidePolygon(open, { x: 60, y: 0 })).toBe(true)
    const shut = visibilityPolygon({ x: 0, y: 0 }, blockingSegments([wall(50, -200, 50, 200, { open: false })]), 500)
    expect(insidePolygon(shut, { x: 60, y: 0 })).toBe(false)
  })

  it('sees through a gap between two walls', () => {
    const walls = [wall(50, -200, 50, -10), wall(50, 10, 50, 200)]
    const poly = visibilityPolygon({ x: 0, y: 0 }, blockingSegments(walls), 500)
    expect(insidePolygon(poly, { x: 200, y: 0 })).toBe(true)
    expect(insidePolygon(poly, { x: 200, y: 100 })).toBe(false)
  })
})
