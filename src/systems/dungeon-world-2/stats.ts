import type { ScoreRule } from "../types";

/** Each class's stat line from its Name & Stats prompt. */
export const DW2_CLASS_SCORE_RULES: Record<string, ScoreRule> = {
  barbarian: { fixed: { str: 2 }, oneOf: [{ wis: 2 }, { cha: 2 }], remaining: [0, 0, -1] },
  bard: { fixed: { cha: 2 }, oneOf: [{ dex: 1 }, { int: 1 }], remaining: [1, 0, -1] },
  cleric: { fixed: { wis: 2 }, oneOf: [{ str: 1 }, { cha: 1 }], remaining: [1, 0, -1] },
  druid: { fixed: { wis: 2 }, oneOf: [{ dex: 2 }, { cha: 2 }], remaining: [0, 0, -1] },
  fighter: {
    fixed: {},
    oneOf: [
      { str: 2, dex: 1 },
      { dex: 2, str: 1 },
    ],
    remaining: [1, 0, -1],
  },
  paladin: { fixed: { cha: 2 }, oneOf: [{ str: 2 }, { wis: 2 }], remaining: [0, 0, -1] },
  ranger: { fixed: { dex: 2 }, oneOf: [{ str: 2 }, { int: 2 }], remaining: [0, 0, -1] },
  rogue: { fixed: { dex: 2 }, oneOf: [{ wis: 1 }, { cha: 1 }], remaining: [1, 0, -1] },
  wizard: { fixed: { int: 2 }, oneOf: [{ dex: 1 }, { cha: 1 }], remaining: [1, 0, -1] },
};
