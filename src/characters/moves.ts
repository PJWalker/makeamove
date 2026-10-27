import { roll, type Roll } from '../dice/notation'
import type { MoveSuggestion, MoveTarget, SaveRequest } from '../chat/types'
import type { ActionDef, Ask, CheckStep, Derived, GameSystem, SaveStep } from '../systems/types'
import type { CharacterView } from './store'

/*
 * Making a move: work out the formula for its check, roll it,
 * read out the result, and list the follow-ups to offer. Everything about
 * the numbers comes from the system: its base roll, stats, results,
 * modifiers and follow-ups.
 */

export interface MoveChoice {
  /** For moves that ask which stat to roll. */
  stat?: string
  /** For moves that ask for a number, such as a bond's bonus. */
  ask?: number
  /** An extra situational bonus the player adds. */
  extra?: number
  /** One of the system's roll modes (advantage), instead of its base roll. */
  mode?: string
}

export interface MovePlan {
  formula: string
  /** Modifiers the roll uses up, by id. */
  spends: string[]
}

const signed = (n: number, label: string) => `${n < 0 ? '-' : '+'}${Math.abs(n)}[${label}]`

/** The check an action rolls, if it rolls one. */
export const checkOf = (action: ActionDef): CheckStep | undefined => action.steps.find((s): s is CheckStep => s.kind === 'check')

/** The roll request an action makes of its targets, if it makes one. */
export const saveOf = (action: ActionDef): SaveStep | undefined => action.steps.find((s): s is SaveStep => s.kind === 'save')

/** What the player has to be asked before this action can roll. */
export function needsChoice(action: ActionDef): Ask | null {
  return checkOf(action)?.ask ?? null
}

/** Whether using this action opens the roll dialog: it asks for something, or the system offers roll modes. */
export function asksFirst(system: GameSystem, action: ActionDef): boolean {
  return !!needsChoice(action) || (!!system.rollModes?.length && !!checkOf(action))
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
  const check = checkOf(action)
  let formula = system.rollModes?.find((m) => m.id === choice.mode)?.roll ?? system.baseRoll
  const stat = check?.ask?.kind === 'stat' ? choice.stat : check?.stat
  const def = stat ? system.stats.find((s) => s.id === stat) : undefined
  if (def) {
    const mod = d.mods[def.id] ?? 0
    if (mod) formula += signed(mod, def.abbr)
  }
  for (const a of check?.add ?? []) {
    const n = d.values[a.value] ?? 0
    if (n) formula += signed(n, a.label)
  }
  const bonuses = d.resolved.bonuses.filter((b) => (!b.stat || b.stat === def?.id) && (!b.moves || b.moves.includes(action.id)))
  // Bonuses tied to the stat come straight after it, then the asked-for number, then the rest.
  for (const b of bonuses) if (b.stat) formula += signed(b.value, b.source)
  if (check?.ask?.kind === 'number' && choice.ask) formula += signed(choice.ask, check.ask.label)
  for (const b of bonuses) if (!b.stat) formula += signed(b.value, b.source)
  const spends: string[] = []
  for (const m of system.modifiers) {
    const value = c.modifiers[m.id] ?? 0
    if (!value) continue
    formula += signed(value, m.label)
    if (m.until === 'next-roll') spends.push(m.id)
  }
  if (choice.extra) formula += signed(choice.extra, 'Bonus')
  return { formula, spends }
}

export interface MoveResult {
  roll?: Roll
  /** The check's result id, as the system names them ("strong"). */
  result?: string
  outcome: string
  suggestions: MoveSuggestion[]
  /** Modifiers the roll used up, to clear on the character. */
  spent: string[]
  /** The targets, with each one's roll and whether it hit, for a check against targets. */
  targets?: MoveTarget[]
  save?: SaveRequest
}

/** What a move needs to know about its targets. */
export interface TargetContext {
  targets?: MoveTarget[]
  /** One of a target's derived values ("ac"), if it stands for a character. */
  valueAt?: (t: MoveTarget, key: string) => number | undefined
}

/** The kept dice of a roll's first term: the natural roll (a d20's 20). */
function naturalOf(r: Roll): number[] {
  const first = r.terms[0]
  return first?.kind === 'dice' ? first.dice.filter((x) => x.kept).map((x) => x.value) : []
}

/** The roll mode for one target: at long range the system's mode, unless the player's choice cancels it. */
function modeFor(system: GameSystem, chosen: string | undefined, long: boolean | undefined): string | undefined {
  const lr = system.longRange
  if (!long || !lr) return chosen
  if (chosen === lr.cancels) return undefined
  return lr.mode
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
  const { targets, valueAt } = aim
  const check = checkOf(action)
  const offer = (ids: string[], aimed?: MoveTarget[]) =>
    ids.flatMap((id): MoveSuggestion[] => {
      const f = system.followUps.find((x) => x.id === id)
      if (!f) return []
      if (f.kind === 'bump') return [{ id: f.id, label: f.label, bump: { field: f.field, by: f.by } }]
      const formula = f.formula(c, d)
      const damage = f.damage && aimed?.length ? { damage: f.damage, targets: aimed.map(({ id, name, characterId }) => ({ id, name, ...(characterId ? { characterId } : {}) })) } : {}
      return [{ id: f.id, label: `${f.label} (${formula})`, roll: { formula, comment: f.comment, ...damage } }]
    })
  const step = saveOf(action)
  const save: SaveRequest | undefined = step && {
    action: step.action,
    name: system.actions.find((a) => a.id === step.action)?.name ?? step.action,
    dc: d.values[step.dc] ?? 0,
    success: step.success,
    failure: step.failure,
  }
  if (!check) {
    return {
      outcome: action.text,
      suggestions: offer(action.followUps ?? [], targets),
      spent: [],
      ...(targets ? { targets } : {}),
      ...(save ? { save } : {}),
    }
  }
  // Against targets: one roll each, read against that target's value.
  if (check.against && targets?.length) {
    const spends = planMove(system, action, c, d, choice).spends
    const rolled = targets.map((t): MoveTarget => {
      const plan = planMove(system, action, c, d, { ...choice, mode: modeFor(system, choice.mode, t.long) })
      const r = roll(plan.formula, die)
      const natural = naturalOf(r)
      const result = system.result(r.total, natural)
      const against = valueAt?.(t, check.against!)
      const hit = against === undefined ? undefined : system.hits ? system.hits(r.total, natural, against) : r.total >= against
      return { ...t, roll: r, result, ...(against !== undefined ? { against, hit } : {}) }
    })
    // Follow-ups for the best result that hit (or might have, against an unknown value).
    const landed = rolled.filter((t) => t.hit !== false)
    const best = system.results.find((res) => landed.some((t) => t.result === res.id))?.id
    const outcome = best ? check.outcomes[best] ?? '' : check.outcomes[rolled[0].result!] ?? ''
    return {
      targets: rolled,
      outcome,
      suggestions: best ? offer(check.followUps?.[best] ?? [], landed) : [],
      spent: spends,
    }
  }
  const plan = planMove(system, action, c, d, { ...choice, mode: modeFor(system, choice.mode, targets?.some((t) => t.long)) })
  const r = roll(plan.formula, die)
  const result = system.result(r.total, naturalOf(r))
  return {
    roll: r,
    result,
    outcome: check.outcomes[result] ?? '',
    suggestions: offer(check.followUps?.[result] ?? [], targets),
    spent: plan.spends,
    ...(targets ? { targets } : {}),
  }
}
