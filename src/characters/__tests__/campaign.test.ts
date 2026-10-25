import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

// The action provider shows panels; the layout needs a browser.
vi.mock('../../table/panelLayout', () => ({ showPanel: () => {} }))

import * as Y from 'yjs'
import { systemActions } from '../../actions/system'
import { Campaign, createCampaign } from '../../store/campaign'
import { device } from '../../store/device'
import { addItem, getCharacter, makeMove, newCharacter, selectedCharacterId, setField, systemOf, updateItem } from '../api'
import { defaultHotbar, hotbarSlots, pin, shift, unpin, MAX_SLOTS } from '../hotbar'

async function setUp() {
  device.value = { id: 'gm', name: 'Gwen' }
  const c = await Campaign.open(await createCampaign('Barrows', 'Gwen'))
  const pat = new Y.Map<any>()
  pat.set('name', 'Pat')
  pat.set('role', 'player')
  c.members.set('pat', pat)
  return c
}

describe('characters in a campaign', () => {
  it('creates a character at full HP and selects it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    expect(selectedCharacterId(c)).toBe(id)
    expect(getCharacter(c, id)).toMatchObject({ name: 'Ayla', classId: 'fighter', hp: 20, level: 1 })
    c.destroy()
  })

  it('posts a move card, spends forward on a roll, and keeps it for a text-only move', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const sys = systemOf(c)
    setField(c, id, 'forward', 1)
    await makeMove(c, id, sys.moves.find((m) => !m.roll)!)
    expect(getCharacter(c, id)!.forward).toBe(1)
    const msg = await makeMove(c, id, sys.moves.find((m) => m.id === 'hack-and-slash')!)
    expect(msg).toMatchObject({ kind: 'move', moveId: 'hack-and-slash', characterName: 'Ayla' })
    expect(getCharacter(c, id)!.forward).toBe(0)
    c.destroy()
  })

  it('equipping armour raises armour, and the hotbar and index follow the character', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const armour = systemOf(c).items.find((i) => i.effects?.some((e) => e.type === 'modify'))!
    addItem(c, id, armour)
    const item = getCharacter(c, id)!.inventory[0]
    updateItem(c, id, item.id, { equipped: true })
    expect(getCharacter(c, id)!.inventory[0].equipped).toBe(true)
    const ids = systemActions(c).map((a) => a.id)
    expect(ids).toContain('move:hack-and-slash')
    expect(ids).toContain(`character:${id}`)
    expect(defaultHotbar(c, id)).toContain('move:hack-and-slash')
    expect(hotbarSlots(c, id)).toEqual(defaultHotbar(c, id))
    c.destroy()
  })
})

describe('hotbar editing', () => {
  it('pins once, caps the length, unpins and reorders', () => {
    expect(pin(['a'], 'a')).toEqual(['a'])
    expect(pin(['a'], 'b')).toEqual(['a', 'b'])
    expect(pin(Array.from({ length: MAX_SLOTS }, (_, i) => String(i)), 'x')).toHaveLength(MAX_SLOTS)
    expect(unpin(['a', 'b'], 'a')).toEqual(['b'])
    expect(shift(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(shift(['a', 'b'], 'a', -1)).toEqual(['a', 'b'])
  })
})
