import { describe as group, expect, it } from 'vitest'
import { cryptoDie, describe, NotationError, parse, roll } from '../notation'

/** A die that returns these values in order. */
const fixed = (...values: number[]) => {
  let i = 0
  return () => values[i++]
}

group('parsing', () => {
  it('reads dice, modifiers and labels', () => {
    expect(parse('2d6 + 2 [STR]')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 6 },
      { kind: 'flat', sign: 1, value: 2, label: 'STR' },
    ])
    expect(parse('d8-d4')).toMatchObject([{ count: 1, sides: 8 }, { sign: -1, sides: 4 }])
    expect(parse('d%')).toMatchObject([{ sides: 100 }])
  })
  it('reads keep, drop and explode in any order', () => {
    expect(parse('4d6kh3')[0]).toMatchObject({ keep: { which: 'high', n: 3 } })
    expect(parse('2d20kl1')[0]).toMatchObject({ keep: { which: 'low', n: 1 } })
    expect(parse('2d20b1')[0]).toMatchObject({ keep: { which: 'high', n: 1 } })
    expect(parse('2d20w1')[0]).toMatchObject({ keep: { which: 'low', n: 1 } })
    expect(parse('4d6dl1')[0]).toMatchObject({ drop: { which: 'low', n: 1 } })
    expect(parse('3d6!k2')[0]).toMatchObject({ explode: true, keep: { which: 'high', n: 2 } })
  })
  it('keeps label case and spaces', () => {
    expect(parse('1d4 + 1[Ring of Strength]')[1].label).toBe('Ring of Strength')
  })
  it('explains bad formulas', () => {
    for (const bad of [
      "",
      "d",
      "2x6",
      "2d6 3",
      "10001d6",
      "d1001",
      "0d6",
      "d1!",
      "4d6k1d1",
      "2d6+[x",
    ]) {
      expect(() => parse(bad), bad).toThrow(NotationError);
    }
  })
})

group('rolling', () => {
  it('adds dice and modifiers', () => {
    const r = roll('2d6+2[STR]', fixed(4, 5))
    expect(r.total).toBe(11)
    expect(describe(r)).toBe('2d6 (4+5) + STR 2 = 11')
  })
  it('subtracts', () => {
    expect(roll('d8-d4-1', fixed(6, 3)).total).toBe(2)
  })
  it('keeps the highest or lowest', () => {
    const best = roll('4d6kh3', fixed(3, 6, 1, 4))
    expect(best.total).toBe(13)
    expect(best.terms[0]).toMatchObject({ dice: [{ kept: true }, { kept: true }, { kept: false }, { kept: true }] })
    expect(roll('2d20kl1', fixed(17, 8)).total).toBe(8)
  })
  it('drops the lowest, with ties going to the earlier die', () => {
    const r = roll('3d6dl1', fixed(2, 5, 2))
    expect(r.total).toBe(7)
    expect(r.terms[0]).toMatchObject({ dice: [{ kept: false }, { kept: true }, { kept: true }] })
  })
  it('explodes on the maximum, and stops eventually', () => {
    const r = roll('d6!', fixed(6, 6, 2))
    expect(r.total).toBe(14)
    expect(r.terms[0]).toMatchObject({ dice: [{ value: 6 }, { value: 6, exploded: true }, { value: 2, exploded: true }] })
    expect(roll('d2!', () => 2).terms[0]).toMatchObject({ dice: { length: 51 } })
  })
  it('rolls fairly with the crypto source', () => {
    const counts = new Array(7).fill(0)
    for (let i = 0; i < 6000; i++) counts[cryptoDie(6)]++
    expect(counts[0]).toBe(0)
    for (let f = 1; f <= 6; f++) expect(counts[f]).toBeGreaterThan(800)
  })
})
