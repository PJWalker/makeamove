import type { DataValue } from "../../data/types";
import {
  atLevel,
  type ChoiceDef,
  type CreationDef,
  type OptionDef,
  type ScoreMethods,
  type ScoreRule,
  type StatDef,
} from "../../systems/types";
import { commaListOf } from "../../lib/list";

/*
 * The rules of the guided creation and advancement flow, apart from its UI:
 * which choices come when, what a point-buy spends, and what a finished
 * draft writes to the character. The system supplies the options as data
 * (see CreationDef).
 */

/** The character data field holding a character's class. */
export const CLASS_FIELD = "classId";

/** Choices available at creation or a system-defined advancement point. */
export function choicesAt(
  creation: CreationDef | undefined,
  at: "create" | number,
  data: Record<string, DataValue> = {},
  scores: Record<string, number> = {},
): ChoiceDef[] {
  const level = typeof at === "number" ? at : 1;
  const listValues = new Map<string, Set<string>>();
  const listHas = (field: string, value: string) => {
    let values = listValues.get(field);
    if (!values) {
      values = new Set(commaListOf(data[field]));
      listValues.set(field, values);
    }
    return values.has(value);
  };
  return (creation?.choices ?? []).flatMap((c) => {
    if (!(c.at === at || (c.at === "advance" && typeof at === "number"))) return [];
    const choice = {
      ...c,
      options: c.options.filter(
        (o) =>
          (!o.minLevel || level >= o.minLevel) &&
          Object.entries(o.requires ?? {}).every(([field, value]) => data[field] === value) &&
          (!o.requiresAny ||
            o.requiresAny.some((requirements) =>
              Object.entries(requirements).every(([field, value]) => data[field] === value),
            )) &&
          Object.entries(o.notRequires ?? {}).every(([field, value]) => data[field] !== value) &&
          (o.requiresFilled ?? []).every((field) => !!data[field]) &&
          (!o.requiresScoreBelow ||
            (scores[o.requiresScoreBelow.stat] ?? 0) <
              atLevel(o.requiresScoreBelow.value, level)) &&
          (o.limits ?? []).every(
            ({ field, prefix, max }) =>
              commaListOf(data[field]).filter(
                (value) => value && (!prefix || value.startsWith(prefix)),
              ).length < atLevel(max, level),
          ) &&
          (o.requiresIncludes ?? []).every(({ field, value }) => listHas(field, value)) &&
          (o.notIncludes ?? []).every(({ field, value }) => !listHas(field, value)),
      ),
    };
    return choice.options.length > 0 ? [choice] : [];
  });
}

export function previewChoices(
  creation: CreationDef | undefined,
  at: "create" | number,
  data: Record<string, DataValue>,
  scores: Record<string, number>,
  picked: Record<string, string>,
): ChoiceDef[] {
  const before = choicesAt(creation, at, data, scores);
  const preview = { ...data };
  for (const choice of before) {
    const option = choice.options.find((entry) => entry.id === picked[choice.id]);
    if (option) Object.assign(preview, option.grants);
  }
  const after = choicesAt(creation, at, preview, scores);
  return before.flatMap((choice) => {
    const updated = after.find((entry) => entry.id === choice.id) ?? { ...choice, options: [] };
    const selected = choice.options.find((entry) => entry.id === picked[choice.id]);
    const result =
      selected && !updated.options.some((entry) => entry.id === selected.id)
        ? { ...updated, options: [...updated.options, selected] }
        : updated;
    return result.options.length > 0 ? [result] : [];
  });
}

