import { describe, expect, it } from 'vitest'
import { distanceToStroke, finishStroke, hasRealPressure, strokeOutline } from '../stroke'

describe('strokes', () => {
  it('centres points and pads the box by the width', () => {
    const s = finishStroke([10, 20, 0.5, 30, 60, 0.5], 4)
    expect(s).toMatchObject({ x: 20, y: 40, w: 24, h: 44, bw: 24, bh: 44 })
    expect(s.points).toEqual([-10, -20, 0.5, 10, 20, 0.5])
  })
  it('measures distance to the line', () => {
    expect(distanceToStroke([0, 0, 0.5, 10, 0, 0.5], 5, 3)).toBeCloseTo(3)
    expect(distanceToStroke([0, 0, 0.5], 3, 4)).toBeCloseTo(5)
  })
  it('detects pen pressure', () => {
    expect(hasRealPressure([0, 0, 0.5, 1, 1, 0.5])).toBe(false)
    expect(hasRealPressure([0, 0, 0.3, 1, 1, 0.7])).toBe(true)
  })
  it('produces an outline polygon', () => {
    const o = strokeOutline([0, 0, 0.5, 50, 0, 0.5, 100, 0, 0.5], 8, false)
    expect(o.length).toBeGreaterThan(8)
    expect(o.length % 2).toBe(0)
  })
})
