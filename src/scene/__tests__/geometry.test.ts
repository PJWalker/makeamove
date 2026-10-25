import { describe, expect, it } from 'vitest'
import { bounds, corners, hits, resizeFromCorner, rotationTowards, toLocal } from '../geometry'
import { finishStroke } from '../stroke'
import type { DrawingElement, MapElement, TokenElement } from '../types'

const base = { id: 'a', z: 'a0', locked: false, createdBy: 'me' }
const image = { hash: 'h', mime: 'image/webp', width: 200, height: 100 }
const map: MapElement = { ...base, type: 'map', layer: 'map', image, x: 100, y: 50, w: 200, h: 100, rot: 0 }

describe('transforms', () => {
  it('finds corners of a rotated rectangle', () => {
    const c = corners({ x: 0, y: 0, w: 20, h: 10, rot: Math.PI / 2 })
    expect(c[0].x).toBeCloseTo(5)
    expect(c[0].y).toBeCloseTo(-10)
  })
  it('measures bounds', () => {
    expect(bounds([map])).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })
  it('maps world points into the local frame', () => {
    const l = toLocal({ x: 10, y: 10, w: 4, h: 4, rot: Math.PI }, { x: 12, y: 10 })
    expect(l.x).toBeCloseTo(-2)
    expect(l.y).toBeCloseTo(0)
  })
})

describe('hit testing', () => {
  it('hits rectangles', () => {
    expect(hits(map, { x: 5, y: 5 })).toBe(true)
    expect(hits(map, { x: 205, y: 5 })).toBe(false)
    expect(hits(map, { x: 205, y: 5 }, 6)).toBe(true)
  })
  it('hits tokens as circles', () => {
    const token: TokenElement = { ...base, type: 'token', layer: 'token', name: '', colour: '#fff', x: 0, y: 0, w: 70, h: 70, rot: 0 }
    expect(hits(token, { x: 30, y: 0 })).toBe(true)
    expect(hits(token, { x: 30, y: 30 })).toBe(false)
  })
  it('hits plain image tokens across their whole square', () => {
    const token: TokenElement = { ...base, type: 'token', layer: 'token', name: '', colour: '#fff', image, style: 'plain', x: 0, y: 0, w: 70, h: 70, rot: 0 }
    expect(hits(token, { x: 30, y: 30 })).toBe(true)
    // Without an image a plain token still draws, and hits, as a disc.
    expect(hits({ ...token, image: undefined }, { x: 30, y: 30 })).toBe(false)
  })
  it('hits drawings near the line only', () => {
    const geo = finishStroke([0, 0, 0.5, 100, 0, 0.5, 100, 100, 0.5], 10)
    const d: DrawingElement = { ...base, type: 'drawing', layer: 'over', colour: '#fff', width: 10, ...geo }
    expect(hits(d, { x: 50, y: 3 })).toBe(true)
    expect(hits(d, { x: 50, y: 50 })).toBe(false)
    // Still hits after the drawing is scaled up.
    expect(hits({ ...d, w: d.w * 2, h: d.h * 2 }, { x: 0, y: -48 })).toBe(true)
  })
})

describe('resizing and rotating', () => {
  it('keeps the opposite corner fixed', () => {
    const t = resizeFromCorner(map, 2, { x: 300, y: 150 }, false)
    expect(t).toMatchObject({ x: 150, y: 75, w: 300, h: 150 })
  })
  it('keeps the aspect ratio when asked', () => {
    const t = resizeFromCorner(map, 2, { x: 400, y: 120 }, true)
    expect(t.w / t.h).toBeCloseTo(2)
    expect(t.w).toBeCloseTo(400)
  })
  it('works on rotated shapes', () => {
    const r = { ...map, x: 0, y: 0, rot: Math.PI / 2 }
    const before = corners(r)[0]
    const t = resizeFromCorner(r, 2, { x: -100, y: 150 }, false)
    const after = corners(t)[0]
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('rotates to face a point, in steps', () => {
    expect(rotationTowards(map, { x: 100, y: 0 })).toBeCloseTo(0)
    expect(rotationTowards(map, { x: 200, y: 50 })).toBeCloseTo(Math.PI / 2)
    expect(rotationTowards(map, { x: 200, y: 45 }, 15)).toBeCloseTo(Math.PI / 2)
  })
})
