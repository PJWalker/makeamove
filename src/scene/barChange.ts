/** How long a stat bar takes to play out a change in its value, in ms. */
export const BAR_CHANGE_MS = 1500;

/** A stat bar's value changing, from one fill to another. */
export interface BarChange {
  /** Fill, 0 to 1, before and after. */
  from: number;
  to: number;
  /** The change in value, for the number that rises off the bar. */
  delta: number;
  start: number;
  /** How grown the bar already was, when this change cut into another. */
  grownFrom: number;
}

/** One frame of a bar change. */
export interface BarChangeFrame {
  /** How far the bar has grown, 0 (its size) to 1 (fully grown), overshooting a little. */
  grow: number;
  /** Sideways shake, in px. */
  shakeX: number;
  /** A flash over the whole bar, 0 to 1. */
  flash: number;
  /** The bar's fill. */
  fill: number;
  /** What was lost (or gained), drawn behind the fill: up to this. */
  ghost: number;
  /** Whether the ghost is still the flash white of the hit. */
  ghostHot: boolean;
  /** The delta number: how far it has risen, 0 to 1, its pop scale, and its opacity. */
  rise: number;
  pop: number;
  alpha: number;
  done: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
/** Springs to 1 with a bounce past it. */
const spring = (p: number) =>
  p >= 1 ? 1 : 1 - Math.exp(-6 * p) * (Math.cos(11 * p) + 0.55 * Math.sin(11 * p));

/** Where a bar is, `elapsed` ms into a change. */
export function barChangeFrame(change: BarChange, elapsed: number): BarChangeFrame {
  const t = Math.max(0, elapsed);
  const hurt = change.delta < 0;

  const grow =
    t < 1150
      ? change.grownFrom + (1 - change.grownFrom) * spring(span(t, 0, 420))
      : 1 - easeInOut(span(t, 1150, BAR_CHANGE_MS - 50));
  const shakeP = span(t, 40, 520);
  const shakeX =
    hurt && shakeP < 1 ? Math.sin(shakeP * Math.PI * 2 * 7) * 6 * (1 - shakeP) ** 2 : 0;
  const flash = 0.9 * (1 - easeOut(span(t, 0, 320)));

  let fill: number;
  let ghost: number;
  if (hurt) {
    // The fill drops at once; what was lost hangs on, then drains away.
    fill = change.to;
    ghost = change.from + (change.to - change.from) * easeInOut(span(t, 600, 1050));
  } else {
    // What's gained shows at once; the fill swells up into it.
    ghost = change.to;
    fill = change.from + (change.to - change.from) * easeOut(span(t, 300, 850));
  }

  return {
    grow,
    shakeX,
    flash,
    fill,
    ghost,
    ghostHot: hurt && t < 140,
    rise: easeOut(span(t, 0, BAR_CHANGE_MS)),
    pop: 0.6 + 0.4 * spring(span(t, 0, 300)),
    alpha: 1 - span(t, 1000, BAR_CHANGE_MS),
    done: t >= BAR_CHANGE_MS,
  };
}