/** Points spent on a point-buy, or null if a score is outside what it can buy. */
export function pointsSpent(
  scores: Record<string, number>,
  buy: NonNullable<ScoreMethods["pointBuy"]>,
): number | null {
  let total = 0;
  for (const v of Object.values(scores)) {
    const cost = buy.costs[v];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const sortedKey = (values: number[]) => [...values].sort((a, b) => a - b).join(",");
const listed = (items: string[], last: string) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}` : (items[0] ?? "");

/** The alternatives a rule allows; one empty alternative when it has none. */
const alternativesOf = (rule: ScoreRule) => (rule.oneOf.length ? rule.oneOf : [{}]);

/** Scores that meet a rule: its set stats, its first alternative, then the remaining values in stat order. */
export function ruleStartingScores(rule: ScoreRule, stats: StatDef[]): Record<string, number> {
  const set = { ...rule.fixed, ...alternativesOf(rule)[0] };
  const rest = [...rule.remaining];
  return Object.fromEntries(
    stats.map((stat) => [stat.id, set[stat.id] ?? rest.shift() ?? stat.default ?? 0]),
  );
}

/** The scores a stat can take under a rule, highest first. */
export function ruleScoreValues(rule: ScoreRule): number[] {
  const values = [
    ...Object.values(rule.fixed),
    ...rule.oneOf.flatMap((alternative) => Object.values(alternative)),
    ...rule.remaining,
  ];
  return [...new Set(values)].sort((a, b) => b - a);
}

/** What keeps scores from meeting a rule; empty when they meet it. */
export function scoreRuleProblems(
  rule: ScoreRule,
  stats: StatDef[],
  scores: Record<string, number>,
): string[] {
  const abbr = (id: string) => stats.find((stat) => stat.id === id)?.abbr ?? id;
  const holds = (set: Record<string, number>) =>
    Object.entries(set).every(([stat, value]) => scores[stat] === value);
  const describe = (set: Record<string, number>) =>
    Object.entries(set)
      .map(([stat, value]) => `${abbr(stat)} ${signed(value)}`)
      .join(" with ");
  const problems = Object.entries(rule.fixed).flatMap(([stat, value]) =>
    scores[stat] !== value ? [`${abbr(stat)} must be ${signed(value)}.`] : [],
  );
  const alternatives = alternativesOf(rule).filter(holds);
  if (!alternatives.length) problems.push(`Choose ${listed(rule.oneOf.map(describe), "or")}.`);
  if (problems.length) return problems;
  const remainingMet = alternatives.some((alternative) => {
    const set = { ...rule.fixed, ...alternative };
    const others = stats.flatMap((stat) => (stat.id in set ? [] : [scores[stat.id] ?? 0]));
    return sortedKey(others) === sortedKey(rule.remaining);
  });
  return remainingMet
    ? []
    : [`The other stats must be ${listed(rule.remaining.map(signed), "and")}.`];
}

/** Stat increases from an option's boost: the chosen pattern of amounts, given to the chosen stats in order. */
export function boostFrom(
  option: OptionDef | undefined,
  pattern: number,
  order: string[],
): Record<string, number> {
  const amounts = option?.boost?.amounts[pattern];
  if (!option?.boost || !amounts) return {};
  const out: Record<string, number> = {};
  amounts.forEach((n, i) => {
    const stat = order[i];
    if (n && stat) out[stat] = (out[stat] ?? 0) + n;
  });
  return out;
}

export function validBoost(
  option: OptionDef | undefined,
  pattern: number,
  order: string[],
  scores: Record<string, number>,
  caps: Record<string, number>,
  blocked: string[] = [],
): boolean {
  if (!option?.boost) return !!option;
  const amounts = option.boost.amounts[pattern];
  if (!amounts) return false;
  const allowedStats = new Set(option.boost.stats);
  const blockedStats = new Set(blocked);
  const picked = order.filter((_, index) => (amounts[index] ?? 0) > 0);
  return (
    new Set(picked).size === picked.length &&
    amounts.every((amount, index) => {
      if (!amount) return true;
      const stat = order[index];
      return (
        !!stat &&
        allowedStats.has(stat) &&
        !blockedStats.has(stat) &&
        (scores[stat] ?? 0) < (caps[stat] ?? SCORE_CAP)
      );
    })
  );
}

/** The highest a stat can be raised to by creation and levelling. */
export const SCORE_CAP = 20;

/** Scores plus increases, capped. */
export function raise(
  scores: Record<string, number>,
  by: Record<string, number>,
  caps: Record<string, number> = {},
): Record<string, number> {
  const out = { ...scores };
  for (const [k, n] of Object.entries(by))
    out[k] = Math.min(caps[k] ?? SCORE_CAP, (out[k] ?? 10) + n);
  return out;
}

/** The data a set of chosen options writes: each choice's field, and each option's grants. A list field (feats) gathers. */
export function dataFrom(
  choices: ChoiceDef[],
  picked: Record<string, string>,
  listFields: string[] = [],
  previous: Record<string, DataValue> = {},
): Record<string, DataValue> {
  const out: Record<string, DataValue> = {};
  const add = (field: string, value: DataValue) => {
    if (listFields.includes(field) && out[field]) out[field] = `${out[field]},${value}`;
    else out[field] = value;
  };
  for (const c of choices) {
    const option = c.options.find((o) => o.id === picked[c.id]);
    if (!option) continue;
    add(c.field, option.id);
    for (const [k, v] of Object.entries(option.grants ?? {})) add(k, v);
    for (const change of option.dataBoost ?? [])
      out[change.field] = Number(out[change.field] ?? previous[change.field] ?? 0) + change.by;
  }
  return out;
}
