import { describe, expect, it } from 'vitest'
import { dungeonWorld as dw } from '../dungeon-world'
import { resolveEffects } from '../effects'

describe('resolveEffects', () => {
  it('applies set, then add, then multiply, then clamps', () => {
    const r = resolveEffects(
      { armor: 0 },
      [
        { name: 'Cap', effects: [{ type: 'modify', path: 'armor', op: 'max', value: 5 }] },
        { name: 'Double', effects: [{ type: 'modify', path: 'armor', op: 'multiply', value: 2 }] },
        { name: 'Mail', effects: [{ type: 'modify', path: 'armor', op: 'add', value: 2 }] },
        { name: 'Base', effects: [{ type: 'modify', path: 'armor', op: 'set', value: 1 }] },
      ],
    )
    // set 1, add 2 → 3, multiply 2 → 6, max 5 → 5
    expect(r.values.armor).toBe(5)
    expect(r.why.armor).toEqual(['Base: 0 → 1', 'Mail: 1 → 3', 'Double: 3 → 6', 'Cap: 6 → 5'])
  })

  it('orders by priority before phase', () => {
    const r = resolveEffects(
      { x: 1 },
      [
        { name: 'late', effects: [{ type: 'modify', path: 'x', op: 'set', value: 9, priority: 1 }] },
        { name: 'early', effects: [{ type: 'modify', path: 'x', op: 'add', value: 1 }] },
      ],
    )
    expect(r.values.x).toBe(9)
  })

  it('collects granted moves, tags and roll bonuses once', () => {
    const r = resolveEffects({}, [
      {
        name: 'Holy Symbol',
        effects: [
          { type: 'grantMove', move: 'turn-undead' },
          { type: 'grantMove', move: 'turn-undead' },
          { type: 'grantTag', tag: 'holy' },
          { type: 'rollBonus', moves: ['hack-and-slash'], value: 1 },
        ],
      },
    ])
    expect(r.moves).toEqual(['turn-undead'])
    expect(r.tags).toEqual(['holy'])
    expect(r.bonuses).toEqual([{ source: 'Holy Symbol', stat: undefined, moves: ['hack-and-slash'], value: 1 }])
  })

  it('is the same whichever order sources arrive in', () => {
    const a = { name: 'A', effects: [{ type: 'modify', path: 'x', op: 'add', value: 2 } as const] }
    const b = { name: 'B', effects: [{ type: 'modify', path: 'x', op: 'multiply', value: 3 } as const] }
    expect(resolveEffects({ x: 1 }, [a, b]).values.x).toBe(resolveEffects({ x: 1 }, [b, a]).values.x)
  })
})

describe('Dungeon World data', () => {
  it('maps scores to modifiers', () => {
    const m = dw.modifier
    expect([3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18].map(m)).toEqual([-3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 2, 3])
  })

  it('bands 2d6 results', () => {
    expect([12, 10, 9, 7, 6, 2].map(dw.band)).toEqual(['strong', 'strong', 'weak', 'weak', 'miss', 'miss'])
  })

  it('has unique ids, and every rolled move has outcomes for each band', () => {
    const ids = dw.moves.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of dw.moves) if (m.roll) expect(m.outcomes, m.id).toBeDefined()
    for (const m of dw.moves) if (m.roll && m.roll.stat !== 'choose' && m.roll.stat !== 'bond' && m.roll.stat !== 'none')
      expect(dw.stats.some((s) => s.id === m.roll!.stat), m.id).toBe(true)
    for (const m of dw.moves) if (m.classId) expect(dw.classes.some((c) => c.id === m.classId), m.id).toBe(true)
  })

  it('has eight classes', () => {
    expect(dw.classes).toHaveLength(8)
  })
})
