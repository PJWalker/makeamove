import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { roll } from "../../dice/notation";
import { addRollDie, addRollModifier, readRollState, rerollMessage } from "../rollState";
import { rootOf } from "../../../data/schema";
import { campaignShape } from "../../../campaign/schema";

const shared = () => rootOf(new Y.Doc(), campaignShape).messageState;

describe("adding a die to a roll", () => {
  it("joins a plain term with the same dice", () => {
    const state = shared();
    const source = roll("2d6+1");
    addRollDie(state, "m", source, 6);
    const { roll: next, seeds } = readRollState(state, "m", source);
    const term = next.terms[0]!;
    expect(next.formula).toBe("3d6+1");
    expect(term.kind === "dice" && term.dice.length).toBe(3);
    expect(seeds[0]).toHaveLength(3);
    expect(next.total).toBe(
      (term.kind === "dice" ? term.dice.reduce((sum, die) => sum + die.value, 0) : 0) + 1,
    );
  });

  it("adds a term of its own for different or modified dice", () => {
    const state = shared();
    const source = roll("4d6kh3");
    addRollDie(state, "m", source, 6);
    addRollDie(state, "m", source, 20);
    const { roll: next, seeds } = readRollState(state, "m", source);
    expect(next.formula).toBe("4d6kh3+d6+d20");
    expect(next.terms).toHaveLength(3);
    expect(seeds.map((row) => row.length)).toEqual([4, 1, 1]);
  });

  it("keeps the added die when the whole roll is rerolled", () => {
    const state = shared();
    const source = roll("d20");
    addRollDie(state, "m", source, 4);
    rerollMessage(state, "m", source);
    expect(readRollState(state, "m", source).roll.formula).toBe("d20+d4");
  });
});

describe("adding a modifier to a roll", () => {
  const read = (state: ReturnType<typeof shared>, source: ReturnType<typeof roll>) =>
    readRollState(state, "m", source);

  it("adds a number of its own to a roll without one", () => {
    const state = shared();
    const source = roll("2d6");
    addRollModifier(state, "m", source, 1);
    const { roll: next, seeds } = read(state, source);
    expect(next.formula).toBe("2d6+1");
    expect(next.total).toBe(source.total + 1);
    // The number gets a seed of its own, so its chip is thrown in.
    expect(seeds.map((row) => row.length)).toEqual([2, 1]);
  });

  it("folds into the roll's existing number, crossing zero", () => {
    const state = shared();
    const source = roll("d20+1");
    addRollModifier(state, "m", source, -1);
    expect(read(state, source).roll.formula).toBe("d20");
    addRollModifier(state, "m", source, -1);
    addRollModifier(state, "m", source, -1);
    const { roll: next } = read(state, source);
    expect(next.formula).toBe("d20-2");
    expect(next.total).toBe(source.total - 3);
  });

  it("leaves labelled numbers alone", () => {
    const state = shared();
    const source = roll("d8+2[STR]");
    addRollModifier(state, "m", source, 1);
    expect(read(state, source).roll.formula).toBe("d8+2[STR]+1");
  });

  it("keeps a dropped number's dice seeds lined up with their terms", () => {
    const state = shared();
    const source = roll("1-d6");
    addRollModifier(state, "m", source, -1);
    const { roll: next, seeds } = read(state, source);
    expect(next.formula).toBe("-d6");
    expect(next.total).toBe(source.total - 1);
    expect(seeds.map((row) => row.length)).toEqual([1]);
  });

  it("keeps the modifier, and dice added after it, when the roll is rerolled", () => {
    const state = shared();
    const source = roll("d20");
    addRollModifier(state, "m", source, 1);
    addRollDie(state, "m", source, 4);
    rerollMessage(state, "m", source);
    expect(read(state, source).roll.formula).toBe("d20+1+d4");
  });
});

describe("adding a stat to a roll", () => {
  it("adds a labelled number of its own, even beside a plain one", () => {
    const state = shared();
    const source = roll("d20+1");
    addRollModifier(state, "m", source, 2, "STR");
    addRollModifier(state, "m", source, -1, "DEX");
    const { roll: next, seeds } = readRollState(state, "m", source);
    expect(next.formula).toBe("d20+1+2[STR]-1[DEX]");
    expect(next.total).toBe(source.total + 1);
    expect(seeds.map((row) => row.length)).toEqual([1, 1, 1, 1]);
  });

  it("gives a changed number a new seed, so its chip is thrown again", () => {
    const state = shared();
    const source = roll("d6+1");
    const before = readRollState(state, "m", source).seeds[1]![0];
    addRollModifier(state, "m", source, 1);
    const after = readRollState(state, "m", source).seeds[1]![0];
    expect(after).not.toBe(before);
  });
});
