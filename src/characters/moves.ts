import { roll, type Roll } from '../dice/notation'
import type { MoveSuggestion } from '../chat/types'
import type { Band, MoveDef, GameSystem } from '../systems/types'
import type { CharacterView, Derived } from './store'

export interface MoveChoice {
  /** For 'choose' moves. */
  stat?: string
  /** For 'bond' moves: the bonus from the bond used. */
  bond?: number
  /** An extra situational bonus the player adds. */
  extra?: number
}

export interface MovePlan {
  formula: string
  /** True when a +forward is part of it and should be spent. */
  spendsForward: boolean
}

const signed = (n: number, label: string) => `${n < 0 ? '-' : '+'}${Math.abs(n)}[${label}]`

/** What the player has to be asked before this move can roll. */
export function needsChoice(move: MoveDef): 'stat' | 'bond' | null {
  if (move.roll?.stat === 'choose') return 'stat'
  if (move.roll?.stat === 'bond') return 'bond'
  return null
}

/**
 * The formula for a move: the base roll, then the stat, any debility, items,
 * +forward, +ongoing and the player's extra bonus. Every part carries a
 * label so the card shows where each number came from.
 */
export function planMove(
  system: GameSystem,
  move: MoveDef,
  c: CharacterView,
  d: Derived,
  choice: MoveChoice = {},
): MovePlan {
  let formula = system.baseRoll
  const stat = move.roll?.stat === 'choose' ? choice.stat : move.roll?.stat
  const def = stat ? system.stats.find((s) => s.id === stat) : undefined
  if (def) {
    const mod = d.mods[def.id] ?? 0
    if (mod) formula += signed(mod, def.abbr)
    const deb = system.debilities.find((x) => x.stat === def.id && c.debilities.includes(x.id))
    if (deb) formula += signed(-1, deb.name)
  }
  if (move.roll?.stat === 'bond' && choice.bond) formula += signed(choice.bond, 'Bond')
  for (const b of d.resolved.bonuses) {
    if (b.stat && b.stat !== def?.id) continue
    if (b.moves && !b.moves.includes(move.id)) continue
    formula += signed(b.value, b.source)
  }
  if (c.forward) formula += signed(c.forward, 'Forward')
  if (c.ongoing) formula += signed(c.ongoing, 'Ongoing')
  if (choice.extra) formula += signed(choice.extra, 'Bonus')
  return { formula, spendsForward: c.forward !== 0 }
}

export interface MoveResult {
  roll?: Roll
  band?: Band
  outcome: string
  suggestions: MoveSuggestion[]
}

/** Roll (or just read out) a move and decide what follow-ups to offer. */
export function performMove(
  system: GameSystem,
  move: MoveDef,
  c: CharacterView,
  d: Derived,
  choice: MoveChoice = {},
  die?: (sides: number) => number,
): MoveResult {
  if (!move.roll || !move.outcomes) return { outcome: move.text, suggestions: [] }
  const plan = planMove(system, move, c, d, choice)
  const r = roll(plan.formula, die)
  const band = system.band(r.total)
  const suggestions: MoveSuggestion[] = (move.suggest?.[band] ?? []).map((kind) =>
    kind === 'damage'
      ? { kind, formula: `d${d.damage}${d.damageBonus ? signed(d.damageBonus, 'Gear') : ''}` }
      : { kind },
  )
  return { roll: r, band, outcome: move.outcomes[band], suggestions }
}
