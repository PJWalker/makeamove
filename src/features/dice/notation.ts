import { seededRandom } from "../../lib/seededRandom";
import { pick, rollDice } from "./pick";
import { scan } from "./scan";
import type { Scanned } from "./scan";

/*
 * Dice notation: a small parser and roller for the usual tabletop syntax.
 *
 *   2d6+2         dice plus a flat modifier
 *   d8+d4         several dice terms
 *   4d6kh3        keep the highest 3 (k3 and b3, "best of", mean the same)
 *   2d20kl1       keep the lowest 1 (w1, "worst of", too)
 *   4d6dl1        drop the lowest 1 (dh drops the highest)
 *   d6!           exploding: a die showing its maximum rolls again
 *   d%            a hundred-sided die
 *   2d6+2[STR]    a label on any term, shown on the roll card
 *
 * Rolling never depends on anything but the random source, so the result
 * can be recorded once and replayed (as an animation) by every peer.
 */

export interface DiceTerm {
  kind: "dice";
  sign: -1 | 1;
  count: number;
  sides: number;
  keep?: { which: "high" | "low"; n: number };
  drop?: { which: "high" | "low"; n: number };
  explode?: boolean;
  label?: string;
}

export interface FlatTerm {
  kind: "flat";
  sign: -1 | 1;
  value: number;
  label?: string;
}

export type Term = DiceTerm | FlatTerm;

export interface Die {
  sides: number;
  value: number;
  /** Counts towards the total (not dropped by keep or drop). */
  kept: boolean;
  /** Removed from a shared roll by its owner. */
  disabled?: boolean;
  /** Rolled because the die before it exploded. */
  exploded?: boolean;
}

export interface RolledDice {
  kind: "dice";
  sign: -1 | 1;
  notation: string;
  label?: string;
  dice: Die[];
  subtotal: number;
}

export interface RolledFlat {
  kind: "flat";
  sign: -1 | 1;
  value: number;
  label?: string;
}

export interface Roll {
  formula: string;
  terms: (RolledDice | RolledFlat)[];
  total: number;
}

export class NotationError extends Error {}

/** A scanned term as the roller takes it. */
function termOf(t: Scanned): Term {
  const sign = t.sign < 0 ? -1 : 1;
  const label = t.label ? { label: t.label } : {};
  if (!t.dice) return { kind: "flat", sign, value: t.value, ...label };
  const dice: DiceTerm = { kind: "dice", sign, count: t.count, sides: t.sides, ...label };
  if (t.pick === "dh" || t.pick === "dl")
    dice.drop = { which: t.pick === "dh" ? "high" : "low", n: t.pickN };
  else if (t.pick !== "all") dice.keep = { which: t.pick === "kh" ? "high" : "low", n: t.pickN };
  if (t.explode) dice.explode = true;
  return dice;
}

/** Parse a formula, or throw a NotationError saying what's wrong with it. Every term it returns can be rolled (proved in scan.ts). */
export function parse(formula: string): Term[] {
  const { terms, error } = scan(formula);
  if (error) throw new NotationError(error);
  return terms.map((t) => termOf(t));
}

const UINT32_RANGE = 0x1_00_00_00_00;

/** A uniform face in [1, sides], from a source of uniform 32-bit integers. */
function faceFrom(sides: number, sample: () => number): number {
  // Reject the top sliver of the range so every face is equally likely.
  const limit = Math.floor(UINT32_RANGE / sides) * sides;
  for (;;) {
    const value = sample();
    if (value < limit) return (value % sides) + 1;
  }
}

/** A uniform integer in [1, sides] from a cryptographic source. */
export function cryptoDie(sides: number): number {
  const buf = new Uint32Array(1);
  return faceFrom(sides, () => crypto.getRandomValues(buf)[0]!);
}

/** A reproducible die source for a roll that is previewed before it is posted. */
export function seededDie(seed: string) {
  const random = seededRandom(seed);
  return (sides: number) => faceFrom(sides, () => random() * UINT32_RANGE);
}

const notationOf = (t: DiceTerm) => {
  const sides = t.sides === 100 ? "%" : t.sides;
  const keep = t.keep ? `k${t.keep.which === "high" ? "h" : "l"}${t.keep.n}` : "";
  const drop = t.drop ? `d${t.drop.which === "high" ? "h" : "l"}${t.drop.n}` : "";
  return `${t.count}d${sides}${keep}${drop}${t.explode ? "!" : ""}`;
};

/** Roll parsed terms. `die` is the random source, injectable for tests. */
export function rollTerms(
  formula: string,
  terms: Term[],
  die: (sides: number) => number = cryptoDie,
): Roll {
  const rolled = terms.map((t): RolledDice | RolledFlat => {
    if (t.kind === "flat")
      return {
        kind: "flat",
        sign: t.sign,
        value: t.value,
        ...(t.label === undefined ? {} : { label: t.label }),
      };

    const dice: Die[] = rollDice(
      { count: t.count, sides: t.sides, explode: t.explode ?? false },
      die,
    ).map(({ value, exploded }) => ({
      sides: t.sides,
      value,
      kept: true,
      ...(exploded ? { exploded } : {}),
    }));

    // Keep or drop the n highest or lowest; equal values pick the later die
    // when picking the highest, the earlier when picking the lowest.
    const rule = t.keep ?? t.drop;
    if (rule) {
      const chosen = pick(
        { values: dice.map((d) => d.value), high: rule.which === "high" },
        rule.n,
      );
      for (const [index, d] of dice.entries())
        d.kept = t.keep ? chosen.has(index) : !chosen.has(index);
    }

    const subtotal = dice.reduce((sum, d) => sum + (d.kept ? d.value : 0), 0);
    return {
      kind: "dice",
      sign: t.sign,
      notation: notationOf(t),
      ...(t.label === undefined ? {} : { label: t.label }),
      dice,
      subtotal,
    };
  });

  const total = rolled.reduce(
    (sum, t) => sum + t.sign * (t.kind === "dice" ? t.subtotal : t.value),
    0,
  );
  return { formula: formula.trim(), terms: rolled, total };
}

/** Parse and roll in one go. Throws NotationError for bad formulas. */
export function roll(formula: string, die?: (sides: number) => number): Roll {
  return rollTerms(formula, parse(formula), die);
}

/** "2d6 (4+5) + STR 2 = 11", for plain-text logs and screen readers. */
export function describe(r: Roll): string {
  const parts = r.terms.map((t, index) => {
    const sign = t.sign < 0 ? "- " : index ? "+ " : "";
    if (t.kind === "flat") return `${sign}${t.label ? `${t.label} ` : ""}${t.value}`;
    const faces = t.dice.map((d) => (d.kept ? `${d.value}` : `~~${d.value}~~`)).join("+");
    return `${sign}${t.notation}${t.label ? ` ${t.label}` : ""} (${faces})`;
  });
  return `${parts.join(" ")} = ${r.total}`;
}
