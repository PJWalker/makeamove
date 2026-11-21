export interface Oklab {
  L: number;
  a: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface OklchRange {
  minLightness: number;
  maxLightness: number;
  maxChroma: number;
}

export const GENERAL_COLOUR_LIMITS: OklchRange = {
  minLightness: 0,
  maxLightness: 1,
  maxChroma: 0.4,
};

export const USER_COLOUR_LIMITS = {
  minLightness: 0.33,
  maxLightness: 0.95,
  maxChroma: 0.25,
} as const;

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const s = v <= 0.003_130_8 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

/** sRGB channels (0–255) → OKLab. */
export function rgbToOklab(r8: number, g8: number, b8: number): Oklab {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l_ = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m_ = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s_ = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  return {
    L: 0.210_454_255_3 * l_ + 0.793_617_785 * m_ - 0.004_072_046_8 * s_,
    a: 1.977_998_495_1 * l_ - 2.428_592_205 * m_ + 0.450_593_709_9 * s_,
    b: 0.025_904_037_1 * l_ + 0.782_771_766_2 * m_ - 0.808_675_766 * s_,
  };
}

function linearRgbFromOklab({ L, a, b }: Oklab): [number, number, number] {
  const l_ = L + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = L - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = L - 0.089_484_177_5 * a - 1.291_485_548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

/** OKLab → sRGB hex, clipping out-of-gamut channels. */
export function oklabToHex(lab: Oklab): string {
  const rgb = linearRgbFromOklab(lab).map(fromLinear);
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const oklchToOklab = ({ l, c, h }: Oklch, chroma = c): Oklab => {
  const angle = (h * Math.PI) / 180;
  return { L: l, a: chroma * Math.cos(angle), b: chroma * Math.sin(angle) };
};

export function clampOklch(colour: Oklch, range: OklchRange): Oklch {
  return {
    l: Math.max(range.minLightness, Math.min(range.maxLightness, colour.l)),
    c: Math.max(0, Math.min(range.maxChroma, colour.c)),
    h: ((colour.h % 360) + 360) % 360,
  };
}

export const clampUserOklch = (colour: Oklch) => clampOklch(colour, USER_COLOUR_LIMITS);

function inSrgbGamut(colour: Oklch, chroma: number) {
  return linearRgbFromOklab(oklchToOklab(colour, chroma)).every(
    (channel) => channel >= -1e-7 && channel <= 1 + 1e-7,
  );
}

/** Highest in-gamut OKLCH chroma at a given lightness and hue, capped by the user range. */
export function maxSrgbChroma(
  lightness: number,
  hue: number,
  maxChroma = GENERAL_COLOUR_LIMITS.maxChroma,
) {
  if (lightness <= 0 || lightness >= 1) return 0;
  const colour = { l: lightness, c: maxChroma, h: hue };
  let low = 0;
  let high: number = maxChroma;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (inSrgbGamut(colour, middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function oklchFromGamutPosition(
  x: number,
  y: number,
  hue: number,
  range: OklchRange = GENERAL_COLOUR_LIMITS,
): Oklch {
  const l =
    range.minLightness + Math.max(0, Math.min(1, y)) * (range.maxLightness - range.minLightness);
  return {
    l,
    c: Math.max(0, Math.min(1, x)) * maxSrgbChroma(l, hue, range.maxChroma),
    h: hue,
  };
}

export function oklchToGamutPosition(colour: Oklch, range: OklchRange = GENERAL_COLOUR_LIMITS) {
  const limited = clampOklch(colour, range);
  const maximum = maxSrgbChroma(limited.l, limited.h, range.maxChroma);
  return {
    x: maximum > 0 ? Math.min(1, limited.c / maximum) : 0,
    y: (limited.l - range.minLightness) / (range.maxLightness - range.minLightness),
  };
}

/** The visible OKLCH selection, reducing chroma at its sRGB gamut boundary. */
export function gamutMappedOklch(colour: Oklch, range: OklchRange = GENERAL_COLOUR_LIMITS): Oklch {
  const limited = clampOklch(colour, range);
  if (inSrgbGamut(limited, limited.c)) return limited;
  return {
    ...limited,
    c: Math.min(limited.c, maxSrgbChroma(limited.l, limited.h, range.maxChroma)),
  };
}

export const gamutMappedUserOklch = (colour: Oklch) => gamutMappedOklch(colour, USER_COLOUR_LIMITS);

export function oklchToGamutHex(colour: Oklch, range: OklchRange = GENERAL_COLOUR_LIMITS): string {
  return oklabToHex(oklchToOklab(gamutMappedOklch(colour, range)));
}

/** The visible sRGB colour for an OKLCH selection. */
export function userColourToHex(colour: Oklch): string {
  return oklchToGamutHex(colour, USER_COLOUR_LIMITS);
}

/** Converts an in-gamut OKLCH value to sRGB. */
export function oklchToSrgbHex(colour: Oklch): string {
  return oklabToHex(oklchToOklab(colour));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Chooses whichever of black or white has the higher WCAG contrast against an sRGB hex colour. */
export function contrastingTextColour(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

/** Clamp a user's sRGB colour to a useful lightness and chroma range. */
export function clampUserColour(hex: string): string {
  return userColourToHex(clampUserOklch(hexToOklch(hex)));
}

/** sRGB hex → okLCH. Used to tint the UI from a scene colour. */
export function hexToOklch(hex: string): Oklch {
  const { L, a, b } = rgbToOklab(...hexToRgb(hex));
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** Full scene OKLCH value, retaining even the hue of near-neutral colours. */
export function sceneOklchFromHex(hex: string): Oklch {
  return hexToOklch(hex);
}

/** Stable hue for a string, e.g. to colour a member's avatar. */
export function hueFromString(s: string): number {
  let hash = 0;
  for (let index = 0; index < s.length; index++) hash = (hash * 31 + s.charCodeAt(index)) | 0;
  return Math.abs(hash) % 360;
}

/**
 * Keep a colour dark and muted enough to sit behind maps and under light UI
 * text: lightness and chroma are capped, hue is kept.
 */
export function backdropColour(hex: string, maxL = 0.34, maxC = 0.07): string {
  const { L, a, b } = rgbToOklab(...hexToRgb(hex));
  const c = Math.hypot(a, b);
  const k = c > maxC ? maxC / c : 1;
  return oklabToHex({ L: Math.min(L, maxL), a: a * k, b: b * k });
}

/**
 * The dominant colour of an image, from its RGBA pixels (ideally a 64 × 64
 * thumbnail). Runs k-means in OKLab and returns the biggest cluster that has
 * some colour in it, so a parchment map gives parchment, not its grey ink.
 */
export function dominantColour(rgba: Uint8ClampedArray, k = 5, iterations = 8): string {
  const px: Oklab[] = [];
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    if (rgba[index + 3]! < 128) continue;
    px.push(rgbToOklab(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!));
  }
  if (px.length === 0) return "#000000";

  // Deterministic seeds spread through the pixels keep results stable.
  const clusterCount = Math.max(1, Math.min(k, px.length));
  let centres = Array.from(
    { length: clusterCount },
    (_, index) => px[Math.floor((index * px.length) / clusterCount)]!,
  );
  let counts: number[] = [];
  for (let it = 0; it < iterations; it++) {
    const sums = centres.map(() => ({ L: 0, a: 0, b: 0 }));
    counts = centres.map(() => 0);
    for (const p of px) {
      let best = 0;
      let bestD = Infinity;
      for (const [index, c] of centres.entries()) {
        const d = (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2;
        if (d < bestD) {
          bestD = d;
          best = index;
        }
      }
      const sum = sums[best]!;
      sum.L += p.L;
      sum.a += p.a;
      sum.b += p.b;
      counts[best] = counts[best]! + 1;
    }
    centres = centres.map((c, index) => {
      const count = counts[index]!;
      const sum = sums[index]!;
      return count ? { L: sum.L / count, a: sum.a / count, b: sum.b / count } : c;
    });
  }

  const order = centres.map((c, index) => ({ c, n: counts[index]! })).sort((x, y) => y.n - x.n);
  const colourful = order.find(({ c, n }) => Math.hypot(c.a, c.b) >= 0.03 && n >= px.length * 0.1);
  return oklabToHex((colourful ?? order[0]!).c);
}
