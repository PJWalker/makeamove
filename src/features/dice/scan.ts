/* eslint-disable unicorn/prefer-code-point -- the proof models UTF-16 code units, and the syntax is ASCII */
/*
 * The dice notation scanner, written by hand so LemmaScript can prove it:
 * every term it accepts can be rolled. Dice have 1 to MAX_DICE dice of 1 to
 * MAX_SIDES sides, a d1 never explodes, a term keeps or drops at most once,
 * and every sign is + or -. notation.ts turns its terms into the roller's.
 */

export const MAX_DICE = 1000;
export const MAX_SIDES = 1000;
const PERCENT_SIDES = 100;

const DIGIT_0 = 48;
const DIGIT_9 = 57;
const SPACE = 32;
const TAB = 9;
const CARRIAGE_RETURN = 13;
const CASE_GAP = 32;
const UPPER_A = 65;
const UPPER_Z = 90;
const D = 100;
const K = 107;
const B = 98;
const W = 119;
const H = 104;
const L = 108;
const TEN = 10;
/** Letters in a two-letter keep or drop, like `kh`. */
const PAIR = 2;

export type PickOp = "all" | "dh" | "dl" | "kh" | "kl";

/** One term as scanned: dice, or a flat number when `dice` is false. */
export interface Scanned {
  dice: boolean;
  sign: number;
  count: number;
  sides: number;
  value: number;
  pick: PickOp;
  pickN: number;
  explode: boolean;
  label: string;
}

export interface PickFound {
  length: number;
  op: PickOp;
}

export interface Scan {
  terms: Scanned[];
  /** What's wrong with the formula; empty when it scanned. */
  error: string;
}

/**
 * Whether a scanned term can be rolled.
 * @public Used by the proofs' specs.
 */
export function rollable(t: Scanned): boolean {
  //@ verify
  return (
    (t.sign === 1 || t.sign === -1) &&
    (t.dice
      ? t.count >= 1 &&
        t.count <= MAX_DICE &&
        t.sides >= 1 &&
        t.sides <= MAX_SIDES &&
        (!t.explode || t.sides > 1) &&
        t.pickN >= 0
      : t.value >= 0 && t.pick === "all" && !t.explode)
  );
}

function isSpaceAt(s: string, i: number): boolean {
  //@ verify
  //@ requires 0 <= i && i < s.length
  const c = s.charCodeAt(i);
  return c === SPACE || (c >= TAB && c <= CARRIAGE_RETURN);
}

function isDigitAt(s: string, i: number): boolean {
  //@ verify
  //@ requires 0 <= i && i < s.length
  const c = s.charCodeAt(i);
  return c >= DIGIT_0 && c <= DIGIT_9;
}

/** The character code at `i`, lower-cased; -1 past the end. */
function lowerAt(s: string, i: number): number {
  //@ verify
  //@ requires 0 <= i
  if (i >= s.length) return -1;
  const c = s.charCodeAt(i);
  return c >= UPPER_A && c <= UPPER_Z ? c + CASE_GAP : c;
}

/** Where the run of white space from `i` ends. */
function spaceEnd(s: string, i: number): number {
  //@ verify
  //@ requires 0 <= i && i <= s.length
  //@ decreases s.length - i
  //@ ensures i <= \result && \result <= s.length
  if (i < s.length && isSpaceAt(s, i)) return spaceEnd(s, i + 1);
  return i;
}

/** Where the run of white space ending at `end` starts. */
function spaceStart(s: string, end: number): number {
  //@ verify
  //@ requires 0 <= end && end <= s.length
  //@ decreases end
  //@ ensures 0 <= \result && \result <= end
  if (end > 0 && isSpaceAt(s, end - 1)) return spaceStart(s, end - 1);
  return end;
}

/** Where the run of digits from `i` ends. */
function digitsEnd(s: string, i: number): number {
  //@ verify
  //@ requires 0 <= i && i <= s.length
  //@ decreases s.length - i
  //@ ensures i <= \result && \result <= s.length
  if (i < s.length && isDigitAt(s, i)) return digitsEnd(s, i + 1);
  return i;
}

/** The number written by the digits from `i` to `end`. */
function numberOf(s: string, i: number, end: number): number {
  //@ verify
  //@ requires 0 <= i && i <= end && end <= s.length
  //@ decreases end - i
  //@ ensures \result >= 0
  if (end <= i) return 0;
  const digit = isDigitAt(s, end - 1) ? s.charCodeAt(end - 1) - DIGIT_0 : 0;
  return numberOf(s, i, end - 1) * TEN + digit;
}

/** Text with the white space at either end left off. */
function trimmed(s: string): string {
  //@ verify
  const start = spaceEnd(s, 0);
  return s.slice(start, Math.max(start, spaceStart(s, s.length)));
}

