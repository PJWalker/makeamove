import { describe, expect, it } from 'vitest'
import { dungeonWorld as dw } from '../../systems/dungeon-world'
import { derive, type CharacterView } from '../store'
import { performMove, planMove } from '../moves'

const char = (over: Partial<CharacterView> = {}): CharacterView => ({
  id: 'c1',
  kind: 'pc',
  name: 'Ayla',
  owner: 'me',
  classId: 'fighter',
  level: 1,
  scores: { str: 16, dex: 9, con: 12, int: 8, wis: 13, cha: 6 },
  data: { race: '', alignment: '', xp: 0, coin: 0, hpBonus: 0 },
  resources: { hp: 10 },
  conditions: [],
  modifiers: {},
  fields: {},
  inventory: [],
  learned: [],
  ...over,
})
const move = (id: string) => dw.actions.find((m) => m.id === id)!
const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

describe('planMove', () => {
  it('adds the stat modifier with a label', () => {
    const c = char()
    expect(planMove(dw, move('hack-and-slash'), c, derive(c, dw)).formula).toBe('2d6+2[STR]')
  })

  it('applies debilities, forward and ongoing', () => {
    const c = char({ conditions: ['weak'], modifiers: { forward: 1, ongoing: -1 } })
    expect(planMove(dw, move('hack-and-slash'), c, derive(c, dw)).formula).toBe('2d6+2[STR]-1[Weak]+1[Forward]-1[Ongoing]')
  })

  it('uses the chosen stat for Defy Danger and the bond for Aid', () => {
    const c = char()
    const d = derive(c, dw)
    expect(planMove(dw, move('defy-danger'), c, d, { stat: 'wis' }).formula).toBe('2d6+1[WIS]')
    expect(planMove(dw, move('aid-or-interfere'), c, d, { ask: 1 }).formula).toBe('2d6+1[Bond]')
  })

  it('skips zero modifiers', () => {
    const c = char()
    expect(planMove(dw, move('defy-danger'), c, derive(c, dw), { stat: 'dex' }).formula).toBe('2d6')
  })
})

describe('performMove', () => {
  it('bands the total and offers follow-ups', () => {
    const c = char()
    const d = derive(c, dw)
    const hit = performMove(dw, move('hack-and-slash'), c, d, {}, seq(6, 6))
    expect(hit.result).toBe('strong')
    expect(hit.suggestions.map((s) => s.id)).toContain('damage')
    expect(hit.suggestions.find((s) => s.id === 'damage')).toMatchObject({ label: 'Roll damage (d10)', roll: { formula: 'd10', comment: 'Damage' } })
    const miss = performMove(dw, move('hack-and-slash'), c, d, {}, seq(1, 1))
    expect(miss.roll!.total).toBe(4)
    expect(miss.result).toBe('miss')
    expect(miss.suggestions.find((s) => s.id === 'xp')).toMatchObject({ label: 'Mark XP', bump: { field: 'xp', by: 1 } })
  })

  it('reads out moves that do not roll', () => {
    const c = char()
    const r = performMove(dw, dw.actions.find((m) => !m.steps.length)!, c, derive(c, dw))
    expect(r.roll).toBeUndefined()
    expect(r.outcome).not.toBe('')
  })
})

describe('spending modifiers', () => {
  it('uses up forward on a roll, but not ongoing', () => {
    const c = char({ modifiers: { forward: 2, ongoing: 1 } })
    const r = performMove(dw, move('hack-and-slash'), c, derive(c, dw), {}, seq(3, 3))
    expect(r.spent).toEqual(['forward'])
  })
})

describe('derive', () => {
  it('computes HP, load and damage from class and scores', () => {
    const d = derive(char(), dw)
    expect(d.values.maxHp).toBe(22)
    expect(d.values.maxLoad).toBe(14)
    expect(d.values.damage).toBe(10)
  })
})
