import type { TokenStat } from "../systems/types";
import { BAR_BREAK_AT } from "./barChange";

/** How long a token takes to fall over, or get back up, in ms. */
export const DOWN_MS = 900;

/** Whether a stat puts its token down: hit points at zero. */
export const downs = (stat: Pick<TokenStat, "id" | "value" | "max">) =>
  stat.id === "hp" && stat.max > 0 && stat.value <= 0;

/** Whether a token with these stats is down. */
export const isDowned = (stats: readonly TokenStat[]) => stats.some(downs);

/** A token falling over or getting back up. */
export interface DownTurn {
  /** How far over it was when this began, 0 (upright) to 1 (upside down). */
  from: number;
  down: boolean;
  start: number;
}

/** One frame of a token falling over or getting up. */
export interface DownFrame {
  /** How far over it is, 0 (upright) to 1 (upside down), rocking past it a little. */
  turn: number;
  /** How grey it is, 0 to 1. */
  grey: number;
  /** Its size, swelling a touch as it tips. */
  scale: number;
  done: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Tips over, gathering speed, then rocks on its back as it settles. */
const topple = (p: number) => {
  if (p < 0.5) return (p / 0.5) ** 2;
  const q = (p - 0.5) / 0.5;
  return 1 + 0.09 * Math.sin(q * Math.PI * 2.5) * (1 - q) ** 2;
};
/** Springs back up with a bounce past it. */
const spring = (p: number) =>
  p >= 1 ? 1 : 1 - Math.exp(-6 * p) * (Math.cos(11 * p) + 0.55 * Math.sin(11 * p));

/**
 * Where a token is, `elapsed` ms into falling over or getting up. It falls as
 * its hit point bar snaps, so the two read as one blow.
 */
export function downFrame(turn: DownTurn, elapsed: number): DownFrame {
  const t = Math.max(0, elapsed - (turn.down ? BAR_BREAK_AT : 0));
  const p = clamp01(t / DOWN_MS);
  const to = turn.down ? 1 : 0;
  const eased = turn.down ? topple(p) : spring(p);
  const grey = turn.from + (to - turn.from) * clamp01(t / (DOWN_MS * 0.6));
  return {
    turn: turn.from + (to - turn.from) * eased,
    grey,
    scale: 1 + 0.12 * Math.sin(clamp01(t / (DOWN_MS * 0.5)) * Math.PI),
    done: p >= 1,
  };
}
