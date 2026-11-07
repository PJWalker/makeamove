import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'


// The action provider shows panels; the layout needs a browser.
vi.mock('../../../table/panelLayout', () => ({ showPanel: () => {} }))

import * as Y from 'yjs'
import { systemActions } from '../../../app/commands/system'
import { Campaign, createCampaign } from '../../../campaign/campaign'
import { device } from '../../../platform/device'
import { summaryOf } from "../../../campaign/registry";
import {
  addItem,
  applyClassChange,
  bumpResource,
  breakDungeonWorld2Weapon,
  clearArtifactTrack,
  beginDungeonWorld2Downtime,
  carouseDungeonWorld2,
  createFolder,
  deleteCharacter,
  deleteFolder,
  endDungeonWorld2Session,
  getCharacter,
  listFolders,
  dungeonWorld2DowntimeEpoch,
  makeDungeonWorld2Camp,
  markArtifactTrack,
  makeMove,
  moveRequest,
  moveToFolder,
  newCharacter,
  newNpc,
  renameFolder,
  prepareDungeonWorld2Journey,
  resolveComfortOrSupport,
  resolveStruggle,
  resupplyDungeonWorld2,
  saleValueDungeonWorld2Item,
  sellDungeonWorld2Item,
  selectCharacter,
  tokenStatsSource,
  trainDungeonWorld2,
  selectedCharacterId,
  setData,
  setConditionState,
  shopDungeonWorld2Service,
  setLearned,
  setModifier,
  startMove,
  systemOf,
  targetRequest,
  updateItem,
  consumeDungeonWorld2Item,
} from "../api";
import { actionsFor, derive } from '../store'
import { sessionMoveUsed } from '../sessionMoves'
import { relationshipsOf, setRelationship, setRelationshipDepth } from '../relationships'
import { applyDamage } from '../resolution'
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

describe('a campaign’s system', () => {
  it("plays the system it was created with, and asks before every d20 roll", async () => {
    device.value = { id: "gm", name: "Gwen" };
    const id = await createCampaign("Sunless Citadel", "Gwen", "dnd-5.5e");
    const c = await Campaign.open(id);
    expect(systemOf(c).id).toBe("dnd-5.5e");
    expect(summaryOf(id)?.systemId).toBe("dnd-5.5e");
    const pc = newCharacter(c, "Vex", "rogue");
    startMove(
      c,
      pc,
      systemOf(c).actions.find((a) => a.id === "skill-stealth")!,
    );
    expect(moveRequest.value).toMatchObject({ moveId: "skill-stealth" });
    moveRequest.value = null;
  });

  it("defaults to Dungeon World", async () => {
    expect(systemOf(await setUp()).id).toBe("dungeon-world");
  });
})

