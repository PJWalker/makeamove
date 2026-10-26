import { signal } from '@preact/signals'
import { generateKeyBetween } from 'fractional-indexing'
import type * as Y from 'yjs'
import { importImage } from '../scene/images'
import { newId } from '../lib/ids'
import { postRoll, myName } from '../chat/send'
import type { MoveSuggestion } from '../chat/types'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { getSystem } from '../systems'
import type { ItemDef, MoveDef } from '../systems/types'
import { performMove, needsChoice, type MoveChoice } from './moves'
import {
  characterView,
  derive,
  canEditCharacter,
  createCharacter,
  instanceOf,
  type CharacterView,
  type ItemInstance,
} from './store'

export const systemOf = (campaign: Campaign) => getSystem(campaign.meta.get('system'))

export function listCharacters(campaign: Campaign): CharacterView[] {
  const system = systemOf(campaign)
  return [...campaign.characters.entries()]
    .map(([id, m]) => characterView(id, m, system))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** What each character's token shows, as the campaign's system defines it. */
export function tokenStatsByCharacter(campaign: Campaign) {
  const system = systemOf(campaign)
  return new Map(listCharacters(campaign).map((c) => [c.id, system.tokenStats(c, derive(c, system))]))
}

export function getCharacter(campaign: Campaign, id: string | undefined): CharacterView | undefined {
  const m = id ? campaign.characters.get(id) : undefined
  return m && id ? characterView(id, m, systemOf(campaign)) : undefined
}

/** The character this device is playing: their choice, else the only one they own. */
export function selectedCharacterId(campaign: Campaign): string | undefined {
  const chosen: string | undefined = campaign.members.get(device.value.id)?.get('character')
  if (chosen && campaign.characters.has(chosen)) return chosen
  const mine = listCharacters(campaign).filter((c) => c.kind === 'pc' && c.owner === device.value.id)
  return mine.length === 1 ? mine[0].id : undefined
}

export function selectCharacter(campaign: Campaign, id: string | undefined) {
  const m = campaign.members.get(device.value.id)
  if (!m) return
  if (id) m.set('character', id)
  else m.delete('character')
}

export function newCharacter(campaign: Campaign, name: string, classId: string) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || 'Unnamed',
    classId,
    owner: device.value.id,
  })
  selectCharacter(campaign, id)
  return id
}

/** A non-player character, with the folder it starts in. */
export function newNpc(campaign: Campaign, name: string, folder?: string) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || 'Unnamed NPC',
    classId: '',
    owner: device.value.id,
    kind: 'npc',
    folder,
  })
  selectCharacter(campaign, id)
  return id
}

/* Folders */

export interface FolderView {
  id: string
  name: string
}

export function listFolders(campaign: Campaign): FolderView[] {
  return [...campaign.characterFolders.entries()]
    .map(([id, f]) => ({ id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createFolder(campaign: Campaign, name: string) {
  const id = newId()
  campaign.characterFolders.set(id, { name: name.trim() || 'New folder' })
  return id
}

export function renameFolder(campaign: Campaign, id: string, name: string) {
  if (campaign.characterFolders.has(id) && name.trim()) campaign.characterFolders.set(id, { name: name.trim() })
}

/** Deleting a folder files its characters back at the top. */
export function deleteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.characters.values()) if (m.get('folder') === id) m.delete('folder')
    campaign.characterFolders.delete(id)
  })
}

/** Delete a character, and stop anyone playing it from pointing at it. */
export function deleteCharacter(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.members.values()) if (m.get('character') === id) m.delete('character')
    campaign.characters.delete(id)
  })
}

export function moveToFolder(campaign: Campaign, characterId: string, folderId: string | undefined) {
  const m = campaign.characters.get(characterId)
  if (!m) return
  if (folderId) m.set('folder', folderId)
  else m.delete('folder')
}

export function canEdit(campaign: Campaign, c: CharacterView) {
  return canEditCharacter(c, device.value.id, campaign.isGm())
}

/** Store an image file as the character's portrait. */
export async function setPortrait(campaign: Campaign, id: string, file: Blob) {
  const image = await importImage(file)
  setField(campaign, id, 'portrait', image)
}

export function setField(campaign: Campaign, id: string, key: string, value: unknown) {
  campaign.characters.get(id)?.set(key, value)
}

/** Add to a numeric field, never below zero. */
export function bump(campaign: Campaign, id: string, key: string, by: number, max?: number) {
  const m = campaign.characters.get(id)
  if (!m) return
  const next = Math.max(0, (m.get(key) ?? 0) + by)
  m.set(key, max === undefined ? next : Math.min(next, max))
}

/** Set by Characters/Palette to ask for a stat or bond before a move rolls. */
export const moveRequest = signal<{ moveId: string; characterId: string } | null>(null)

/** Make a move as a character: ask for input if it needs any, otherwise roll and post. */
export function startMove(campaign: Campaign, characterId: string, move: MoveDef) {
  if (needsChoice(move)) moveRequest.value = { moveId: move.id, characterId }
  else void makeMove(campaign, characterId, move)
}

export function makeMove(campaign: Campaign, characterId: string, move: MoveDef, choice: MoveChoice = {}) {
  const system = systemOf(campaign)
  const c = getCharacter(campaign, characterId)
  if (!c) return
  const d = derive(c, system)
  const result = performMove(system, move, c, d, choice)
  // A roll spends +forward; text-only moves leave it for the next roll.
  if (result.roll && c.forward) setField(campaign, c.id, 'forward', 0)
  return campaign.chat.post(
    {
      kind: 'move',
      moveId: move.id,
      moveName: move.name,
      trigger: move.trigger,
      characterId: c.id,
      characterName: c.name,
      ...result,
    },
    { id: device.value.id, name: myName(campaign) },
  )
}

/** Carry out a suggestion button from a move card. */
export function applySuggestion(campaign: Campaign, characterId: string, s: MoveSuggestion) {
  if (s.kind === 'xp') bump(campaign, characterId, 'xp', 1)
  else if (s.formula) postRoll(campaign, s.formula, 'public', 'Damage')
}

/* Inventory */


function inventoryOf(campaign: Campaign, characterId: string): Y.Map<ItemInstance> | undefined {
  return campaign.characters.get(characterId)?.get('inventory')
}

export function addItem(campaign: Campaign, characterId: string, def: ItemDef) {
  const inv = inventoryOf(campaign, characterId)
  if (!inv) return
  const last = [...inv.values()].map((i) => i.order).sort().at(-1) ?? null
  const item = instanceOf(def, generateKeyBetween(last, null))
  inv.set(item.id, item)
}

/** Items are replaced whole, so edit a copy: concurrent edits to one item keep the last writer's. */
export function updateItem(campaign: Campaign, characterId: string, itemId: string, patch: Partial<ItemInstance>) {
  const inv = inventoryOf(campaign, characterId)
  const item = inv?.get(itemId)
  if (inv && item) inv.set(itemId, { ...item, ...patch })
}

export function removeItem(campaign: Campaign, characterId: string, itemId: string) {
  inventoryOf(campaign, characterId)?.delete(itemId)
}
