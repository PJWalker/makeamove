import { describe, expect, it } from 'vitest'
import { dungeonWorld as dw } from '../dungeon-world'
import { checkSystem, defineSystem } from '..'
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
    expect([12, 10, 9, 7, 6, 2].map((t) => dw.result(t, []))).toEqual(['strong', 'strong', 'weak', 'weak', 'miss', 'miss'])
    expect(dw.results.map((r) => r.label)).toEqual(['Full success', 'Partial success', 'Miss'])
  })

  it('has unique ids, and every rolled move has outcomes for each band', () => {
    const ids = dw.actions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of dw.actions)
      for (const step of m.steps) {
        if (step.kind !== 'check') continue
        for (const r of dw.results) expect(step.outcomes[r.id], `${m.id} ${r.id}`).toBeDefined()
        if (step.stat) expect(dw.stats.some((s) => s.id === step.stat), m.id).toBe(true)
        for (const ids of Object.values(step.followUps ?? {}))
          for (const f of ids) expect(dw.followUps.some((x) => x.id === f), `${m.id} ${f}`).toBe(true)
      }
    for (const m of dw.actions) if (m.classId) expect(dw.classes.some((c) => c.id === m.classId), m.id).toBe(true)
    for (const m of dw.actions) expect(dw.actionCategories.some((k) => k.id === m.category), m.id).toBe(true)
  })

  it('has eight classes', () => {
    expect(dw.classes).toHaveLength(8)
  })
})

describe('tokenStats', () => {
  it('shows HP as a bar that changes colour as it drops', () => {
    const stats = (hp: number) => dw.tokenStats({ resources: { hp } } as never, { values: { maxHp: 16 } } as never)[0]
    expect(stats(16)).toMatchObject({ id: 'hp', value: 16, max: 16 })
    expect(new Set([stats(16).colour, stats(8).colour, stats(4).colour]).size).toBe(3)
  })
})

describe('checking a system', () => {
  it('finds nothing wrong with Dungeon World', () => {
    expect(checkSystem(dw)).toEqual([])
  })

  it('names what does not hold together', () => {
    const broken = {
      ...dw,
      actions: [
        ...dw.actions,
        { ...dw.actions[0], id: dw.actions[0].id },
        { id: 'odd', name: 'Odd', category: 'nope', trigger: '', text: '', steps: [{ kind: 'check' as const, stat: 'luck', outcomes: {} }] },
      ],
    }
    const problems = checkSystem(broken)
    expect(problems).toContain(`Two actions share the id “${dw.actions[0].id}”.`)
    expect(problems).toContain('Odd: no action category “nope”.')
    expect(problems).toContain('Odd: no stat “luck”.')
    expect(problems).toContain('Odd: no outcome for “Full success”.')
    expect(() => defineSystem(broken)).toThrow(/has problems/)
  })
})
