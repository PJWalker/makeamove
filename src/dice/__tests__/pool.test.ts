import { describe, expect, it } from 'vitest'
import { roll } from '../notation'
import { poolFormula } from '../pool'

describe('dice pool', () => {
  it('groups dice by type, in the order first picked', () => {
    expect(poolFormula([20])).toBe('1d20')
    expect(poolFormula([20, 20])).toBe('2d20')
    expect(poolFormula([20, 6, 20, 4])).toBe('2d20+1d6+1d4')
  })
  it('makes formulas the roller understands', () => {
    expect(roll(poolFormula([8, 8, 6]), () => 1).total).toBe(3)
  })
})
