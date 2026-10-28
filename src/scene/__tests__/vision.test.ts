import { describe, expect, it } from 'vitest'
import { blockingSegments, insidePolygon, lightFalloff, lightSamples, passAlpha, visibilityPolygon, wallEnds } from '../vision'
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

describe('light falloff', () => {
  it('fades smoothly from full at the lamp to nothing at the end of dim light', () => {
    const stops = lightFalloff(20, 40)
    expect(stops[0]).toEqual({ offset: 0, alpha: 1 })
    expect(stops.at(-1)).toEqual({ offset: 1, alpha: 0 })
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].offset).toBeGreaterThan(stops[i - 1].offset)
      expect(stops[i].alpha).toBeLessThanOrEqual(stops[i - 1].alpha)
    }
    // Still nearly full at the edge of bright light, halfway into the reach.
    expect(stops.find((s) => s.offset === 0.5)?.alpha).toBeCloseTo(0.9)
    // No step anywhere: neighbouring stops differ by a fraction.
    for (let i = 1; i < stops.length; i++) expect(stops[i - 1].alpha - stops[i].alpha).toBeLessThan(0.25)
  })

  it('gives a light with no dim reach a short soft edge', () => {
    const stops = lightFalloff(20, 0)
    expect(stops.at(-1)?.alpha).toBe(0)
    expect(stops.find((s) => s.alpha < 0.9 && s.alpha > 0)).toBeDefined()
  })
})

describe('soft shadows', () => {
  it('spreads a lamp’s light over its disc', () => {
    const pts = lightSamples({ x: 0, y: 0 }, 10, [])
    expect(pts).toHaveLength(16)
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(10)
    // Covers the disc rather than bunching at its centre.
    expect(Math.max(...pts.map((p) => Math.hypot(p.x, p.y)))).toBeGreaterThan(8)
  })

  it('keeps a lamp against a wall on its own side', () => {
    const pts = lightSamples({ x: 0, y: 0 }, 10, blockingSegments([wall(3, -50, 3, 50)]))
    for (const p of pts) expect(p.x).toBeLessThan(3)
  })

  it('adds up to the full light where the whole lamp is seen, and part of it in the penumbra', () => {
    const n = 16
    const a = passAlpha(0.8, n)
    expect(1 - Math.pow(1 - a, n)).toBeCloseTo(0.8)
    // Half the lamp in view: the dark lifts part way.
    const half = 1 - Math.pow(1 - a, n / 2)
    expect(half).toBeGreaterThan(0.3)
    expect(half).toBeLessThan(0.8)
    // Full strength never lets one pass clear the dark alone.
    expect(passAlpha(1, n)).toBeLessThan(0.5)
  })

  it('casts a shadow that softens: lit, part-lit, then dark behind a wall’s end', () => {
    // A wall from (50, 0) down; lamp of radius 10 at the origin. Points 200 away behind the wall's end.
    const walls = blockingSegments([wall(50, 0, 50, 400)])
    const pts = lightSamples({ x: 0, y: 0 }, 10, walls)
    const seenBy = (p: { x: number; y: number }) => pts.filter((s) => insidePolygon(visibilityPolygon(s, walls, 1000), p)).length
    const lit = seenBy({ x: 250, y: -60 })
    const edge = seenBy({ x: 250, y: 0 })
    const dark = seenBy({ x: 250, y: 80 })
    expect(lit).toBe(16)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(16)
    expect(dark).toBe(0)
  })
})
