import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { addCombatant, endCombat, nextTurn, previousTurn, removeCombatant, roundOf, startCombat, tickDurations, turnOf, turnOrder, type Combatant } from '../combat'

function fight(...people: Partial<Combatant>[]) {
  const doc = new Y.Doc()
  const m = { combat: doc.getMap<any>('combat'), combatants: doc.getMap<Combatant>('combatants') }
  const ids = people.map((p, i) => addCombatant(m, { name: `C${i}`, init: null, tie: 0, ...p }))
  return { m, ids }
}

describe('the turn tracker', () => {
  it('orders by initiative, then tie-breaker, then name, unrolled last', () => {
    const { m } = fight({ name: 'Ann', init: 12 }, { name: 'Bo', init: 15 }, { name: 'Cy', init: 12, tie: 3 }, { name: 'Di', init: null })
    expect(turnOrder(m.combatants).map((c) => c.name)).toEqual(['Bo', 'Cy', 'Ann', 'Di'])
  })

  it('goes round in order, counting rounds', () => {
    const { m, ids } = fight({ init: 20 }, { init: 10 })
    expect(startCombat(m)).toEqual({ ended: null, started: ids[0], newRound: true })
    expect(roundOf(m)).toBe(1)
    expect(nextTurn(m)).toEqual({ ended: ids[0], started: ids[1], newRound: false })
    expect(nextTurn(m)).toEqual({ ended: ids[1], started: ids[0], newRound: true })
    expect(roundOf(m)).toBe(2)
    previousTurn(m)
    expect([roundOf(m), turnOf(m)]).toEqual([1, ids[1]])
  })

  it('passes the turn on when the current combatant leaves, and ends cleanly', () => {
    const { m, ids } = fight({ init: 20 }, { init: 10 })
    startCombat(m)
    removeCombatant(m, ids[0])
    expect(turnOf(m)).toBe(ids[1])
    endCombat(m)
    expect([roundOf(m), turnOf(m), m.combatants.size]).toEqual([0, null, 0])
  })

  it('counts down durations on the right turn, and expires them', () => {
    const durations = {
      stunned: { rounds: 1, tick: 'start' as const, of: 'a' },
      prone: { rounds: 2, tick: 'end' as const, of: 'a' },
      blinded: { rounds: 1, tick: 'end' as const, of: 'b' },
    }
    expect(tickDurations(durations, 'a', 'start')).toEqual({
      left: { prone: durations.prone, blinded: durations.blinded },
      expired: ['stunned'],
    })
    expect(tickDurations(durations, 'a', 'end').left.prone.rounds).toBe(1)
  })
})
