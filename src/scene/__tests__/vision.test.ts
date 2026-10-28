import { describe, expect, it } from 'vitest'
import { blocked, blockingSegments, lampHidden, lightAlpha, lightReach, tokenBlocker, wallEnds } from '../vision'
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

  it('stops at walls, but not at open doors', () => {
    const o = { x: 0, y: 0 }
    const walls = blockingSegments([wall(50, -200, 50, 200)])
    expect(blocked(o, { x: 40, y: 0 }, walls)).toBe(false)
    expect(blocked(o, { x: 60, y: 0 }, walls)).toBe(true)
    // Past the end of the wall is in view.
    expect(blocked(o, { x: 60, y: 300 }, walls)).toBe(false)
    expect(blocked(o, { x: 60, y: 0 }, blockingSegments([wall(50, -200, 50, 200, { open: true })]))).toBe(false)
    expect(blocked(o, { x: 60, y: 0 }, blockingSegments([wall(50, -200, 50, 200, { open: false })]))).toBe(true)
  })

  it('sees through a gap between two walls', () => {
    const walls = blockingSegments([wall(50, -200, 50, -10), wall(50, 10, 50, 200)])
    expect(blocked({ x: 0, y: 0 }, { x: 200, y: 0 }, walls)).toBe(false)
    expect(blocked({ x: 0, y: 0 }, { x: 200, y: 100 }, walls)).toBe(true)
  })
})

describe('light falloff', () => {
  it('fades smoothly from full at the lamp to nothing at the end of dim light', () => {
    expect(lightAlpha(20, 40, 0)).toBe(1)
    expect(lightAlpha(20, 40, 40)).toBe(0)
    // Still nearly full at the edge of bright light.
    expect(lightAlpha(20, 40, 20)).toBeCloseTo(0.9)
    let last = 1
    for (let d = 0; d <= 40; d += 0.5) {
      const a = lightAlpha(20, 40, d)
      expect(a).toBeLessThanOrEqual(last)
      // No step anywhere.
      expect(last - a).toBeLessThan(0.05)
      last = a
    }
  })

  it('gives a light with no dim reach a short soft edge', () => {
    expect(lightReach(20, 0)).toBeGreaterThan(20)
    expect(lightAlpha(20, 0, 21)).toBeGreaterThan(0)
    expect(lightAlpha(20, 0, 21)).toBeLessThan(0.9)
    expect(lightAlpha(20, 0, lightReach(20, 0))).toBe(0)
  })
})

describe('soft shadows', () => {
  const lamp = { x: 0, y: 0 }
  const hidden = (p: { x: number; y: number }, walls: ReturnType<typeof blockingSegments>, r = 10) =>
    Math.min(1, walls.reduce((sum, s) => sum + lampHidden(p, lamp, r, s), 0))

  it('hides nothing on the lamp’s side of a wall, and all of it well behind', () => {
    const walls = blockingSegments([wall(50, -400, 50, 400)])
    expect(hidden({ x: 30, y: 10 }, walls)).toBe(0)
    expect(hidden({ x: 200, y: 0 }, walls)).toBeCloseTo(1)
  })

  it('keeps a lamp against a wall on its own side', () => {
    const walls = blockingSegments([wall(3, -50, 3, 50)])
    expect(hidden({ x: 5, y: 0 }, walls)).toBeCloseTo(1)
    expect(hidden({ x: 1, y: 0 }, walls)).toBe(0)
  })

  it('casts a shadow that softens: lit, part-lit, then dark behind a wall’s end', () => {
    // A wall from (50, 0) down; lamp of radius 10 at the origin. Points 200 away behind the wall's end.
    const walls = blockingSegments([wall(50, 0, 50, 400)])
    expect(hidden({ x: 250, y: -60 }, walls)).toBe(0)
    const edge = hidden({ x: 250, y: 0 }, walls)
    expect(edge).toBeGreaterThan(0.3)
    expect(edge).toBeLessThan(0.7)
    expect(hidden({ x: 250, y: 80 }, walls)).toBeCloseTo(1)
    // A sharper lamp, a narrower penumbra.
    expect(hidden({ x: 250, y: 20 }, walls, 2)).toBeGreaterThan(hidden({ x: 250, y: 20 }, walls, 10))
  })

  it('casts one unbroken shadow from walls that meet end to end', () => {
    const walls = blockingSegments([wall(50, -200, 50, 0), wall(50, 0, 50, 200)])
    for (const y of [-20, -5, 0, 5, 20]) expect(hidden({ x: 250, y }, walls)).toBeCloseTo(1)
  })

  it('sees through a gap between two walls', () => {
    const walls = blockingSegments([wall(50, -200, 50, -10), wall(50, 10, 50, 200)])
    expect(hidden({ x: 150, y: 0 }, walls, 1)).toBeLessThan(0.1)
  })
})

describe('tokenBlocker', () => {
  it('stands across the token’s back edge, square to the light, and fades out past it', () => {
    const b = tokenBlocker({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)!
    expect(b.seg.a.x).toBeCloseTo(110)
    expect(b.seg.b.x).toBeCloseTo(110)
    expect(Math.abs(b.seg.a.y - b.seg.b.y)).toBeGreaterThan(14)
    expect(b.fade[0]).toBeCloseTo(112)
    expect(b.fade[1]).toBeCloseTo(136)
    // Hides the lamp from behind the token, not from beside it.
    expect(lampHidden({ x: 120, y: 0 }, { x: 0, y: 0 }, 5, b.seg)).toBeCloseTo(1)
    expect(lampHidden({ x: 120, y: 30 }, { x: 0, y: 0 }, 5, b.seg)).toBe(0)
  })

  it('is null when the light is inside the token', () => {
    expect(tokenBlocker({ x: 0, y: 0 }, { x: 5, y: 0 }, 20)).toBeNull()
  })
})
