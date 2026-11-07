import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { roll } from "../../dice/notation";
import { addRollDie, readRollState, rerollMessage } from "../rollState";

const shared = () => new Y.Doc().getMap<unknown>("state");

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
