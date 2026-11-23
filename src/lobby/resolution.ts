/* eslint-disable @typescript-eslint/no-magic-numbers */
/*
 * Picks how many device pixels the cave is drawn with, per CSS pixel, from
 * how long its frames take to draw. Where the GPU can time its own work, the
 * cave is sharpened while there's room to spare and softened when frames run
 * long. Elsewhere only the gap between drawn frames is known, which can show
 * the cave falling behind but not how much room there is, so it's only ever
 * softened. Gaps long enough to mean the browser was holding frames back (a
 * background tab, a hidden pane) aren't the cave's fault, so they're ignored;
 * a steady 30 frames a second, as in Low Power Mode, is all the cave asks for.
 * When even the softest picture can't keep up, the governor gives up and the
 * cave is paused.
 */

/** The resolutions to choose from, in device pixels per CSS pixel. */
export const SCALES = [0.5, 0.75, 1, 1.25, 1.5] as const;
const START = SCALES.indexOf(1);
/** Measurements judged together. */
const WINDOW = 30;
/** GPU milliseconds per frame: above SLOW is too long, below FAST leaves room to sharpen. */
const GPU = { slow: 10, fast: 4 };
/** Milliseconds between drawn frames that mean the cave is falling behind its 30 a second. */
const BEHIND = 1000 / 24;
/** A gap this long means the browser held frames back, not that the cave was slow. */
const THROTTLED = 250;
/** How many windows in a row it takes to step down, or up. */
const STEADY = { down: 2, up: 3 };

/** What a measurement is: GPU time spent drawing a frame, or the gap since the last frame drawn. */
export type FrameMeasure = "gpu" | "interval";

export interface FrameSample {
  milliseconds: number;
  measure: FrameMeasure;
}

export interface Governor {
  rung: number;
  samples: readonly number[];
  slow: number;
  fast: number;
  gaveUp: boolean;
}

export const governor = (): Governor => ({
  rung: START,
  samples: [],
  slow: 0,
  fast: 0,
  gaveUp: false,
});

/** Lets a governor that gave up try again, from the resolution it reached. */
export const retry = (state: Governor): Governor => ({
  ...state,
  samples: [],
  slow: 0,
  fast: 0,
  gaveUp: false,
});

/** The scale a governor has settled on, no finer than the screen can show. */
export function governedScale(state: Governor, devicePixelRatio: number): number {
  const scale = SCALES[state.rung] ?? 1;
  return Math.min(scale, Math.max(devicePixelRatio, SCALES[0]));
}

function verdict(median: number, measure: FrameMeasure): "fast" | "fine" | "slow" {
  if (measure === "interval") return median > BEHIND ? "slow" : "fine";
  if (median > GPU.slow) return "slow";
  return median < GPU.fast ? "fast" : "fine";
}

/** Takes one measurement into account. */
export function govern(
  state: Governor,
  { milliseconds, measure }: FrameSample,
  devicePixelRatio: number,
): Governor {
  if (state.gaveUp || (measure === "interval" && milliseconds > THROTTLED)) return state;
  const samples = [...state.samples, milliseconds];
  if (samples.length < WINDOW) return { ...state, samples };
  const sorted = samples.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const judged = verdict(median, measure);
  const slow = judged === "slow" ? state.slow + 1 : 0;
  const finest = SCALES.findLastIndex((scale) => scale <= Math.max(1, devicePixelRatio));
  const fast = judged === "fast" && state.rung < finest ? state.fast + 1 : 0;
  if (slow >= STEADY.down) {
    if (state.rung === 0) return { ...state, samples: [], slow: 0, fast: 0, gaveUp: true };
    return { ...state, rung: state.rung - 1, samples: [], slow: 0, fast: 0 };
  }
  if (fast >= STEADY.up) return { ...state, rung: state.rung + 1, samples: [], slow: 0, fast: 0 };
  return { ...state, samples: [], slow, fast };
}
