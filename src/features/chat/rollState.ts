import { cryptoDie, roll, type Roll, type RolledDice, type RolledFlat } from "../dice/notation";
import { getState, setState, type MessageState } from "./messageState";

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
  const current = getState<StoredRoll>(state, messageId, ROLL_FIELD)?.roll ?? source;
  const next = roll(current.formula);
  storeRoll(
    state,
    messageId,
    next,
    next.terms.map((term, termIndex) =>
      termSeeds(term, (index) => `${messageId}:${Date.now()}:${termIndex}:${index}`),
    ),
  );
}

export function rerollDie(
  state: MessageState,
  messageId: string,
  source: Roll,
  termIndex: number,
  dieIndex: number,
) {
  const stored = getState<StoredRoll>(state, messageId, ROLL_FIELD);
  const current = stored?.roll ?? source;
  const term = current.terms[termIndex];
  if (term?.kind !== "dice" || !term.dice[dieIndex]) return;
  const dice = term.dice.map((die, index) =>
    index === dieIndex ? { ...die, value: cryptoDie(die.sides), disabled: false } : die,
  );
  const terms = current.terms.map((entry, index) =>
    index === termIndex ? ({ ...entry, dice } as RolledDice) : entry,
  );
  const next = recalculate({ ...current, terms });
  const seeds = stored?.seeds ?? seedsFor(messageId, current);
  const seedRow = [...(seeds[termIndex] ?? [])];
  seedRow[dieIndex] = `${messageId}:${Date.now()}:${termIndex}:${dieIndex}`;
  seeds[termIndex] = seedRow;
  storeRoll(state, messageId, next, seeds);
}

export function toggleRollDie(
  state: MessageState,
  messageId: string,
  source: Roll,
  termIndex: number,
  dieIndex: number,
) {
  const stored = getState<StoredRoll>(state, messageId, ROLL_FIELD);
  const current = stored?.roll ?? source;
  const term = current.terms[termIndex];
  if (term?.kind !== "dice" || !term.dice[dieIndex]) return;
  const dice = term.dice.map((die, index) =>
    index === dieIndex ? { ...die, disabled: !die.disabled } : die,
  );
  const terms = current.terms.map((entry, index) =>
    index === termIndex ? ({ ...entry, dice } as RolledDice) : entry,
  );
  storeRoll(
    state,
    messageId,
    recalculate({ ...current, terms }),
    stored?.seeds ?? seedsFor(messageId, current),
  );
}

/** A roll's terms written back out as a formula, as it would be typed. */
function formulaOf(terms: Roll["terms"]) {
  return terms
    .map(
      (term, index) =>
        (term.sign < 0 ? "-" : index ? "+" : "") +
        (term.kind === "dice" ? term.notation.replace(/^1d/, "d") : term.value) +
        (term.label ? `[${term.label}]` : ""),
    )
    .join("");
}

/** Adds a freshly rolled die to a shared roll: one more of a plain term with the same dice, or a term of its own. */
export function addRollDie(state: MessageState, messageId: string, source: Roll, sides: number) {
  const stored = getState<StoredRoll>(state, messageId, ROLL_FIELD);
  const current = stored?.roll ?? source;
  const seeds = stored?.seeds ?? seedsFor(messageId, current);
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
  seeds[termIndex] = [...row, `${messageId}:${Date.now()}:${termIndex}:${row.length}`];
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
  const stored = getState<StoredRoll>(state, messageId, ROLL_FIELD);
  const current = stored?.roll ?? source;
  const seeds = [...(stored?.seeds ?? seedsFor(messageId, current))];
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
  const seed = [`${messageId}:${Date.now()}:${termIndex < 0 ? terms.length : termIndex}:0`];
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
