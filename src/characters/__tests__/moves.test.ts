import { describe, expect, it } from 'vitest'
import { dungeonWorld as dw } from '../../systems/dungeon-world'
import { derive, type CharacterView } from '../store'
import { performMove, planMove } from '../moves'

const char = (over: Partial<CharacterView> = {}): CharacterView => ({
  id: 'c1',
  kind: 'pc',
  maxHp: 6,
  fields: {},
  name: 'Ayla',
  owner: 'me',
  classId: 'fighter',
  race: '',
  alignment: '',
  level: 1,
  xp: 0,
  hp: 10,
  hpBonus: 0,
  scores: { str: 16, dex: 9, con: 12, int: 8, wis: 13, cha: 6 },
  debilities: [],
  bonds: '',
  notes: '',
  coin: 0,
  forward: 0,
  ongoing: 0,
  inventory: [],
  ...over,
})
const move = (id: string) => dw.moves.find((m) => m.id === id)!
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
    const c = char({ debilities: ['weak'], forward: 1, ongoing: -1 })
    expect(planMove(dw, move('hack-and-slash'), c, derive(c, dw)).formula).toBe('2d6+2[STR]-1[Weak]+1[Forward]-1[Ongoing]')
  })

  it('uses the chosen stat for Defy Danger and the bond for Aid', () => {
    const c = char()
    const d = derive(c, dw)
    expect(planMove(dw, move('defy-danger'), c, d, { stat: 'wis' }).formula).toBe('2d6+1[WIS]')
    expect(planMove(dw, move('aid-or-interfere'), c, d, { bond: 1 }).formula).toBe('2d6+1[Bond]')
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
    expect(hit.band).toBe('strong')
    expect(hit.suggestions.map((s) => s.kind)).toContain('damage')
    const miss = performMove(dw, move('hack-and-slash'), c, d, {}, seq(1, 1))
    expect(miss.roll!.total).toBe(4)
    expect(miss.band).toBe('miss')
    expect(miss.suggestions.map((s) => s.kind)).toContain('xp')
  })

  it('reads out moves that do not roll', () => {
    const c = char()
    const r = performMove(dw, dw.moves.find((m) => !m.roll)!, c, derive(c, dw))
    expect(r.roll).toBeUndefined()
    expect(r.outcome).not.toBe('')
  })
})

describe('derive', () => {
  it('computes HP, load and damage from class and scores', () => {
    const d = derive(char(), dw)
    expect(d.maxHp).toBe(22)
    expect(d.maxLoad).toBe(14)
    expect(d.damage).toBe(10)
  })
})
