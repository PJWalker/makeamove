import { describe, expect, it } from 'vitest'
import { fitCamera, MAX_ZOOM, toScreen, toWorld, visibleWorld, zoomAt } from '../camera'

describe('camera', () => {
  it('converts between screen and world', () => {
    const cam = { x: 100, y: -50, zoom: 2 }
    const w = toWorld(cam, { x: 300, y: 150 })
    expect(w).toEqual({ x: 100, y: 100 })
    expect(toScreen(cam, w)).toEqual({ x: 300, y: 150 })
  })
  it('keeps the point under the cursor fixed when zooming', () => {
    const cam = { x: 40, y: 20, zoom: 1.5 }
    const at = { x: 320, y: 200 }
    const before = toWorld(cam, at)
    const after = toWorld(zoomAt(cam, at, 1.7), at)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('clamps zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 7 }, { x: 0, y: 0 }, 4).zoom).toBe(MAX_ZOOM)
  })
  it('fits bounds in the middle of the viewport', () => {
    const cam = fitCamera({ x: 0, y: 0, w: 1000, h: 500 }, 600, 400, 50)
    expect(cam.zoom).toBeCloseTo(0.5)
    const view = visibleWorld(cam, 600, 400)
    expect(view.x + view.w / 2).toBeCloseTo(500)
    expect(view.y + view.h / 2).toBeCloseTo(250)
  })
})
