import {
  boostFrom,
  choicesAt,
  dataFrom,
  pointsSpent,
  raise,
  SCORE_CAP,
  scoreRuleProblems,
} from "../features/characters/creation";
import type { GameSystem, ScoreMethods, ScoreRule } from "../systems/types";

export { pointsSpent };

/** What's been picked for one choice, and how its boost is placed. */
export interface Picked {
  option: string;
  /** Index into the option's boost amounts. */
  pattern: number;
  /** Stats in the order the pattern's amounts go to. */
  order: string[];
}

export type ScoreMethod = "array" | "buy" | "roll" | "manual";

export const emptyPick = (): Picked => ({ option: "", pattern: 0, order: [] });

/** The methods a system offers, first the one to start with. */
export const scoreMethods = (methods: ScoreMethods): { id: ScoreMethod; label: string }[] => [
  ...(methods.standardArray ? [{ id: "array" as const, label: "Standard array" }] : []),
  ...(methods.pointBuy ? [{ id: "buy" as const, label: "Point buy" }] : []),
  ...(methods.roll ? [{ id: "roll" as const, label: "Roll" }] : []),
  { id: "manual", label: "Manual" },
];

export const assignInOrder = (system: GameSystem, pool: number[]) =>
  Object.fromEntries(system.stats.map((stat, index) => [stat.id, pool[index] ?? 10]));

/** The scores a method starts from. */
export const startingScores = (system: GameSystem, methods: ScoreMethods, method: ScoreMethod) =>
  method === "array" && methods.standardArray
    ? assignInOrder(system, methods.standardArray)
    : Object.fromEntries(
        system.stats.map((stat) => [
          stat.id,
          method === "buy" && methods.pointBuy
            ? Math.min(...Object.keys(methods.pointBuy.costs).map(Number))
            : (stat.default ?? 10),
        ]),
      );

export function scoresReady(
  system: GameSystem,
  methods: ScoreMethods,
  method: ScoreMethod,
  scores: Record<string, number>,
  rule?: ScoreRule,
): boolean {
  if (rule) return scoreRuleProblems(rule, system.stats, scores).length === 0;
  if (method !== "buy" || !methods.pointBuy) return true;
  const spent = pointsSpent(scores, methods.pointBuy);
  return spent !== null && spent <= methods.pointBuy.budget;
}

export function creationResult(
  system: GameSystem,
  scores: Record<string, number>,
  picks: Record<string, Picked>,
) {
  const pickedOptions = Object.fromEntries(
    Object.entries(picks).map(([id, pick]) => [id, pick.option]),
  );
  const pickedData: Record<string, string | number | boolean> = {};
  for (const choice of system.creation?.choices ?? []) {
    const option = choice.options.find((item) => item.id === pickedOptions[choice.id]);
    if (!option) continue;
    pickedData[choice.field] = option.id;
    Object.assign(pickedData, option.grants);
  }
  const choices = choicesAt(system.creation, "create", pickedData);
  let raised = scores;
  for (const choice of choices) {
    const pick = picks[choice.id];
    if (pick)
      raised = raise(
        raised,
        boostFrom(
          choice.options.find((option) => option.id === pick.option),
          pick.pattern,
          pick.order,
        ),
        Object.fromEntries(system.stats.map((stat) => [stat.id, stat.max ?? SCORE_CAP])),
      );
  }
  const data = dataFrom(choices, pickedOptions, listFieldsOf(system));
  return { scores: raised, data };
}

export const listFieldsOf = (system: GameSystem) => [
  ...(system.creation?.listFields ?? []),
  ...(system.creation?.feats ? [system.creation.feats.field] : []),
];

/** Each stat's highest score. */
export const scoreCapsOf = (system: GameSystem) =>
  Object.fromEntries(system.stats.map((stat) => [stat.id, stat.max ?? SCORE_CAP]));
