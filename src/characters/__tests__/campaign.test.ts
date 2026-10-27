import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

// The action provider shows panels; the layout needs a browser.
vi.mock('../../table/panelLayout', () => ({ showPanel: () => {} }))

import * as Y from 'yjs'
import { systemActions } from '../../actions/system'
import { Campaign, createCampaign } from '../../store/campaign'
import { device } from '../../store/device'
import { addItem, createFolder, deleteCharacter, deleteFolder, getCharacter, listFolders, makeMove, moveRequest, moveToFolder, newCharacter, newNpc, renameFolder, tokenStatsSource, selectedCharacterId, setData, setLearned, setModifier, startMove, systemOf, targetRequest, updateItem } from '../api'
import { actionsFor, derive } from '../store'
import { defaultHotbar, editHotbar, hotbarSlots, moveTo, pin, placeAt, insertAt, shift, unpin, MAX_SLOTS } from '../hotbar'

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
  it('deletes a character and clears anyone playing it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    c.members.get('pat')!.set('character', id)
    deleteCharacter(c, id)
    expect(getCharacter(c, id)).toBeUndefined()
    expect(c.members.get('gm')!.get('character')).toBeUndefined()
    expect(c.members.get('pat')!.get('character')).toBeUndefined()
    c.destroy()
  })

  it('creates a character at full HP and selects it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    expect(selectedCharacterId(c)).toBe(id)
    expect(getCharacter(c, id)).toMatchObject({ name: 'Ayla', classId: 'fighter', resources: { hp: 20 }, level: 1 })
    c.destroy()
  })

  it('posts a move card, spends forward on a roll, and keeps it for a text-only move', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const sys = systemOf(c)
    setModifier(c, id, 'forward', 1)
    await makeMove(c, id, sys.actions.find((m) => !m.steps.length)!)
    expect(getCharacter(c, id)!.modifiers.forward).toBe(1)
    const msg = await makeMove(c, id, sys.actions.find((m) => m.id === 'hack-and-slash')!)
    expect(msg).toMatchObject({ kind: 'move', moveId: 'hack-and-slash', characterName: 'Ayla' })
    expect(getCharacter(c, id)!.modifiers.forward).toBe(0)
    c.destroy()
  })

  it('learns a move dropped on it, beyond its class, and can forget it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const sys = systemOf(c)
    const has = () => actionsFor(getCharacter(c, id)!, sys, derive(getCharacter(c, id)!, sys)).map((a) => a.id)
    expect(has()).not.toContain('cast-a-spell')
    setLearned(c, id, 'cast-a-spell', true)
    setLearned(c, id, 'cast-a-spell', true)
    expect(getCharacter(c, id)!.learned).toEqual(['cast-a-spell'])
    expect(has()).toContain('cast-a-spell')
    setLearned(c, id, 'cast-a-spell', false)
    expect(has()).not.toContain('cast-a-spell')
    c.destroy()
  })

  it('asks for targets before a move aimed at someone, then posts them on the card', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const hack = systemOf(c).actions.find((m) => m.id === 'hack-and-slash')!
    startMove(c, id, hack)
    expect(targetRequest.value).toEqual({ moveId: 'hack-and-slash', characterId: id })
    expect(moveRequest.value).toBeNull()
    targetRequest.value = null
    const goblin = { id: 'tok1', name: 'Goblin', distance: '5 ft' }
    const msg = await makeMove(c, id, hack, {}, [goblin])
    expect(msg).toMatchObject({ kind: 'move', targets: [goblin] })
    // Aid asks for a target, then for the bond.
    const aid = systemOf(c).actions.find((m) => m.id === 'aid-or-interfere')!
    startMove(c, id, aid, [goblin])
    expect(moveRequest.value).toEqual({ moveId: 'aid-or-interfere', characterId: id, targets: [goblin] })
    moveRequest.value = null
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

  it('moves a slot to a drop position', () => {
    expect(moveTo(['a', 'b', 'c'], 'a', 3)).toEqual(['b', 'c', 'a'])
    expect(moveTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(placeAt(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(placeAt(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'c', 'b'])
    expect(insertAt(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b'])
    expect(insertAt(['a', 'b'], 'b', 0)).toEqual(['b', 'a'])
    expect(moveTo(['a', 'b', 'c'], 'a', 1)).toEqual(['a', 'b', 'c'])
  })

  it('pins with no character selected', async () => {
    const c = await setUp()
    expect(editHotbar(c, (s) => pin(s, 'cmd:fit'))).toBe(true)
    expect(hotbarSlots(c, undefined)).toContain('cmd:fit')
    c.destroy()
  })
})

describe('NPCs and folders', () => {
  it('creates an NPC with its own HP, no moves, and a token HP bar', async () => {
    const c = await setUp()
    const id = newNpc(c, 'Goblin')
    const npc = getCharacter(c, id)!
    expect(npc).toMatchObject({ kind: 'npc', name: 'Goblin', resources: { hp: 6 }, data: { maxHp: 6 } })
    expect(Object.keys(npc.fields)).toEqual(systemOf(c).npcFields.map((f) => f.id))
    setData(c, id, 'maxHp', 12)
    expect(tokenStatsSource(c)(id)[0]).toMatchObject({ id: 'hp', value: 6, max: 12 })
    c.destroy()
  })

  it('does not auto-select an NPC as the only character a player owns', async () => {
    const c = await setUp()
    newNpc(c, 'Goblin')
    c.members.get('gm')!.delete('character')
    expect(selectedCharacterId(c)).toBeUndefined()
    c.destroy()
  })

  it('files characters in folders, and deleting a folder returns them to the top', async () => {
    const c = await setUp()
    const a = newCharacter(c, 'Ayla', 'fighter')
    const folder = createFolder(c, 'Party')
    renameFolder(c, folder, 'The Party')
    expect(listFolders(c)).toEqual([{ id: folder, name: 'The Party' }])
    moveToFolder(c, a, folder)
    expect(getCharacter(c, a)!.folder).toBe(folder)
    deleteFolder(c, folder)
    expect(getCharacter(c, a)!.folder).toBeUndefined()
    expect(listFolders(c)).toEqual([])
    c.destroy()
  })
})
