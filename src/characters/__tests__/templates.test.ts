import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Campaign, createCampaign } from '../../store/campaign'
import { device } from '../../store/device'
import { getCharacter, newNpc, setData, setTemplate, systemOf, tokenStatsSource } from '../api'
import { ADJECTIVES, asToken, freshState, tokenName } from '../templates'

const goblin = { name: 'Goblin' }

describe('naming a template’s tokens', () => {
  it('numbers them after the highest number taken', () => {
    const t = { naming: 'number' as const, names: [] }
    expect(tokenName(goblin, t, [])).toBe('Goblin 1')
    expect(tokenName(goblin, t, ['Goblin 1', 'Goblin 4', 'Ogre 9'])).toBe('Goblin 5')
  })
  it('picks a name from the list that isn’t taken, then numbers them', () => {
    const t = { naming: 'list' as const, names: ['Snag', 'Grub'] }
    expect(tokenName(goblin, t, ['Snag'])).toBe('Grub')
    expect(tokenName(goblin, t, ['Snag', 'Grub'], () => 0)).toBe('Snag 1')
    // An empty list falls back to numbers.
    expect(tokenName(goblin, { naming: 'list', names: [] }, [])).toBe('Goblin 1')
  })
  it('puts a random adjective before the name, never one already used', () => {
    const t = { naming: 'adjective' as const, names: [] }
    expect(tokenName(goblin, t, [], () => 0)).toBe(`${ADJECTIVES[0]} Goblin`)
    expect(tokenName(goblin, t, [`${ADJECTIVES[0]} Goblin`], () => 0)).toBe(`${ADJECTIVES[1]} Goblin`)
  })
})

describe('templates', () => {
  it('give each token its own HP, from the template’s numbers', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const c = await Campaign.open(await createCampaign('Barrows', 'Gwen'))
    const id = newNpc(c, 'Goblin')
    setData(c, id, 'maxHp', 7)
    setTemplate(c, id, { naming: 'number', names: [] })
    const system = systemOf(c)
    const g = getCharacter(c, id)!
    expect(g.template).toEqual({ naming: 'number', names: [] })
    const fresh = freshState(g, system)
    expect(fresh.resources).toEqual({ hp: 7 })
    const hurt = { ...fresh, resources: { hp: 2 } }
    expect(asToken(g, system, hurt, 'Goblin 2')).toMatchObject({ name: 'Goblin 2', resources: { hp: 2 } })
    const stats = tokenStatsSource(c)
    expect(stats(id, hurt)[0]).toMatchObject({ value: 2, max: 7 })
    expect(stats(id, undefined)[0]).toMatchObject({ value: 7, max: 7 })
    // An individual again: tokens show its own record.
    setTemplate(c, id, null)
    expect(getCharacter(c, id)!.template).toBeUndefined()
    expect(tokenStatsSource(c)(id, hurt)[0]).toMatchObject({ value: 6 })
    c.destroy()
  })
})