/** The length of a keep or drop at `i` (its letters, before the digits), and which it is; 0 if none. */
function pickAt(s: string, i: number): PickFound {
  //@ verify
  //@ requires 0 <= i && i <= s.length
  //@ ensures \result.length >= 0 && i + \result.length <= s.length
  //@ ensures \result.length > 0 ==> \result.op !== "all" && i + \result.length < s.length && isDigitAt(s, i + \result.length)
  const none: PickFound = { length: 0, op: "all" };
  const c = lowerAt(s, i);
  const next = lowerAt(s, i + 1);
  const twoDigits = i + PAIR < s.length && isDigitAt(s, i + PAIR);
  const oneDigit = i + 1 < s.length && isDigitAt(s, i + 1);
  if ((c === K || c === D) && (next === H || next === L) && twoDigits) {
    const high = next === H;
    if (c === K) return { length: 2, op: high ? "kh" : "kl" };
    return { length: 2, op: high ? "dh" : "dl" };
  }
  if ((c === K || c === B) && oneDigit) return { length: 1, op: "kh" };
  if (c === W && oneDigit) return { length: 1, op: "kl" };
  return none;
}

/* eslint-disable max-depth, max-lines-per-function, complexity, @typescript-eslint/restrict-template-expressions --
   one function, so the proof follows the whole scan; the old regex parser carried the same suppressions */
/** Scan a formula into terms, or say what's wrong with it. */
export function scan(formula: string): Scan {
  //@ verify
  //@ ensures \result.error === "" ==> forall(k: nat, k < \result.terms.length ==> rollable(\result.terms[k]))
  const source = trimmed(formula);
  if (source.length === 0) return { terms: [], error: "Enter some dice, like 2d6+1." };
  const terms: Scanned[] = [];
  let index = spaceEnd(source, 0);
  while (index < source.length) {
    //@ invariant 0 <= index && index <= source.length
    //@ invariant forall(k: nat, k < terms.length ==> rollable(terms[k]))
    //@ decreases source.length - index
    const start = index;
    let sign = 1;
    if (source[index] === "+" || source[index] === "-") {
      sign = source[index] === "-" ? -1 : 1;
      index = spaceEnd(source, index + 1);
    } else if (terms.length > 0) {
      return { terms, error: `Expected + or - before “${source.slice(index)}”.` };
    }

    const numberAt = index;
    const numberEnd = digitsEnd(source, index);
    const hasNumber = numberEnd > numberAt;
    const n = numberOf(source, numberAt, numberEnd);
    index = numberEnd;
    let term: Scanned = {
      dice: false,
      sign,
      count: 0,
      sides: 0,
      value: n,
      pick: "all",
      pickN: 0,
      explode: false,
      label: "",
    };
    if (lowerAt(source, index) === D) {
      index++;
      // eslint-disable-next-line no-useless-assignment -- the proof needs every variable to start with a value
      let sides = 0;
      if (index < source.length && source[index] === "%") {
        index++;
        sides = PERCENT_SIDES;
      } else {
        const sidesEnd = digitsEnd(source, index);
        if (sidesEnd === index) return { terms, error: "Dice need a number of sides, like d6." };
        sides = numberOf(source, index, sidesEnd);
        index = sidesEnd;
      }
      const count = hasNumber ? n : 1;
      if (count < 1) return { terms, error: "Roll at least one die." };
      if (count > MAX_DICE) return { terms, error: `That’s more than ${MAX_DICE} dice.` };
      if (sides < 1 || sides > MAX_SIDES)
        return { terms, error: `Dice can have 1 to ${MAX_SIDES} sides.` };
      let pick: PickOp = "all";
      let pickN = 0;
      let explode = false;
      // Modifiers, in any order.
      let more = true;
      while (more && index < source.length) {
        //@ invariant 0 <= index && index <= source.length
        //@ invariant pickN >= 0
        //@ invariant !explode || sides > 1
        //@ decreases source.length - index + (more ? 1 : 0)
        const found = pickAt(source, index);
        if (found.length > 0) {
          if (pick !== "all") return { terms, error: "Use one keep or drop per dice term." };
          const digitsAt = index + found.length;
          const end = digitsEnd(source, digitsAt);
          pick = found.op;
          pickN = numberOf(source, digitsAt, end);
          index = end;
        } else if (source[index] === "!") {
          index++;
          if (sides === 1) return { terms, error: "A d1 can’t explode." };
          explode = true;
        } else {
          more = false;
        }
      }
      term = { dice: true, sign, count, sides, value: 0, pick, pickN, explode, label: "" };
    } else if (!hasNumber) {
      return { terms, error: `Couldn’t read “${source.slice(start)}”.` };
    }

    // An optional [label] after any term, kept as typed.
    index = spaceEnd(source, index);
    if (index < source.length && source[index] === "[") {
      const close = source.indexOf("]", index);
      if (close < index) return { terms, error: "A [label] is missing its closing ]." };
      term = {
        dice: term.dice,
        sign: term.sign,
        count: term.count,
        sides: term.sides,
        value: term.value,
        pick: term.pick,
        pickN: term.pickN,
        explode: term.explode,
        label: trimmed(source.slice(index + 1, close)),
      };
      index = close + 1;
    }
    terms.push(term);
    index = spaceEnd(source, index);
    if (index <= start) return { terms, error: `Couldn’t read “${source.slice(start)}”.` };
  }
  return { terms, error: "" };
}
/* eslint-enable max-depth, max-lines-per-function, complexity, @typescript-eslint/restrict-template-expressions */
