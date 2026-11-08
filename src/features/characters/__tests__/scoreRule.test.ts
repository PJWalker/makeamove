import { describe, expect, it } from "vitest";

import type { ScoreRule, StatDef } from "../../../systems/types";
import { ruleScoreValues, ruleStartingScores, scoreRuleProblems } from "../creation";

const stats: StatDef[] = ["str", "dex", "int", "wis", "cha"].map((id) => ({
  id,
  name: id,
  abbr: id.toUpperCase(),
}));
const line = (str: number, dex: number, int: number, wis: number, cha: number) => ({
  str,
  dex,
  int,
  wis,
  cha,
});

const barbarian: ScoreRule = {
  fixed: { str: 2 },
  oneOf: [{ wis: 2 }, { cha: 2 }],
  remaining: [0, 0, -1],
};
const fighter: ScoreRule = {
  fixed: {},
  oneOf: [
    { str: 2, dex: 1 },
    { dex: 2, str: 1 },
  ],
  remaining: [1, 0, -1],
};

describe("scoreRuleProblems", () => {
  it("accepts any order of the remaining scores under either alternative", () => {
    expect(scoreRuleProblems(barbarian, stats, line(2, 0, -1, 2, 0))).toEqual([]);
    expect(scoreRuleProblems(barbarian, stats, line(2, -1, 0, 0, 2))).toEqual([]);
    expect(scoreRuleProblems(fighter, stats, line(2, 1, 1, 0, -1))).toEqual([]);
    expect(scoreRuleProblems(fighter, stats, line(1, 2, -1, 0, 1))).toEqual([]);
  });

  it("names a set stat that is wrong", () => {
    expect(scoreRuleProblems(barbarian, stats, line(0, 2, -1, 2, 0))).toEqual(["STR must be +2."]);
  });

  it("names the alternatives when none holds", () => {
    expect(scoreRuleProblems(barbarian, stats, line(2, 2, 0, 0, -1))).toEqual([
      "Choose WIS +2 or CHA +2.",
    ]);
    expect(scoreRuleProblems(fighter, stats, line(2, 2, 1, 0, -1))).toEqual([
      "Choose STR +2 with DEX +1 or DEX +2 with STR +1.",
    ]);
  });

  it("checks the other stats take the remaining scores", () => {
    expect(scoreRuleProblems(barbarian, stats, line(2, 0, 0, 2, 0))).toEqual([
      "The other stats must be 0, 0 and -1.",
    ]);
    // Both alternatives hold, so neither leaves 0, 0, -1 for the rest.
    expect(scoreRuleProblems(barbarian, stats, line(2, 0, -1, 2, 2))).toEqual([
      "The other stats must be 0, 0 and -1.",
    ]);
  });

  it("works without alternatives", () => {
    const rule: ScoreRule = { fixed: { int: 2 }, oneOf: [], remaining: [1, 1, 0, -1] };
    expect(scoreRuleProblems(rule, stats, line(1, 0, 2, -1, 1))).toEqual([]);
    expect(scoreRuleProblems(rule, stats, line(1, 1, 2, 1, 1))).toEqual([
      "The other stats must be +1, +1, 0 and -1.",
    ]);
  });
});

describe("rule scores", () => {
  it("starts from scores that meet the rule", () => {
    for (const rule of [barbarian, fighter])
      expect(scoreRuleProblems(rule, stats, ruleStartingScores(rule, stats))).toEqual([]);
  });

  it("offers every score the rule uses, highest first", () => {
    expect(ruleScoreValues(barbarian)).toEqual([2, 0, -1]);
    expect(ruleScoreValues(fighter)).toEqual([2, 1, 0, -1]);
  });
});
