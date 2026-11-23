/* eslint-disable @typescript-eslint/no-magic-numbers */
import { seededRandom } from "../lib/seededRandom";

/*
 * The shapes the cave's painted splats are drawn with: a strip of brush
 * strokes, worked out once rather than for every pixel of every frame. Each
 * runs left to right across its cell, the way it's painted in: a loaded,
 * ragged-edged start, bristle streaks along its length, narrowing and
 * breaking up into dry brush as the paint runs out. Its alpha fills the
 * ellipse inscribed in the cell, so the cell's corners are always clear.
 */

/** How many different strokes there are, side by side. */
export const BRUSHES = 8;
/** The size of each stroke's cell, in texels. */
export const BRUSH = { width: 128, height: 64 };

const fract = (value: number) => value - Math.floor(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** A repeatable number in [0, 1) for a point. */
function grain(x: number, y: number) {
  const a = fract(x * 0.1031);
  const b = fract(y * 0.103);
  const c = fract(x * 0.0973);
  const shift = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  return fract((a + shift + (b + shift)) * (c + shift));
}

/** One stroke's alpha, from 0 to 1, at a point of its cell (x and y from -1 to 1). */
function stroke([x, y]: [number, number], texel: [number, number], phases: readonly number[]) {
  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = phases;
  // Narrower towards the end, so it tapers off.
  const across = y / (1 - 0.38 * smoothstep(-0.3, 1, x));
  const angle = Math.atan2(across, x);
  const ragged =
    Math.sin(angle * 9 + p0 * 41) * 0.026 +
    Math.sin(angle * 21 - p1 * 67) * 0.018 +
    Math.sin(angle * 37 + p2 * 113) * 0.008;
  const radial = x * x + across * across;
  const edge = 1 - smoothstep(0.62 + ragged, 0.96 + ragged, radial);
  if (edge <= 0) return 0;
  // Streaks along the stroke, wavering a little, one per bristle.
  const streak = Math.sin(across * 19 + p3 * 47 + 0.5 * Math.sin(x * 2.7 + p0 * 9));
  const bristles = 0.68 + 0.32 * smoothstep(-0.35, 0.75, streak);
  // Paint running out towards the end: the streaks break up into dry gaps.
  const dry = smoothstep(0.05, 0.95, x);
  const fibre = grain(Math.floor((across + 1) * 40) + p1 * 311, 7 + p2 * 127);
  const gaps = 1 - dry * (1 - smoothstep(dry * 0.55, dry * 0.55 + 0.3, fibre * 0.7 + bristles * 0.3));
  const speckle = 0.84 + 0.16 * grain(texel[0] + p0 * 97, texel[1] + p3 * 53);
  const loaded = 1 + 0.12 * (1 - smoothstep(-1, -0.3, x));
  return clamp01(edge * bristles * gaps * speckle * loaded);
}

/** The strip of strokes, as single-channel bytes, BRUSHES cells wide. */
export function brushAtlas(seed = "brushes"): Uint8Array {
  const random = seededRandom(seed);
  const width = BRUSH.width * BRUSHES;
  const texels = new Uint8Array(width * BRUSH.height);
  for (let brush = 0; brush < BRUSHES; brush++) {
    const phases = [random(), random(), random(), random()];
    for (let row = 0; row < BRUSH.height; row++) {
      const y = ((row + 0.5) / BRUSH.height) * 2 - 1;
      for (let column = 0; column < BRUSH.width; column++) {
        const x = ((column + 0.5) / BRUSH.width) * 2 - 1;
        const alpha = stroke([x, y], [column, row], phases);
        texels[row * width + brush * BRUSH.width + column] = Math.round(alpha * 255);
      }
    }
  }
  return texels;
}
