import * as Y from 'yjs'
import { newId } from '../lib/ids'
import type { Duration } from '../characters/store'

/*
 * The turn tracker (design: core change 11). One fight at a time per
 * campaign, in two root maps:
 *
 *   combat      Y.Map   round (0 before the fight starts), turn (combatant id)
 *   combatants  Y.Map   id -> Combatant
 *
 * Moving the turn on is where time passes: the combatant whose turn ends
 * counts down durations ticked at the end of their turn, the one whose turn
 * starts counts down those ticked at the start and refills resources that
 * reset each turn. These are pure functions over the maps, so the rules can
 * be tested without the app; combat/api.ts wires them to characters.
 */

export interface Combatant {
  name: string
  /** The character the combatant is, if any. */
  characterId?: string
  /** The token it stands for on a scene. */
  tokenId?: string
  sceneId?: string
  /** The initiative total; null until rolled or set. */
  init: number | null
  /** Breaks ties: higher goes first (5.5e: the Dexterity modifier). */
  tie: number
  /** Hidden from players until the GM reveals it. */
  hidden?: boolean
}

export interface CombatantView extends Combatant {
  id: string
}

export interface CombatMaps {
  combat: Y.Map<any>
  combatants: Y.Map<Combatant>
}

/** Initiative order: highest first, ties by `tie`, then by name; unrolled at the end. */
export function turnOrder(combatants: Y.Map<Combatant>): CombatantView[] {
  return [...combatants.entries()]
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => {
      if (a.init === null || b.init === null) return a.init === null ? (b.init === null ? a.name.localeCompare(b.name) : 1) : -1
      return b.init - a.init || b.tie - a.tie || a.name.localeCompare(b.name)
    })
}

export const roundOf = (m: CombatMaps): number => m.combat.get('round') ?? 0
export const turnOf = (m: CombatMaps): string | null => m.combat.get('turn') ?? null

export function addCombatant(m: CombatMaps, c: Combatant): string {
  const id = newId()
  m.combatants.set(id, c)
  return id
}

export function updateCombatant(m: CombatMaps, id: string, patch: Partial<Combatant>) {
  const c = m.combatants.get(id)
  if (c) m.combatants.set(id, { ...c, ...patch })
}

/** Remove a combatant; if it was their turn, the turn passes to the next. */
export function removeCombatant(m: CombatMaps, id: string) {
  m.combatants.doc!.transact(() => {
    if (turnOf(m) === id) {
      const order = turnOrder(m.combatants)
      const i = order.findIndex((c) => c.id === id)
      const next = order[(i + 1) % order.length]
      m.combat.set('turn', next && next.id !== id ? next.id : null)
    }
    m.combatants.delete(id)
  })
}

/** What happens when the turn moves: whose turn ended and whose began, and whether a new round started. */
export interface TurnChange {
  ended: string | null
  started: string | null
  newRound: boolean
}

/** Start the fight at round 1, with the first in initiative order. */
export function startCombat(m: CombatMaps): TurnChange {
  const first = turnOrder(m.combatants)[0]?.id ?? null
  m.combatants.doc!.transact(() => {
    m.combat.set('round', 1)
    m.combat.set('turn', first)
  })
  return { ended: null, started: first, newRound: true }
}

/** Pass the turn to the next combatant, starting a new round after the last. */
export function nextTurn(m: CombatMaps): TurnChange {
  const order = turnOrder(m.combatants)
  if (!order.length) return { ended: null, started: null, newRound: false }
  const now = turnOf(m)
  const i = order.findIndex((c) => c.id === now)
  const wraps = i === order.length - 1
  const next = order[wraps || i < 0 ? 0 : i + 1]
  m.combatants.doc!.transact(() => {
    if (wraps) m.combat.set('round', roundOf(m) + 1)
    m.combat.set('turn', next.id)
  })
  return { ended: now, started: next.id, newRound: wraps }
}

/** Step back a turn, for mistakes. Durations aren't wound back. */
export function previousTurn(m: CombatMaps) {
  const order = turnOrder(m.combatants)
  if (!order.length) return
  const i = order.findIndex((c) => c.id === turnOf(m))
  if (i <= 0 && roundOf(m) <= 1) return
  m.combatants.doc!.transact(() => {
    if (i <= 0) m.combat.set('round', roundOf(m) - 1)
    m.combat.set('turn', order[i <= 0 ? order.length - 1 : i - 1].id)
  })
}

/** End the fight: everyone leaves the tracker. */
export function endCombat(m: CombatMaps) {
  m.combatants.doc!.transact(() => {
    m.combat.set('round', 0)
    m.combat.delete('turn')
    for (const id of [...m.combatants.keys()]) m.combatants.delete(id)
  })
}

/**
 * Count down the durations that tick at this point of this combatant's turn.
 * Returns the durations left and the conditions that ran out.
 */
export function tickDurations(
  durations: Record<string, Duration>,
  combatant: string,
  tick: 'start' | 'end',
): { left: Record<string, Duration>; expired: string[] } {
  const left: Record<string, Duration> = {}
  const expired: string[] = []
  for (const [condition, d] of Object.entries(durations)) {
    if (d.of !== combatant || d.tick !== tick) left[condition] = d
    else if (d.rounds > 1) left[condition] = { ...d, rounds: d.rounds - 1 }
    else expired.push(condition)
  }
  return { left, expired }
}
