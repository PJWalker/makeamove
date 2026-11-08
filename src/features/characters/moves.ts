import { roll, type Roll } from "../dice/notation";

import type { MoveSuggestion, MoveTarget, SaveRequest } from "../chat/types";
import type {
  ActionDef,
  Ask,
  CheckDifficulty,
  CheckStep,
  Derived,
  GameSystem,
  SaveStep,
} from "../../systems/types";
import type { CharacterView } from "./types";

/*
 * Making a move: work out the formula for its check, roll it,
 * read out the result, and list the follow-ups to offer. Everything about
 * the numbers comes from the system: its base roll, stats, results,
 * modifiers and follow-ups.
 */

export interface MoveChoice {
  /** For moves that ask which stat to roll. */
  stat?: string | undefined;
  /** For moves that ask for a number, such as a bond's bonus. */
  ask?: number | undefined;
  /** An extra situational bonus the player adds. */
  extra?: number | undefined;
  /** One of the system's roll modes (advantage), instead of its base roll. */
  mode?: string | undefined;
  difficulty?: number | undefined;
  rollBonuses?: string[] | undefined;
  variant?: string | undefined;
  counterMessageId?: string | undefined;
}

export interface MovePlan {
  formula: string;
  /** Modifiers the roll uses up, by id. */
  spends: string[];
  resources: { id: string; by: number }[];
  rollValues: Record<string, number>;
}

const signed = (n: number, label: string) => `${n < 0 ? "-" : "+"}${Math.abs(n)}[${label}]`;

/** The check an action rolls, if it rolls one. */
export const checkOf = (action: ActionDef): CheckStep | undefined =>
  action.steps.find((s): s is CheckStep => s.kind === "check");

/** The roll request an action makes of its targets, if it makes one. */
export const saveOf = (action: ActionDef): SaveStep | undefined =>
  action.steps.find((s): s is SaveStep => s.kind === "save");

/** What the player has to be asked before this action can roll. */
export function needsChoice(action: ActionDef): Ask | null {
  return checkOf(action)?.ask ?? null;
}

/** Whether using this action opens the roll dialog: it asks for something, or the system offers roll modes. */
export function asksFirst(system: GameSystem, action: ActionDef): boolean {
  return !!needsChoice(action) || (!!rollModesFor(system, action).length && !!checkOf(action));
}

export function rollModesFor(system: GameSystem, action: ActionDef) {
  return (system.rollModes ?? []).filter(
    (mode) => !mode.categories || mode.categories.includes(action.category),
  );
}

export function resolveDifficulty(
  spec: CheckDifficulty,
  derived: Derived,
  chosen?: number,
  target?: number,
): number {
  const value =
    spec.kind === "fixed"
      ? spec.value
      : spec.kind === "derived"
        ? derived.values[spec.value]
        : spec.kind === "target"
          ? (target ?? chosen)
          : (chosen ?? spec.initial);
  if (value === undefined || !Number.isFinite(value)) throw new Error("Difficulty must be finite");
  if (spec.kind === "prompt" && (value < (spec.min ?? 0) || value > (spec.max ?? 99)))
    throw new Error("Difficulty is outside the allowed range");
  return value;
}

export function canPayMove(c: CharacterView, plan: MovePlan): boolean {
  return plan.resources.every(({ id, by }) => (c.resources[id] ?? 0) + by >= 0);
}

function resourcesFor(
  action: ActionDef,
  variantCosts: { resource: string; by: number }[],
  bonusCosts: { resource: string; by: number }[],
) {
  const totals = new Map<string, number>();
  for (const { resource, by } of [...(action.costs ?? []), ...variantCosts, ...bonusCosts])
    totals.set(resource, (totals.get(resource) ?? 0) + by);
  return [...totals].filter(([, by]) => by !== 0).map(([id, by]) => ({ id, by }));
}

/**
 * The formula for an action's check: the base roll, then the stat, every
 * bonus that applies (conditions first, then items), the asked-for number,
 * the character's standing modifiers and the player's extra bonus. Every
 * part carries a label so the card shows where each number came from.
 */
