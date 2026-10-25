import { describe, expect, it } from 'vitest'
import { decode, HybridClock } from '../hlc'

describe('hybrid logical clock', () => {
  it('stamps sort in the order they were made', () => {
    let t = 1000
    const c = new HybridClock('a', () => t)
    const a = c.tick()
    const b = c.tick()
    t = 2000
    const d = c.tick()
    expect([d, b, a].sort()).toEqual([a, b, d])
    expect(decode(b)).toEqual({ wall: 1000, counter: 1, node: 'a' })
  })
  it('stays ahead of a peer whose clock runs fast', () => {
    const slow = new HybridClock('slow', () => 1000)
    const fast = new HybridClock('fast', () => 9000)
    const theirs = fast.tick()
    slow.receive(theirs)
    const mine = slow.tick()
    expect(mine > theirs).toBe(true)
  })
  it('sorts across many-digit times as strings', () => {
    const c = new HybridClock('n', () => Date.UTC(2026, 9, 25))
    const later = new HybridClock('n', () => Date.UTC(2031, 0, 1))
    expect(c.tick() < later.tick()).toBe(true)
  })
})
