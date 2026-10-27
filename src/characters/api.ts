import { signal } from '@preact/signals'
import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { importImage } from '../scene/images'
import { newId } from '../lib/ids'
import { postRoll, myName } from '../chat/send'
import type { MoveSuggestion, MoveTarget } from '../chat/types'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { getSystem } from '../systems'
import type { ActionDef, DataValue, ItemDef } from '../systems/types'
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

/** Set one of the core fields (name, level, notes, portrait…). */
export function setField(campaign: Campaign, id: string, key: string, value: unknown) {
  campaign.characters.get(id)?.set(key, value)
}

/** Add to a numeric core field, never below zero. */
export function bump(campaign: Campaign, id: string, key: string, by: number, max?: number) {
  const m = campaign.characters.get(id)
  if (!m) return
  const next = Math.max(0, (m.get(key) ?? 0) + by)
  m.set(key, max === undefined ? next : Math.min(next, max))
}

/** One of the character's sub-maps (data, scores, resources…), made if it's missing. */
function part(campaign: Campaign, id: string, key: 'data' | 'scores' | 'resources' | 'modifiers' | 'fields'): Y.Map<any> | undefined {
  const m = campaign.characters.get(id)
  if (!m) return undefined
  let map = m.get(key) as Y.Map<any> | undefined
  if (!(map instanceof Y.Map)) {
    map = new Y.Map()
    m.set(key, map)
  }
  return map
}

/** Set one of the system's own fields. */
export function setData(campaign: Campaign, id: string, key: string, value: DataValue) {
  part(campaign, id, 'data')?.set(key, value)
}

/** Add to one of the system's numeric fields, never below zero. */
export function bumpData(campaign: Campaign, id: string, key: string, by: number, max?: number) {
  const data = part(campaign, id, 'data')
  if (!data) return
  const next = Math.max(0, Number(data.get(key) ?? 0) + by)
  data.set(key, max === undefined ? next : Math.min(next, max))
}

export function setScore(campaign: Campaign, id: string, stat: string, score: number) {
  part(campaign, id, 'scores')?.set(stat, score)
}

/** Add to a resource (HP, spell slots), between zero and its maximum. */
export function bumpResource(campaign: Campaign, id: string, resource: string, by: number, max?: number) {
  const r = part(campaign, id, 'resources')
  if (!r) return
  const next = Math.max(0, (r.get(resource) ?? 0) + by)
  r.set(resource, max === undefined ? next : Math.min(next, max))
}

/** Set a standing roll modifier (Dungeon World's forward, ongoing). */
export function setModifier(campaign: Campaign, id: string, modifier: string, value: number) {
  part(campaign, id, 'modifiers')?.set(modifier, value)
}

/** Give or take away a condition. */
export function toggleCondition(campaign: Campaign, id: string, condition: string) {
  const m = campaign.characters.get(id)
  if (!m) return
  const now: string[] = m.get('conditions') ?? []
  m.set('conditions', now.includes(condition) ? now.filter((x) => x !== condition) : [...now, condition])
}

/** Set one of an NPC's system-defined fields. */
export function setNpcField(campaign: Campaign, id: string, field: string, value: string | number) {
  part(campaign, id, 'fields')?.set(field, value)
}

/** Set by Characters/Palette to ask for a stat or bond before a move rolls. */
export const moveRequest = signal<{ moveId: string; characterId: string; targets?: MoveTarget[] } | null>(null)

/** A move waiting for its targets to be picked on the scene (see table/TargetBar.tsx). */
export const targetRequest = signal<{ moveId: string; characterId: string } | null>(null)

/** Make a move as a character: ask for input if it needs any, otherwise roll and post. */
/**
 * Use a move: first ask for targets if it's aimed at someone, then for any
 * stat or number it needs, then roll.
 */
export function startMove(campaign: Campaign, characterId: string, move: ActionDef, targets?: MoveTarget[]) {
  if (move.target && !targets) {
    moveRequest.value = null
    targetRequest.value = { moveId: move.id, characterId }
  } else if (needsChoice(move)) moveRequest.value = { moveId: move.id, characterId, targets }
  else void makeMove(campaign, characterId, move, {}, targets)
}

export function makeMove(campaign: Campaign, characterId: string, move: ActionDef, choice: MoveChoice = {}, targets?: MoveTarget[]) {
  const system = systemOf(campaign)
  const c = getCharacter(campaign, characterId)
  if (!c) return
  const d = derive(c, system)
  const { spent, ...result } = performMove(system, move, c, d, choice)
  // A roll uses up modifiers that last for one roll; text-only moves leave them.
  for (const id of spent) setModifier(campaign, c.id, id, 0)
  return campaign.chat.post(
    {
      kind: 'move',
      moveId: move.id,
      moveName: move.name,
      trigger: move.trigger,
      characterId: c.id,
      characterName: c.name,
      ...(targets?.length ? { targets } : {}),
      ...result,
    },
    { id: device.value.id, name: myName(campaign) },
  )
}

/** Carry out a suggestion button from a move card. */
export function applySuggestion(campaign: Campaign, characterId: string, s: MoveSuggestion) {
  if (s.bump) bumpData(campaign, characterId, s.bump.field, s.bump.by)
  else if (s.roll) postRoll(campaign, s.roll.formula, 'public', s.roll.comment)
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