describe('characters in a campaign', () => {
  it('awards group XP for End the Session questions once per session', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('End session', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')

    expect(await endDungeonWorld2Session(campaign, ayla, [true, false, true])).toBe(true)
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(2)
    expect(getCharacter(campaign, brom)?.data.xp).toBe(2)
    expect(await endDungeonWorld2Session(campaign, ayla, [true, true, true])).toBe(false)
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(2)
    campaign.destroy()
  })

  it('restores the party at Make Camp and only clears a selected marked Condition', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Make Camp', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')
    bumpResource(campaign, ayla, 'hp', -4)
    bumpResource(campaign, brom, 'hp', -3)
    setConditionState(campaign, ayla, 'angry', 'marked')
    setConditionState(campaign, brom, 'frightened', 'locked')
    const shield = systemOf(campaign).items.find((item) => item.id === 'shield')!
    addItem(campaign, ayla, shield, true)
    const shieldInstance = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === shield.id)!
    updateItem(campaign, ayla, shieldInstance.id, { usesLeft: 0 })

    expect(await makeDungeonWorld2Camp(campaign, ayla, { [ayla]: 'angry', [brom]: 'frightened' })).toBe(true)
    for (const id of [ayla, brom]) {
      const character = getCharacter(campaign, id)!
      expect(character.resources.hp).toBe(derive(character, systemOf(campaign)).values.maxHp)
    }
    expect(getCharacter(campaign, ayla)?.conditions).not.toContain('angry')
    expect(getCharacter(campaign, brom)?.conditions).toContain('frightened')
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === shieldInstance.id)?.usesLeft).toBe(1)
    expect(await makeDungeonWorld2Camp(campaign, ayla, {})).toBe(false)
    campaign.destroy()
  })

  it('repairs one broken mundane weapon at camp for a fighter with Snap the Blade', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Snap the Blade', 'Gwen', 'dungeon-world-2'))
    const fighter = newCharacter(campaign, 'Fighter', 'fighter')
    setData(campaign, fighter, 'ownedPaths', 'fighter-weaponmaster')
    setData(campaign, fighter, 'ownedPathMoves', 'fighter-weaponmaster:5')
    const longsword = systemOf(campaign).items.find((item) => item.id === 'longsword')!
    addItem(campaign, fighter, longsword, true)
    const weapon = getCharacter(campaign, fighter)!.inventory.find((item) => item.defId === longsword.id)!

    expect(breakDungeonWorld2Weapon(campaign, fighter, weapon.id)).toBe(true)
    expect(getCharacter(campaign, fighter)?.inventory.find((item) => item.id === weapon.id)?.broken).toBe(true)
    expect(await makeDungeonWorld2Camp(campaign, fighter, {}, { [fighter]: weapon.id })).toBe(true)
    expect(getCharacter(campaign, fighter)?.inventory.find((item) => item.id === weapon.id)?.broken).toBe(false)
    campaign.destroy()
  })

  it('uses a healing potion or hearty feast and spends their limited uses', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Healing items', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')
    const potion = systemOf(campaign).items.find((item) => item.id === 'potion-of-healing')!
    const feast = systemOf(campaign).items.find((item) => item.id === 'hearty-feast')!
    addItem(campaign, ayla, potion)
    const healingPotion = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === potion.id)!
    bumpResource(campaign, ayla, 'hp', -5)
    expect(consumeDungeonWorld2Item(campaign, ayla, healingPotion.id, { kind: 'heal-half-lost' })).toBe(true)
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === healingPotion.id)?.usesLeft).toBe(0)
    expect(consumeDungeonWorld2Item(campaign, ayla, healingPotion.id, { kind: 'heal-half-lost' })).toBe(false)

    addItem(campaign, ayla, potion)
    const conditionPotion = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === potion.id && item.usesLeft === 1)!
    setConditionState(campaign, ayla, 'angry', 'locked')
    expect(consumeDungeonWorld2Item(campaign, ayla, conditionPotion.id, { kind: 'clear-locked', condition: 'angry' })).toBe(true)
    expect(getCharacter(campaign, ayla)?.lockedConditions).not.toContain('angry')

    addItem(campaign, ayla, feast)
    const heartyFeast = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === feast.id)!
    bumpResource(campaign, ayla, 'hp', -6)
    bumpResource(campaign, brom, 'hp', -4)
    expect(consumeDungeonWorld2Item(campaign, ayla, heartyFeast.id)).toBe(true)
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9)
    expect(getCharacter(campaign, brom)?.resources.hp).toBe(8)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === heartyFeast.id)?.usesLeft).toBe(0)
    campaign.destroy()
  })

  it('lets a magic wand drain or mark a Condition, then restores its charge at camp', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Magic wand', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const wand = systemOf(campaign).items.find((item) => item.name === 'magic wand')!
    addItem(campaign, ayla, wand)
    const wandInstance = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === wand.id)!

    expect(consumeDungeonWorld2Item(campaign, ayla, wandInstance.id, { kind: 'mark-condition', condition: 'angry' })).toBe(true)
    expect(getCharacter(campaign, ayla)?.conditions).toContain('angry')
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft).toBe(1)
    expect(consumeDungeonWorld2Item(campaign, ayla, wandInstance.id, { kind: 'drain' })).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft).toBe(0)
    expect(await makeDungeonWorld2Camp(campaign, ayla, {})).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft).toBe(1)
    campaign.destroy()
  })

  it('lets an equipped shield block one non-piercing attack but not piercing damage', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Shield block', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const shield = systemOf(campaign).items.find((item) => item.id === 'shield')!
    addItem(campaign, ayla, shield, true)
    const shieldInstance = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === shield.id)!
    const target = { id: 'token-ayla', name: 'Ayla', characterId: ayla }
    bumpResource(campaign, ayla, 'hp', -3)

    applyDamage(campaign, 'shieldable-attack', target, 5, false, { type: 'physical', shieldItemId: shieldInstance.id })
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === shieldInstance.id)?.usesLeft).toBe(0)

    addItem(campaign, ayla, shield, true)
    const replacement = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === shield.id && item.usesLeft === 1)!
    applyDamage(campaign, 'piercing-attack', target, 2, false, { type: 'piercing' })
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(7)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === replacement.id)?.usesLeft).toBe(1)
    campaign.destroy()
  })

  it('resolves Comfort or Support benefits for both PCs and advances the receiver’s directional Depth', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Comfort or Support', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')
    setConditionState(campaign, ayla, 'angry', 'marked')
    setConditionState(campaign, brom, 'frightened', 'marked')
    setRelationship(campaign.characters, brom, ayla, 'Trusts')
    setRelationshipDepth(campaign.characters, brom, ayla, 1)

    expect(await resolveComfortOrSupport(campaign, ayla, brom, [
      { kind: 'clear-comforted', condition: 'frightened' },
      { kind: 'gain-depth' },
      { kind: 'clear-supporter', condition: 'angry' },
    ])).toBe(true)
    expect(getCharacter(campaign, ayla)?.conditions).not.toContain('angry')
    expect(getCharacter(campaign, brom)?.conditions).not.toContain('frightened')
    expect(relationshipsOf(campaign.characters, brom).find((relationship) => relationship.to === ayla)?.depth).toBe(2)
    expect(await resolveComfortOrSupport(campaign, ayla, brom, [])).toBe(false)
    campaign.destroy()
  })

  it('prepares a quick Perilous Journey with Conditions for every PC and its pace modifier', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Perilous Journey', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')

    expect(prepareDungeonWorld2Journey(campaign, ayla, 'quick', {
      [ayla]: 'angry',
      [brom]: 'frightened',
    })).toBe(true)
    expect(getCharacter(campaign, ayla)?.conditions).toContain('angry')
    expect(getCharacter(campaign, brom)?.conditions).toContain('frightened')
    expect(moveRequest.value).toMatchObject({
      moveId: 'perilous-journey',
      characterId: ayla,
      choice: { extra: -1 },
    })
    moveRequest.value = null
    campaign.destroy()
  })

  it('resolves Downtime Carouse, Resupply, and once-per-period Train', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Downtime', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')
    setConditionState(campaign, ayla, 'angry', 'locked')

    expect(dungeonWorld2DowntimeEpoch(campaign)).toBe(0)
    expect(beginDungeonWorld2Downtime(campaign)).toBe(1)
    expect(trainDungeonWorld2(campaign, ayla)).toBe(true)
    expect(trainDungeonWorld2(campaign, ayla)).toBe(false)
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(1)
    expect(carouseDungeonWorld2(campaign, ayla, 'clear-locked', undefined, 'angry')).toBe(true)
    expect(getCharacter(campaign, ayla)?.lockedConditions).not.toContain('angry')
    expect(carouseDungeonWorld2(campaign, ayla, 'gain-depth', brom)).toBe(true)
    expect(relationshipsOf(campaign.characters, ayla).find((relationship) => relationship.to === brom)?.depth).toBe(1)

    const provisions = systemOf(campaign).items.find((item) => item.id === 'provisions')!
    const magicSupply = {
      id: 'test-magic-supply',
      name: 'Magic supply',
      description: '',
      weight: 0,
      uses: 2,
      tags: ['magic'],
    }
    addItem(campaign, ayla, provisions)
    addItem(campaign, ayla, magicSupply)
    const character = getCharacter(campaign, ayla)!
    const provisionInstance = character.inventory.find((item) => item.defId === provisions.id)!
    const magicInstance = character.inventory.find((item) => item.defId === magicSupply.id)!
    updateItem(campaign, ayla, provisionInstance.id, { usesLeft: 0 })
    updateItem(campaign, ayla, magicInstance.id, { usesLeft: 0 })
    expect(resupplyDungeonWorld2(campaign, ayla)).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === provisionInstance.id)?.usesLeft).toBe(3)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === magicInstance.id)?.usesLeft).toBe(0)
    setData(campaign, ayla, 'treasureBoxes', 2)
    expect(beginDungeonWorld2Downtime(campaign)).toBe(2)
    expect(await shopDungeonWorld2Service(campaign, ayla, 'repair', 3)).toBe(true)
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(1)
    expect(trainDungeonWorld2(campaign, ayla)).toBe(true)
    campaign.destroy()
  })

  it('sells priced gear for Treasure only when its Wealth tier is higher', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Sell gear', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    beginDungeonWorld2Downtime(campaign)
    const shortspear = systemOf(campaign).items.find((item) => item.id === 'shortspear')!
    const longsword = systemOf(campaign).items.find((item) => item.id === 'longsword')!
    addItem(campaign, ayla, shortspear)
    addItem(campaign, ayla, longsword)
    const character = getCharacter(campaign, ayla)!
    const cheap = character.inventory.find((item) => item.defId === shortspear.id)!
    const better = character.inventory.find((item) => item.defId === longsword.id)!

    expect(saleValueDungeonWorld2Item(campaign, ayla, cheap.id)).toBe(0)
    expect(sellDungeonWorld2Item(campaign, ayla, cheap.id)).toBe(true)
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(4)
    expect(saleValueDungeonWorld2Item(campaign, ayla, better.id)).toBe(1)
    expect(sellDungeonWorld2Item(campaign, ayla, better.id)).toBe(true)
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(5)
    campaign.destroy()
  })

  it('tracks Artifact marks and applies the source unlock policies per item instance', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Artifact tracks', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const items = systemOf(campaign).items
    const soulstealer = items.find((item) => item.name === 'Alveric’s Soulstealer Blade')!
    const branch = items.find((item) => item.name === 'Gwendolen’s Branch of the Green')!
    addItem(campaign, ayla, soulstealer, true)
    addItem(campaign, ayla, branch, true)
    const soulstealerInstance = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === soulstealer.id)!
    const branchInstance = getCharacter(campaign, ayla)!.inventory.find((item) => item.defId === branch.id)!

    for (let mark = 0; mark < 4; mark++) expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id)).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === soulstealerInstance.id)?.artifactProgress).toBe(4)
    expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id)).toBe(false)
    const firstSoulMove = soulstealer.artifact!.unlocks[0]!.id
    expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id, firstSoulMove)).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === soulstealerInstance.id)).toMatchObject({
      artifactProgress: 0,
      artifactUnlocked: [firstSoulMove],
    })
    for (let mark = 0; mark < 5; mark++) expect(markArtifactTrack(campaign, ayla, branchInstance.id, 'ignored')).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === branchInstance.id)?.artifactUnlocked).toEqual([branch.artifact!.unlocks[0]!.id])
    for (let mark = 0; mark < 4; mark++) expect(markArtifactTrack(campaign, ayla, branchInstance.id)).toBe(true)
    expect(markArtifactTrack(campaign, ayla, branchInstance.id)).toBe(true)
    expect(getCharacter(campaign, ayla)?.inventory.find((item) => item.id === branchInstance.id)?.artifactUnlocked).toEqual([branch.artifact!.unlocks[1]!.id])
    expect(clearArtifactTrack(campaign, ayla, branchInstance.id)).toBe(false)
    campaign.destroy()
  })

  it('limits Comfort per PC and Make Camp per party until a new session begins', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Session move limits', 'Gwen', 'dungeon-world-2'))
    const ayla = newCharacter(campaign, 'Ayla', 'barbarian')
    const brom = newCharacter(campaign, 'Brom', 'bard')
    const comfort = systemOf(campaign).actions.find((action) => action.id === 'comfort-or-support')!
    const camp = systemOf(campaign).actions.find((action) => action.id === 'make-camp')!

    expect(await makeMove(campaign, ayla, comfort)).toBeDefined()
    expect(sessionMoveUsed(campaign, ayla, comfort)).toBe(true)
    expect(sessionMoveUsed(campaign, brom, comfort)).toBe(false)
    selectCharacter(campaign, ayla)
    expect(systemActions(campaign).find((action) => action.id === 'move:comfort-or-support')?.available).toBe('Already used this session')
    expect(await makeMove(campaign, ayla, comfort)).toBeUndefined()
    selectCharacter(campaign, brom)
    expect(systemActions(campaign).find((action) => action.id === 'move:comfort-or-support')?.available).toBe(true)
    expect(await makeMove(campaign, brom, comfort)).toBeDefined()
    expect(systemActions(campaign).find((action) => action.id === 'move:comfort-or-support')?.available).toBe('Already used this session')

    expect(await makeMove(campaign, ayla, camp)).toBeDefined()
    expect(sessionMoveUsed(campaign, brom, camp)).toBe(true)
    expect(systemActions(campaign).find((action) => action.id === 'move:make-camp')?.available).toBe('Already used this session')
    expect(await makeMove(campaign, brom, camp)).toBeUndefined()

    await campaign.chat.post(
      { kind: 'system', text: 'Session 1 begins', event: 'session-start', session: 1 },
      { id: 'gm', name: 'Gwen' },
    )
    expect(sessionMoveUsed(campaign, ayla, comfort)).toBe(false)
    expect(sessionMoveUsed(campaign, brom, camp)).toBe(false)
    expect(systemActions(campaign).find((action) => action.id === 'move:make-camp')?.available).toBe(true)
    campaign.destroy()
  })

  it('changes DW2 Class and reallocated advances without resetting campaign progress', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const id = await createCampaign('Class change', 'Gwen', 'dungeon-world-2')
    const campaign = await Campaign.open(id)
    const characterId = newCharacter(campaign, 'Erinyette', 'barbarian')
    const character = campaign.characters.get(characterId)!
    campaign.doc.transact(() => {
      setData(campaign, characterId, 'level', 5)
      setData(campaign, characterId, 'xp', 3)
      setData(campaign, characterId, 'advancements', 'stat-dex-2,stat-wis-3,path-rogue-burglar')
      setData(campaign, characterId, 'treasureBoxes', 7);
      (character.get('resources') as Y.Map<number>).set('hp', 10)
    })

    expect(applyClassChange(campaign, characterId, 'bard', {
      str: 0, dex: 1, int: 1, wis: -1, cha: 2,
    }, {
      advancements: 'stat-cha-2,stat-int-3,path-bard-diplomat',
      ownedPaths: 'barbarian-berserker,bard-diplomat',
      multiclassPaths: 'barbarian-berserker',
      ownedPathMoves: '',
    })).toBe(true)
    const changed = getCharacter(campaign, characterId)!
    expect(changed).toMatchObject({
      data: {
        classId: 'bard', level: 5, xp: 3, treasureBoxes: 7,
        advancements: 'stat-cha-2,stat-int-3,path-bard-diplomat',
        ownedPaths: 'barbarian-berserker,bard-diplomat',
        multiclassPaths: 'barbarian-berserker',
      },
      scores: { str: 0, dex: 1, int: 1, wis: -1, cha: 2 },
      resources: { hp: 6 },
    })
    expect(derive(changed, systemOf(campaign)).values.maxHp).toBe(12)
    campaign.destroy()
  })

  it('resolves a DW2 Struggle with a bonus level-up while preserving XP', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const id = await createCampaign('Struggle resolution', 'Gwen', 'dungeon-world-2')
    const campaign = await Campaign.open(id)
    const characterId = newCharacter(campaign, 'Ayla', 'barbarian')
    campaign.doc.transact(() => {
      setData(campaign, characterId, 'level', 4)
      setData(campaign, characterId, 'xp', 2)
      setData(campaign, characterId, 'advancements', 'stat-str,reveal-struggle-reformed')
      setData(campaign, characterId, 'struggleRevealed', true)
      setData(campaign, characterId, 'struggleId', 'reformed')
      setData(campaign, characterId, 'struggleName', 'Reformed')
      setData(campaign, characterId, 'struggleTrack', 'Guilt')
      setData(campaign, characterId, 'struggleProgress', 2)
      setData(campaign, characterId, 'struggleMax', 3);
      (campaign.characters.get(characterId)!.get('resources') as Y.Map<number>).set('hp', 4)
    })

    expect(resolveStruggle(campaign, characterId)).toBe(true)
    expect(getCharacter(campaign, characterId)).toMatchObject({
      data: {
        level: 5,
        xp: 2,
        advancements: 'stat-str',
        struggleRevealed: false,
        struggleId: '',
        struggleProgress: 0,
      },
      resources: { hp: 5 },
    })
    campaign.destroy()
  })

  it('deletes a character and clears anyone playing it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    c.members.get('pat')!.set('character', id)
    deleteCharacter(c, id)
    expect(getCharacter(c, id)).toBeUndefined()
    expect(c.members.get("gm")!.get("character")).toBeUndefined();
    expect(c.members.get("pat")!.get("character")).toBeUndefined();
    c.destroy()
  })

  it('creates a character at full HP and selects it', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    expect(selectedCharacterId(c)).toBe(id)
    expect(getCharacter(c, id)).toMatchObject({
      name: "Ayla",
      data: { classId: "fighter", level: 1 },
      resources: { hp: 20 },
    });
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

  it("asks for targets before a move aimed at someone, then posts them on the card", async () => {
    const c = await setUp();
    const id = newCharacter(c, "Ayla", "fighter");
    const hack = systemOf(c).actions.find((m) => m.id === "hack-and-slash")!;
    startMove(c, id, hack);
    expect(targetRequest.value).toEqual({
      moveId: "hack-and-slash",
      characterId: id,
    });
    expect(moveRequest.value).toBeNull();
    targetRequest.value = null;
    const goblin = { id: "tok1", name: "Goblin", distance: "5 ft" };
    const msg = await makeMove(c, id, hack, {}, [goblin]);
    expect(msg).toMatchObject({ kind: "move", targets: [goblin] });
    // Aid asks for a target, then for the bond.
    const aid = systemOf(c).actions.find((m) => m.id === "aid-or-interfere")!;
    startMove(c, id, aid, [goblin]);
    expect(moveRequest.value).toEqual({
      moveId: "aid-or-interfere",
      characterId: id,
      targets: [goblin],
    });
    moveRequest.value = null;
    c.destroy();
  });

  it('equipping armour raises armour, and the hotbar and index follow the character', async () => {
    const c = await setUp()
    const id = newCharacter(c, 'Ayla', 'fighter')
    const armour = systemOf(c).items.find((i) => i.effects?.some((e) => e.type === 'modify'))!
    addItem(c, id, armour)
    const item = (getCharacter(c, id)!.inventory)[0]!
    updateItem(c, id, item.id, { equipped: true })
    expect((getCharacter(c, id)!.inventory)[0]!.equipped).toBe(true)
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
