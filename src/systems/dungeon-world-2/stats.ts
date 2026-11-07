import type { ScoreAssignmentOption } from "../types";

const STAT_IDS = ["str", "dex", "int", "wis", "cha"] as const;
const STAT_NAMES: Record<(typeof STAT_IDS)[number], string> = {
  str: "STR",
  dex: "DEX",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

interface AssignmentRule {
  fixed: Record<string, number>;
  variants: { label: string; scores: Record<string, number> }[];
  remaining: number[];
}

function uniquePermutations(values: number[]): number[][] {
  if (!values.length) return [[]];
  const found = new Set<number>();
  return values.flatMap((value, index) => {
    if (found.has(value)) return [];
    found.add(value);
    const rest = values.filter((_, restIndex) => restIndex !== index);
    return uniquePermutations(rest).map((suffix) => [value, ...suffix]);
  });
}

function assignments(rule: AssignmentRule): ScoreAssignmentOption[] {
  const found = new Map<string, ScoreAssignmentOption>();
  for (const variant of rule.variants) {
    const fixed = { ...rule.fixed, ...variant.scores };
    const remainingStats = STAT_IDS.filter((stat) => !(stat in fixed));
    for (const remaining of uniquePermutations(rule.remaining)) {
      const scores = { ...fixed };
      remainingStats.forEach((stat, index) => {
        scores[stat] = remaining[index] ?? 0;
      });
      const values = STAT_IDS.map((stat) => `${STAT_NAMES[stat]} ${scores[stat]}`);
      const signature = STAT_IDS.map((stat) => scores[stat]).join(",");
      if (found.has(signature)) continue;
      found.set(signature, {
        id: `scores-${signature.replaceAll(",", "-")}`,
        name: values.join(", "),
        text: `Class-guided assignment: ${values.join(", ")}.`,
        scores,
      });
    }
  }
  return [...found.values()];
}

const rule = (
  fixed: Record<string, number>,
  variants: AssignmentRule["variants"],
  remaining: number[],
): AssignmentRule => ({ fixed, variants, remaining });

export const DW2_CLASS_SCORE_ASSIGNMENTS: Record<string, ScoreAssignmentOption[]> = {
  barbarian: assignments(
    rule(
      { str: 2 },
      [
        { label: "WIS +2", scores: { wis: 2 } },
        { label: "CHA +2", scores: { cha: 2 } },
      ],
      [0, 0, -1],
    ),
  ),
  bard: assignments(
    rule(
      { cha: 2 },
      [
        { label: "DEX +1", scores: { dex: 1 } },
        { label: "INT +1", scores: { int: 1 } },
      ],
      [1, 0, -1],
    ),
  ),
  cleric: assignments(
    rule(
      { wis: 2 },
      [
        { label: "STR +1", scores: { str: 1 } },
        { label: "CHA +1", scores: { cha: 1 } },
      ],
      [1, 0, -1],
    ),
  ),
  druid: assignments(
    rule(
      { wis: 2 },
      [
        { label: "DEX +2", scores: { dex: 2 } },
        { label: "CHA +2", scores: { cha: 2 } },
      ],
      [0, 0, -1],
    ),
  ),
  fighter: assignments(
    rule(
      {},
      [
        { label: "STR +2, DEX +1", scores: { str: 2, dex: 1 } },
        { label: "DEX +2, STR +1", scores: { dex: 2, str: 1 } },
      ],
      [1, 0, -1],
    ),
  ),
  paladin: assignments(
    rule(
      { cha: 2 },
      [
        { label: "STR +2", scores: { str: 2 } },
        { label: "WIS +2", scores: { wis: 2 } },
      ],
      [0, 0, -1],
    ),
  ),
  ranger: assignments(
    rule(
      { dex: 2 },
      [
        { label: "STR +2", scores: { str: 2 } },
        { label: "INT +2", scores: { int: 2 } },
      ],
      [0, 0, -1],
    ),
  ),
  rogue: assignments(
    rule(
      { dex: 2 },
      [
        { label: "WIS +1", scores: { wis: 1 } },
        { label: "CHA +1", scores: { cha: 1 } },
      ],
      [1, 0, -1],
    ),
  ),
  wizard: assignments(
    rule(
      { int: 2 },
      [
        { label: "DEX +1", scores: { dex: 1 } },
        { label: "CHA +1", scores: { cha: 1 } },
      ],
      [1, 0, -1],
    ),
  ),
};