export function planMove(
  system: GameSystem,
  action: ActionDef,
  c: CharacterView,
  d: Derived,
  choice: MoveChoice = {},
): MovePlan {
  const check = checkOf(action);
  const variants = action.variants?.(c, d) ?? [];
  const variant = variants.find((entry) => entry.id === choice.variant) ?? variants[0];
  const rollValues = variant?.values ?? {};
  let formula =
    rollModesFor(system, action).find((m) => m.id === choice.mode)?.roll ?? system.baseRoll;
  const stat = check?.ask?.kind === "stat" ? choice.stat : check?.stat;
  const def = stat ? system.stats.find((s) => s.id === stat) : undefined;
  // The stat goes in even at +0, so its chip shows which stat was rolled.
  if (def) formula += signed(d.mods[def.id] ?? 0, def.abbr);
  for (const a of check?.add ?? []) {
    const n = d.values[a.value] ?? 0;
    if (n) formula += signed(n, a.label);
  }
  const bonuses = d.resolved.bonuses.filter(
    (b) => (!b.stat || b.stat === def?.id) && (!b.moves || b.moves.includes(action.id)),
  );
  // Bonuses tied to the stat come straight after it, then the asked-for number, then the rest.
  for (const b of bonuses) if (b.stat) formula += signed(b.value, b.source);
  if ((check?.ask?.kind === "number" || check?.ask?.kind === "questions") && choice.ask)
    formula += signed(choice.ask, check.ask.label);
  const selectedBonuses = (check?.rollBonuses ?? []).filter((bonus) =>
    choice.rollBonuses?.includes(bonus.id),
  );
  const bonusCosts: { resource: string; by: number }[] = [];
  for (const bonus of selectedBonuses) {
    const value = Number(c.data[bonus.valueField] ?? 0);
    const label = bonus.nameField ? String(c.data[bonus.nameField] ?? "").trim() : "";
    if (value) formula += signed(value, label || bonus.label);
    if (bonus.cost)
      bonusCosts.push({
        resource: bonus.cost.resource,
        by: -Math.abs(bonus.cost.by),
      });
  }
  for (const b of bonuses) if (!b.stat) formula += signed(b.value, b.source);
  const spends: string[] = [];
  for (const m of system.modifiers) {
    const value = c.modifiers[m.id] ?? 0;
    if (!value) continue;
    formula += signed(value, m.label);
    if (m.until === "next-roll") spends.push(m.id);
  }
  if (choice.extra) formula += signed(choice.extra, "Bonus");
  formula = system.checkRoll?.(formula, stat, c, action) ?? formula;
  return {
    formula,
    spends,
    resources: resourcesFor(action, variant?.costs ?? [], bonusCosts),
    rollValues,
  };
}

export interface MoveResult {
  roll?: Roll;
  /** The check's result id, as the system names them ("strong"). */
  result?: string;
  outcome: string;
  suggestions: MoveSuggestion[];
  /** Modifiers the roll used up, to clear on the character. */
  spent: string[];
  /** The targets, with each one's roll and whether it hit, for a check against targets. */
  targets?: MoveTarget[];
  save?: SaveRequest;
  resourcesSpent?: { id: string; by: number }[];
  rollValues?: Record<string, number>;
  difficulty?: number;
  counterMessageId?: string;
}

/** What a move needs to know about its targets. */
export interface TargetContext {
  targets?: MoveTarget[];
  /** One of a target's derived values ("ac"), if it stands for a character. */
  valueAt?: (t: MoveTarget, key: string) => number | undefined;
}

/** The kept dice of a roll's first term: the natural roll (a d20's 20). */
function naturalOf(r: Roll): number[] {
  const first = r.terms[0];
  return first?.kind === "dice" ? first.dice.filter((x) => x.kept).map((x) => x.value) : [];
}

