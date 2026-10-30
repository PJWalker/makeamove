import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Campaign, createCampaign } from '../../store/campaign'
import { device } from '../../store/device'
import {
  addItem,
  bumpResource,
  createCopy,
  deleteCharacter,
  getCharacter,
  listCharacters,
  newNpc,
  removeItem,
  resetCopy,
  setData,
  setNpcField,
  setTemplate,
  systemOf,
  toggleCondition,
  tokenStatsSource,
} from '../api'
import { ADJECTIVES, tokenName } from '../templates'

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

describe('template copies', () => {
  it('take everything from the template until it’s changed on the copy', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const c = await Campaign.open(await createCampaign('Barrows', 'Gwen'))
    const id = newNpc(c, 'Goblin')
    setData(c, id, 'maxHp', 7)
    setNpcField(c, id, 'armor', 1)
    addItem(c, id, systemOf(c).items[0])
    setTemplate(c, id, { naming: 'number', names: [] })
    expect(getCharacter(c, id)!.template).toEqual({ naming: 'number', names: [] })

    const a = createCopy(c, id, 'Goblin 1')
    const b = createCopy(c, id, 'Goblin 2')
    // Only the name is the copy's own.
    expect(getCharacter(c, a)).toMatchObject({ name: 'Goblin 1', base: id, kind: 'npc', resources: { hp: 6 }, fields: { armor: 1 } })
    expect(getCharacter(c, a)!.template).toBeUndefined()
    expect(getCharacter(c, a)!.inventory).toHaveLength(1)

    // Hurting one copy leaves the template and the other copy alone.
    bumpResource(c, a, 'hp', -4, 7)
    expect(getCharacter(c, a)!.resources.hp).toBe(2)
    expect(getCharacter(c, b)!.resources.hp).toBe(6)
    expect(getCharacter(c, id)!.resources.hp).toBe(6)
    expect(tokenStatsSource(c)(a)[0]).toMatchObject({ value: 2, max: 7 })

    // A change to the template reaches copies that haven't overridden it.
    setNpcField(c, b, 'armor', 3)
    setNpcField(c, id, 'armor', 2)
    expect(getCharacter(c, a)!.fields.armor).toBe(2)
    expect(getCharacter(c, b)!.fields.armor).toBe(3)

    // Conditions and gear become the copy's own when changed.
    toggleCondition(c, a, systemOf(c).conditions[0].id)
    expect(getCharacter(c, a)!.conditions).toHaveLength(1)
    expect(getCharacter(c, id)!.conditions).toHaveLength(0)
    removeItem(c, a, getCharacter(c, a)!.inventory[0].id)
    expect(getCharacter(c, a)!.inventory).toHaveLength(0)
    expect(getCharacter(c, b)!.inventory).toHaveLength(1)

    // Copies stay out of the Characters list, and go with their template.
    expect(listCharacters(c).map((k) => k.id)).toEqual([id])
    resetCopy(c, a)
    expect(getCharacter(c, a)).toMatchObject({ name: 'Goblin 1', resources: { hp: 6 }, conditions: [] })
    deleteCharacter(c, id)
    expect(getCharacter(c, a)).toBeUndefined()
    c.destroy()
  })

  it('adds equippable gear already equipped when dropped from an item token', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const c = await Campaign.open(await createCampaign('Barrows', 'Gwen'))
    const id = newNpc(c, 'Goblin')
    const gear = systemOf(c).items.find((item) => item.equippable)!
    addItem(c, id, gear, true)
    expect(getCharacter(c, id)!.inventory[0]).toMatchObject({ defId: gear.id, equipped: true })
    c.destroy()
  })
})
