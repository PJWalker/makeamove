export interface Oklab {
  L: number
  a: number
  b: number
}

const toLinear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, s)) * 255)
}

/** sRGB channels (0–255) → OKLab. */
export function rgbToOklab(r8: number, g8: number, b8: number): Oklab {
  const [r, g, b] = [r8, g8, b8].map(toLinear)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/** OKLab → sRGB hex, clipping out-of-gamut channels. */
export function oklabToHex({ L, a, b }: Oklab): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3]
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear)
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** sRGB hex → okLCH. Used to tint the UI from a scene colour. */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const { L, a, b } = rgbToOklab(...hexToRgb(hex))
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h }
}

/** Hue (degrees) to drive --scene-hue; greys fall back to a neutral blue. */
export function sceneHueFromHex(hex: string, fallback = 250): number {
  const { c, h } = hexToOklch(hex)
  return c < 0.02 ? fallback : Math.round(h)
}

/** Stable hue for a string, e.g. to colour a member's avatar. */
export function hueFromString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

/**
 * Keep a colour dark and muted enough to sit behind maps and under light UI
 * text: lightness and chroma are capped, hue is kept.
 */
export function backdropColour(hex: string, maxL = 0.34, maxC = 0.07): string {
  const { L, a, b } = rgbToOklab(...hexToRgb(hex))
  const c = Math.hypot(a, b)
  const k = c > maxC ? maxC / c : 1
  return oklabToHex({ L: Math.min(L, maxL), a: a * k, b: b * k })
}

/**
 * The dominant colour of an image, from its RGBA pixels (ideally a 64 × 64
 * thumbnail). Runs k-means in OKLab and returns the biggest cluster that has
 * some colour in it, so a parchment map gives parchment, not its grey ink.
 */
export function dominantColour(rgba: Uint8ClampedArray, k = 5, iterations = 8): string {
  const px: Oklab[] = []
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    px.push(rgbToOklab(rgba[i], rgba[i + 1], rgba[i + 2]))
  }
  if (!px.length) return '#000000'

  // Deterministic seeds spread through the pixels keep results stable.
  let centres = Array.from({ length: Math.min(k, px.length) }, (_, i) => px[Math.floor((i * px.length) / k)])
  let counts: number[] = []
  for (let it = 0; it < iterations; it++) {
    const sums = centres.map(() => ({ L: 0, a: 0, b: 0 }))
    counts = centres.map(() => 0)
    for (const p of px) {
      let best = 0
      let bestD = Infinity
      centres.forEach((c, j) => {
        const d = (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2
        if (d < bestD) {
          bestD = d
          best = j
        }
      })
      sums[best].L += p.L
      sums[best].a += p.a
      sums[best].b += p.b
      counts[best]++
    }
    centres = centres.map((c, j) =>
      counts[j] ? { L: sums[j].L / counts[j], a: sums[j].a / counts[j], b: sums[j].b / counts[j] } : c,
    )
  }

  const order = centres.map((c, j) => ({ c, n: counts[j] })).sort((x, y) => y.n - x.n)
  const colourful = order.find(({ c, n }) => Math.hypot(c.a, c.b) >= 0.03 && n >= px.length * 0.1)
  return oklabToHex((colourful ?? order[0]).c)
}
