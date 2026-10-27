import { roll, type Roll } from '../dice/notation'
import type { MoveSuggestion } from '../chat/types'
import type { ActionDef, Ask, CheckStep, Derived, GameSystem } from '../systems/types'
import type { CharacterView } from './store'

/*
 * Making an action ("a move"): work out the formula for its check, roll it,
 * read out the result, and list the follow-ups to offer. Everything about
 * the numbers comes from the system: its base roll, stats, results,
 * modifiers and follow-ups.
 */

export interface MoveChoice {
  /** For actions that ask which stat to roll. */
  stat?: string
  /** For actions that ask for a number, such as a bond's bonus. */
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
export const checkOf = (action: ActionDef): CheckStep | undefined => action.steps.find((s) => s.kind === 'check')

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
}

/** Roll (or just read out) an action and decide what follow-ups to offer. */
export function performMove(
  system: GameSystem,
  action: ActionDef,
  c: CharacterView,
  d: Derived,
  choice: MoveChoice = {},
  die?: (sides: number) => number,
): MoveResult {
  const check = checkOf(action)
  const offer = (ids: string[]) =>
    ids.flatMap((id): MoveSuggestion[] => {
      const f = system.followUps.find((x) => x.id === id)
      if (!f) return []
      if (f.kind === 'bump') return [{ id: f.id, label: f.label, bump: { field: f.field, by: f.by } }]
      const formula = f.formula(c, d)
      return [{ id: f.id, label: `${f.label} (${formula})`, roll: { formula, comment: f.comment } }]
    })
  if (!check) return { outcome: action.text, suggestions: offer(action.followUps ?? []), spent: [] }
  const plan = planMove(system, action, c, d, choice)
  const r = roll(plan.formula, die)
  // The base roll is the first term; its kept dice are the natural roll (a d20's 20).
  const first = r.terms[0]
  const natural = first?.kind === 'dice' ? first.dice.filter((x) => x.kept).map((x) => x.value) : []
  const result = system.result(r.total, natural)
  return { roll: r, result, outcome: check.outcomes[result] ?? '', suggestions: offer(check.followUps?.[result] ?? []), spent: plan.spends }
}
