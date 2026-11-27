import type { Greyscale } from "./greyscale";
import firstPeak from "./peaks";

/*
 * Finding a square grid drawn on a map image. Grid lines make the image
 * line-like at regular steps across and down, so each column (and row) gets
 * a score for how line-like it is, the step that score repeats at is found
 * by autocorrelation, and then each line is found near where that step puts
 * it, and a straight fit through them gives the spacing to a fraction of a
 * pixel. A square grid repeats at the same step both ways.
 */

/** A square grid found in an image, in the image's own px: its spacing, and where two of its lines cross. */
export interface ImageGrid {
  /** The image's width, which these are measured against. */
  width: number;
  cell: number;
  x: number;
  y: number;
}

/** Lines along one axis: their spacing, and where one of them is, in analysis px. */
interface Lines {
  spacing: number;
  offset: number;
}

/** Fewest analysis px between lines. */
const MIN_CELL = 6;
/** Fewest lines the spacing must repeat over. */
const MIN_LINES = 4;
/** How strongly the line scores must repeat at the spacing: 1 for perfectly, 0 for not at all. */
const MIN_STRENGTH = 0.2;
/** A repeat this near as strong as the strongest counts: the spacing is the first one. */
const PEAK_SHARE = 0.75;
/** How far apart the spacings across and down may be, as a share of them, for a square grid. */
const SQUARE_TOLERANCE = 0.02;
/** Px either side a pixel is compared with, to tell if it's on a line. */
const LINE_REACH = 2;
/** Of a spacing, how far from where a line should be to look for it. */
const SEARCH_SHARE = 0.25;
const HALF = 0.5;
const FIT_ROUNDS = 3;
/** Px a line may be from where the fit so far puts it, after the first fit. */
const OFF_LINE = 1;

/**
 * How line-like each column (`across`) or row is: how far each pixel's
 * brightness is from the average of those LINE_REACH px either side,
 * summed along it. A line, light or dark, scores highly; a smooth area or
 * an edge between two areas scores little.
 */
export function lineProfile(g: Greyscale, across: boolean): Float64Array {
  const { width, height, data } = g;
  const n = across ? width : height;
  const along = across ? height : width;
  const step = across ? 1 : width;
  const stride = across ? width : 1;
  const profile = new Float64Array(n);
  for (let index = LINE_REACH; index < n - LINE_REACH; index++) {
    let sum = 0;
    for (let j = 0; j < along; j++) {
      const at = index * step + j * stride;
      const side = (data[at - LINE_REACH * step]! + data[at + LINE_REACH * step]!) * HALF;
      sum += Math.abs(data[at]! - side);
    }
    profile[index] = sum;
  }
  return profile;
}

/** How strongly `profile` repeats at each step up to `maxLag`: 1 for perfectly. */
function repeatScores(profile: Float64Array, maxLag: number): number[] {
  const n = profile.length;
  const mean = profile.reduce((sum, v) => sum + v, 0) / n;
  const centred = profile.map((v) => v - mean);
  const energy = centred.reduce((sum, v) => sum + v * v, 0);
  if (energy === 0) return [];
  const scores: number[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let index = 0; index + lag < n; index++) sum += centred[index]! * centred[index + lag]!;
    // Longer steps overlap less of the profile: weigh them up to match.
    scores.push(((sum / energy) * n) / (n - lag));
  }
  return scores;
}

/** The step `profile` repeats at, to a whole px, or null if it doesn't clearly repeat. */
function repeatStep(profile: Float64Array): number | null {
  const scores = repeatScores(profile, Math.floor(profile.length / MIN_LINES));
  // A line is like itself a little way along: look past where that stops.
  const pastSelf = scores.findIndex((score) => score <= 0);
  if (pastSelf === -1) return null;
  const start = Math.max(MIN_CELL, pastSelf);
  const strongest = Math.max(...scores.slice(start));
  if (!(strongest >= MIN_STRENGTH)) return null;
  const step = firstPeak(scores, start, strongest * PEAK_SHARE);
  return step === -1 ? null : step;
}

/** Where the peak of `profile` near `around` is, to a fraction of a px. */
function peakNear(profile: Float64Array, around: number, reach: number): number | null {
  const from = Math.max(1, Math.round(around - reach));
  const last = profile.length - 1;
  const to = Math.min(last - 1, Math.round(around + reach));
  if (from > to) return null;
  let best = from;
  for (let index = from + 1; index <= to; index++)
    if (profile[index]! > profile[best]!) best = index;
  // A parabola through the peak and its neighbours puts it between px.
  const left = profile[best - 1]!;
  const right = profile[best + 1]!;
  const middle = profile[best]!;
  const curve = left + right - middle - middle;
  return best + HALF + (curve < 0 ? ((left - right) * HALF) / curve : 0);
}

/** The straight line through points (k, at), by least squares: where it starts, and its slope. */
function fit(points: [number, number][]): Lines {
  const n = points.length;
  const meanK = points.reduce((sum, [k]) => sum + k, 0) / n;
  const meanAt = points.reduce((sum, [, at]) => sum + at, 0) / n;
  let spread = 0;
  let together = 0;
  for (const [k, at] of points) {
    spread += (k - meanK) * (k - meanK);
    together += (k - meanK) * (at - meanAt);
  }
  const spacing = together / spread;
  return { spacing, offset: meanAt - spacing * meanK };
}

/** Lines repeating across `profile`, to a fraction of a px, or null if there aren't any. */
function findLines(profile: Float64Array): Lines | null {
  const step = repeatStep(profile);
  if (step === null) return null;
  // Where the lines fall within a step: where the profile, folded at the step, peaks.
  const folded = new Float64Array(step);
  for (const [index, v] of profile.entries()) folded[index % step]! += v;
  let lines: Lines = { spacing: step, offset: folded.indexOf(Math.max(...folded)) + HALF };
  for (let round = 0; round < FIT_ROUNDS; round++) {
    const points: [number, number][] = [];
    const reach = lines.spacing * SEARCH_SHARE;
    const first = Math.ceil(-lines.offset / lines.spacing);
    for (let k = first; lines.offset + k * lines.spacing < profile.length; k++) {
      const expected = lines.offset + k * lines.spacing;
      const at = peakNear(profile, expected, reach);
      // After the first fit, a peak well off the line is something else on the map.
      if (at !== null && (round === 0 || Math.abs(at - expected) <= OFF_LINE)) points.push([k, at]);
    }
    if (points.length < MIN_LINES) return null;
    lines = fit(points);
  }
  return lines;
}

/** The square grid drawn on an image, if it has one. */
export function detectSquareGrid(g: Greyscale): ImageGrid | null {
  const across = findLines(lineProfile(g, true));
  const down = findLines(lineProfile(g, false));
  if (!across || !down) return null;
  const larger = Math.max(across.spacing, down.spacing);
  if (Math.abs(across.spacing - down.spacing) > larger * SQUARE_TOLERANCE) return null;
  const cell = (across.spacing + down.spacing) * HALF;
  return {
    width: g.width * g.scale,
    cell: cell * g.scale,
    x: (((across.offset % cell) + cell) % cell) * g.scale,
    y: (((down.offset % cell) + cell) % cell) * g.scale,
  };
}
