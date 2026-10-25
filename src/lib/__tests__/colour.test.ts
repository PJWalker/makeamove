import { describe, expect, it } from 'vitest'
import { backdropColour, dominantColour, hexToOklch, oklabToHex, rgbToOklab, sceneHueFromHex } from '../colour'

describe('colour', () => {
  it('round-trips sRGB through OKLab', () => {
    for (const hex of ['#000000', '#ffffff', '#2b3a55', '#c08a3e', '#ff0000']) {
      const n = parseInt(hex.slice(1), 16)
      expect(oklabToHex(rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255))).toBe(hex)
    }
  })
  it('gives white no chroma', () => {
    expect(hexToOklch('#ffffff').c).toBeLessThan(0.001)
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 3)
  })
  it('falls back to a neutral hue for greys', () => {
    expect(sceneHueFromHex('#808080')).toBe(250)
  })
  it('darkens backdrops but keeps their hue', () => {
    const out = backdropColour('#e8c890')
    expect(hexToOklch(out).l).toBeLessThanOrEqual(0.345)
    expect(Math.abs(hexToOklch(out).h - hexToOklch('#e8c890').h)).toBeLessThan(4)
  })
  it('finds the dominant colourful cluster', () => {
    // 70% parchment, 30% dark grey ink.
    const px: number[] = []
    for (let i = 0; i < 100; i++) px.push(...(i < 70 ? [232, 200, 144, 255] : [40, 40, 40, 255]))
    expect(dominantColour(new Uint8ClampedArray(px))).toBe('#e8c890')
  })
})
