import {
  cryptoDie,
  roll
  
  
  
  
} from "../dice/notation";
import type {Die, Roll, RolledDice, RolledFlat} from "../dice/notation";
import { getState, setState  } from "./messageState";
import type {MessageState} from "./messageState";

export interface SharedRoll {
  roll: Roll;
  edited: boolean;
  seeds: string[][];
}

type StoredRoll = SharedRoll;

const ROLL_FIELD = "roll";

function recalculate(source: Roll): Roll {
  const terms = source.terms.map((term) => {
    if (term.kind !== "dice") return { ...term };
    const dice = term.dice.map((die) => ({ ...die }));
    const subtotal = dice.reduce(
      (sum, die) => sum + (die.kept && !die.disabled ? die.value : 0),
      0,
    );
    return { ...term, dice, subtotal };
  });
  const total = terms.reduce(
    (sum, term) => sum + term.sign * (term.kind === "dice" ? term.subtotal : term.value),
    0,
  );
  return { ...source, terms, total };
}

/** One seed per die, and one for each number term's chip. */
const termSeeds = (term: Roll["terms"][number], seed: (index: number) => string) =>
  term.kind === "dice" ? term.dice.map((_, index) => seed(index)) : [seed(0)];

function seedsFor(messageId: string, source: Roll) {
  return source.terms.map((term, termIndex) =>
    termSeeds(term, (index) => `${messageId}:${termIndex}:${index}`),
  );
}

/** A seed for a die or chip thrown in now, so it animates afresh. */
const freshSeed = (messageId: string, termIndex: number, index: number) =>
  `${messageId}:${Date.now()}:${termIndex}:${index}`;

function storeRoll(state: MessageState, messageId: string, source: Roll, seeds: string[][]) {
  setState(state, messageId, ROLL_FIELD, {
    roll: source,
    edited: true,
    seeds,
  } satisfies StoredRoll);
}

export function readRollState(state: MessageState, messageId: string, source: Roll): SharedRoll {
  const stored = getState<StoredRoll>(state, messageId, ROLL_FIELD);
  return {
    roll: stored?.roll ?? source,
    edited: stored?.edited ?? false,
    seeds: stored?.seeds ?? seedsFor(messageId, source),
  };
}

export function rerollMessage(state: MessageState, messageId: string, source: Roll) {
  const next = roll(readRollState(state, messageId, source).roll.formula);
  storeRoll(
    state,
    messageId,
    next,
    next.terms.map((term, termIndex) =>
      termSeeds(term, (index) => freshSeed(messageId, termIndex, index)),
    ),
  );
}

function updateRollDie(
  state: MessageState,
  messageId: string,
  source: Roll,
  termIndex: number,
  dieIndex: number,
  update: (die: Die) => Die,
  newSeed?: () => string,
) {
  const { roll: current, seeds: storedSeeds } = readRollState(state, messageId, source);
  const term = current.terms[termIndex];
  if (term?.kind !== "dice" || !term.dice[dieIndex]) return;
  const dice = term.dice.map((die, index) => (index === dieIndex ? update(die) : die));
  const terms = current.terms.map((entry, index) =>
    index === termIndex ? ({ ...entry, dice } as RolledDice) : entry,
  );
  const seeds = storedSeeds.map((row) => [...row]);
  if (newSeed) {
    const seedRow = [...(seeds[termIndex] ?? [])];
    seedRow[dieIndex] = newSeed();
    seeds[termIndex] = seedRow;
  }
  storeRoll(state, messageId, recalculate({ ...current, terms }), seeds);
}

export function rerollDie(
  state: MessageState,
  messageId: string,
  source: Roll,
  termIndex: number,
  dieIndex: number,
) {
  updateRollDie(
    state,
    messageId,
    source,
    termIndex,
    dieIndex,
    (die) => ({ ...die, value: cryptoDie(die.sides), disabled: false }),
    () => freshSeed(messageId, termIndex, dieIndex),
  );
}

export function toggleRollDie(
  state: MessageState,
  messageId: string,
  source: Roll,
  termIndex: number,
  dieIndex: number,
) {
  updateRollDie(state, messageId, source, termIndex, dieIndex, (die) => ({
    ...die,
    disabled: !die.disabled,
  }));
}

/** A roll's terms written back out as a formula, as it would be typed. */
function formulaOf(terms: Roll["terms"]) {
  return terms
    .map(
      (term, index) =>
        (term.sign < 0 ? "-" : (index ? "+" : "")) +
        (term.kind === "dice" ? term.notation.replace(/^1d/, "d") : term.value) +
        (term.label ? `[${term.label}]` : ""),
    )
    .join("");
}

/** Adds a freshly rolled die to a shared roll: one more of a plain term with the same dice, or a term of its own. */
export function addRollDie(state: MessageState, messageId: string, source: Roll, sides: number) {
  const { roll: current, seeds: storedSeeds } = readRollState(state, messageId, source);
  const seeds = [...storedSeeds];
  const die = { sides, value: cryptoDie(sides), kept: true };
  const face = sides === 100 ? "%" : String(sides);
  const plain = (term: Roll["terms"][number]): term is RolledDice =>
    term.kind === "dice" &&
    term.sign === 1 &&
    !term.label &&
    term.notation === `${term.dice.length}d${face}`;
  let termIndex = current.terms.findIndex(plain);
  const terms: Roll["terms"] = current.terms.map((term, index) =>
    index === termIndex && plain(term)
      ? { ...term, notation: `${term.dice.length + 1}d${face}`, dice: [...term.dice, die] }
      : term,
  );
  if (termIndex < 0) {
    termIndex = terms.length;
    terms.push({ kind: "dice", sign: 1, notation: `1d${face}`, dice: [die], subtotal: 0 });
  }
  const row = seeds[termIndex] ?? [];
  seeds[termIndex] = [...row, freshSeed(messageId, termIndex, row.length)];
  storeRoll(state, messageId, recalculate({ ...current, terms, formula: formulaOf(terms) }), seeds);
}

/**
 * Adds a number to a shared roll, thrown in as a chip of its own. A labelled
 * one (a stat) is always a term of its own; a plain one is folded into the
 * roll's first plain number, which is dropped if that brings it to zero.
 */
export function addRollModifier(
  state: MessageState,
  messageId: string,
  source: Roll,
  modifier: number,
  label?: string,
) {
  const { roll: current, seeds: storedSeeds } = readRollState(state, messageId, source);
  const seeds = [...storedSeeds];
  const terms = [...current.terms];
  const termIndex = label ? -1 : terms.findIndex((term) => term.kind === "flat" && !term.label);
  const term = terms[termIndex];
  const value = (term?.kind === "flat" ? term.sign * term.value : 0) + modifier;
  const next: RolledFlat = {
    kind: "flat",
    sign: value < 0 ? -1 : 1,
    value: Math.abs(value),
    ...(label ? { label } : {}),
  };
  const seed = [freshSeed(messageId, termIndex < 0 ? terms.length : termIndex, 0)];
  if (termIndex < 0) {
    terms.push(next);
    seeds.push(seed);
  } else if (value || terms.length === 1) {
    terms[termIndex] = next;
    seeds[termIndex] = seed;
  } else {
    terms.splice(termIndex, 1);
    seeds.splice(termIndex, 1);
  }
  storeRoll(state, messageId, recalculate({ ...current, terms, formula: formulaOf(terms) }), seeds);
}