/** The roll mode for one target: at long range the system's mode, unless the player's choice cancels it. */
function modeFor(
  system: GameSystem,
  chosen: string | undefined,
  long: boolean | undefined,
): string | undefined {
  const lr = system.longRange;
  if (!long || !lr) return chosen;
  if (chosen === lr.cancels) return undefined;
  return lr.mode;
}

/** Roll (or just read out) a move and decide what follow-ups to offer. */
export function performMove(
  system: GameSystem,
  action: ActionDef,
  c: CharacterView,
  d: Derived,
  choice: MoveChoice = {},
  die?: (sides: number) => number,
  aim: TargetContext = {},
): MoveResult {
  const { targets, valueAt } = aim;
  const check = checkOf(action);
  if (action.variants && !action.variants(c, d).length) throw new Error("Not enough resources");
  const basePlan = planMove(system, action, c, d, choice);
  if (!canPayMove(c, basePlan)) throw new Error("Not enough resources");
  const difficulty = check?.difficulty
    ? check.difficulty.kind === "target"
      ? undefined
      : resolveDifficulty(check.difficulty, d, choice.difficulty)
    : undefined;
  const sharedResult = {
    ...(basePlan.resources.length ? { resourcesSpent: basePlan.resources } : {}),
    ...(Object.keys(basePlan.rollValues).length ? { rollValues: basePlan.rollValues } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    ...(choice.counterMessageId ? { counterMessageId: choice.counterMessageId } : {}),
  };
  const offer = (ids: string[], aimed?: MoveTarget[]) =>
    ids.flatMap((id): MoveSuggestion[] => {
      const f = system.followUps.find((x) => x.id === id);
      if (!f) return [];
      if (f.kind === "bump")
        return [{ id: f.id, label: f.label, bump: { field: f.field, by: f.by } }];
      if (f.kind === "resource")
        return [{ id: f.id, label: f.label, resource: { id: f.resource, by: f.by } }];
      if (f.kind === "counter")
        return [
          {
            id: f.id,
            label: f.label,
            count: {
              ...(f.systemCounter ? { systemCounter: f.systemCounter } : {}),
              ...(choice.counterMessageId ? { messageId: choice.counterMessageId } : {}),
              by: f.by,
            },
          },
        ];
      const formula = f.formula(c, {
        ...d,
        values: { ...d.values, ...basePlan.rollValues },
      });
      const damage =
        f.damage && aimed?.length
          ? {
              damage: f.damage,
              targets: aimed.map(({ id, name, characterId }) => ({
                id,
                name,
                ...(characterId ? { characterId } : {}),
              })),
            }
          : {};
      return [
        {
          id: f.id,
          label: `${f.label} (${formula})`,
          roll: { formula, comment: f.comment, ...damage },
        },
      ];
    });
  const step = saveOf(action);
  const save: SaveRequest | undefined = step && {
    action: step.action,
    name: system.actions.find((a) => a.id === step.action)?.name ?? step.action,
    difficulty: resolveDifficulty(step.difficulty, d, choice.difficulty),
    success: step.success,
    failure: step.failure,
  };
  if (!check) {
    return {
      outcome: action.text,
      suggestions: offer(action.followUps ?? [], targets),
      spent: [],
      ...(targets ? { targets } : {}),
      ...(save ? { save } : {}),
      ...sharedResult,
    };
  }
  // Against targets: one roll each, read against that target's value.
  const targetDifficulty = check.difficulty?.kind === "target" ? check.difficulty : undefined;
  if (targetDifficulty && targets?.length) {
    const spends = basePlan.spends;
    const rolled = targets.map((t): MoveTarget => {
      const plan = planMove(system, action, c, d, {
        ...choice,
        mode: modeFor(system, choice.mode, t.long),
      });
      const r = roll(plan.formula, die);
      const natural = naturalOf(r);
      const targetValue = valueAt?.(t, targetDifficulty.value);
      const against =
        targetValue !== undefined || choice.difficulty !== undefined
          ? resolveDifficulty(targetDifficulty, d, choice.difficulty, targetValue)
          : undefined;
      const context = {
        action,
        character: c,
        ...(against !== undefined ? { difficulty: against } : {}),
      };
      const result = system.result(r.total, natural, r, context);
      const hit =
        against === undefined
          ? undefined
          : system.hits
            ? system.hits(r.total, natural, against, r, context)
            : r.total >= against;
      return {
        ...t,
        roll: r,
        result,
        ...(against !== undefined ? { against, ...(hit !== undefined ? { hit } : {}) } : {}),
      };
    });
    // Follow-ups for the best result that hit (or might have, against an unknown value).
    const landed = rolled.filter((t) => t.hit !== false);
    const best = system.results.find((res) => landed.some((t) => t.result === res.id))?.id;
    const outcome = best
      ? (check.outcomes[best] ?? "")
      : (check.outcomes[rolled[0]!.result!] ?? "");
    return {
      targets: rolled,
      outcome,
      suggestions: best ? offer(check.followUps?.[best] ?? [], landed) : [],
      spent: spends,
      ...sharedResult,
    };
  }
  const plan = planMove(system, action, c, d, {
    ...choice,
    mode: modeFor(
      system,
      choice.mode,
      targets?.some((t) => t.long),
    ),
  });
  const r = roll(plan.formula, die);
  const result = system.result(r.total, naturalOf(r), r, {
    action,
    character: c,
    ...(difficulty !== undefined ? { difficulty } : {}),
  });
  const followUps = [
    ...(check.followUps?.[result] ?? []),
    ...(check.followUpsFor?.(r, c, d) ?? []),
  ];
  return {
    roll: r,
    result,
    outcome: check.outcomes[result] ?? "",
    suggestions: offer(followUps, targets),
    spent: plan.spends,
    ...sharedResult,
    ...(targets ? { targets } : {}),
  };
}

/** Recompute a move card's outcome after its shared roll has been edited. */
export function readRollResult(
  system: GameSystem,
  action: ActionDef,
  character: CharacterView,
  derived: Derived,
  resultRoll: Roll,
  targets?: MoveTarget[],
  difficulty?: number,
  counterMessageId?: string,
): Partial<MoveResult> {
  const check = checkOf(action);
  if (!check) return { outcome: action.text, suggestions: [] };
  const result = system.result(resultRoll.total, naturalOf(resultRoll), resultRoll, {
    action,
    character,
    ...(difficulty !== undefined ? { difficulty } : {}),
  });
  const suggestions = (check.followUps?.[result] ?? []).flatMap((id): MoveSuggestion[] => {
    const followUp = system.followUps.find((entry) => entry.id === id);
    if (!followUp) return [];
    if (followUp.kind === "bump")
      return [{ id, label: followUp.label, bump: { field: followUp.field, by: followUp.by } }];
    if (followUp.kind === "resource")
      return [{ id, label: followUp.label, resource: { id: followUp.resource, by: followUp.by } }];
    if (followUp.kind === "counter")
      return [
        {
          id,
          label: followUp.label,
          count: {
            ...(followUp.systemCounter ? { systemCounter: followUp.systemCounter } : {}),
            ...(counterMessageId ? { messageId: counterMessageId } : {}),
            by: followUp.by,
          },
        },
      ];
    const formula = followUp.formula(character, derived);
    const damage =
      followUp.damage && targets?.length
        ? {
            damage: followUp.damage,
            targets: targets.map(({ id: targetId, name, characterId }) => ({
              id: targetId,
              name,
              ...(characterId ? { characterId } : {}),
            })),
          }
        : {};
    return [
      {
        id,
        label: `${followUp.label} (${formula})`,
        roll: { formula, comment: followUp.comment, ...damage },
      },
    ];
  });
  return {
    result,
    outcome: check.outcomes[result] ?? "",
    suggestions,
    spent: [],
    ...(targets ? { targets } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    ...(counterMessageId ? { counterMessageId } : {}),
  };
}
