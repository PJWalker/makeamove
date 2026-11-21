import { commaListOf, formatCommaList } from "../lib/list";
import {
  boostFrom,
  dataFrom,
  previewChoices,
  raise,
  validBoost,
} from "../features/characters/creation";
import type { CharacterView } from "../features/characters/types";
import type { DataValue } from "../data/types";
import type { GameSystem } from "../systems/types";
import { listFieldsOf, scoreCapsOf, type Picked } from "./creationModel";

/** How an advancement raises ability scores: +2 to one, +1 to two, or a feat instead. */
export type Improvement = {
  kind: "two" | "split" | "feat";
  first: string;
  second: string;
  feat: string;
};

/** What advancing a character one rank asks, and what it will change. */
export function planAdvancement(
  system: GameSystem,
  c: CharacterView,
  picks: Record<string, Picked>,
  improvement: Improvement,
) {
  const creation = system.creation;
  const field = creation?.advancementField;
  const rank = Number(field ? c.data[field] : 1) + 1;
  const picked = Object.fromEntries(Object.entries(picks).map(([id, pick]) => [id, pick.option]));
  const choices = previewChoices(creation, rank, c.data, c.scores, picked);
  const improves = !!creation?.improvementsAt?.includes(rank);
  const markedStatsField = creation?.markedStatsField;
  const resetsMarks = !!creation?.resetMarkedStatsAt?.includes(rank);
  const blockedStats =
    markedStatsField && !resetsMarks ? commaListOf(c.data[markedStatsField]) : [];
  const caps = scoreCapsOf(system);
  const chosen = choices.flatMap((choice) => {
    const pick = picks[choice.id];
    const option = choice.options.find((item) => item.id === pick?.option);
    return pick && option ? [{ choice, pick, option }] : [];
  });
  const cost = chosen.reduce(
    (total, { choice, option }) => total + (choice.optional ? (option.cost ?? 1) : 0),
    0,
  );
  const ready =
    choices.every((choice) => choice.optional || !!picks[choice.id]?.option) &&
    chosen.every(({ pick, option }) =>
      validBoost(option, pick.pattern, pick.order, c.scores, caps, blockedStats),
    ) &&
    cost === (creation?.choicesPerAdvancement ?? 0) &&
    (!improves || improvement.kind !== "feat" || !!improvement.feat);

  // What to write: the rank, each pick's data, then the improvement, the raised scores and the marked stats.
  const data: [string, DataValue][] = [];
  if (field) data.push([field, rank]);
  let scores = c.scores;
  const marked = new Set(resetsMarks ? [] : blockedStats);
  for (const { pick, option } of chosen) {
    if (!option.boost) continue;
    scores = raise(scores, boostFrom(option, pick.pattern, pick.order), caps);
    if (option.boost.amounts[pick.pattern]) for (const [index, amount] of option.boost.amounts[pick.pattern].entries()) {
      if (amount && pick.order[index]) marked.add(pick.order[index]);
    }
  }
  const listFields = new Set(listFieldsOf(system));
  for (const [key, value] of Object.entries(dataFrom(choices, picked, [...listFields], c.data)))
    data.push([key, listFields.has(key) && c.data[key] ? `${c.data[key]},${value}` : value]);
  if (creation?.advancementCounterField) data.push([creation.advancementCounterField, 0]);
  if (improves) {
    const feats = creation?.feats;
    if (improvement.kind === "feat" && feats) {
      const now = String(c.data[feats.field] ?? "");
      data.push([feats.field, now ? `${now},${improvement.feat}` : improvement.feat]);
    } else {
      const by =
        improvement.kind === "two"
          ? { [improvement.first]: 2 }
          : { [improvement.first]: 1, [improvement.second]: 1 };
      scores = raise(scores, by, caps);
    }
  }
  if (markedStatsField) data.push([markedStatsField, formatCommaList([...marked])]);
  return {
    rank,
    choices,
    improves,
    blockedStats,
    ready,
    data,
    scores: Object.entries(scores).filter(([stat, score]) => score !== c.scores[stat]),
  };
}
