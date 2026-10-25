import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { movesFor, derive, itemActive } from './store'
import { getCharacter, selectedCharacterId, systemOf } from './api'

/*
 * The hotbar is a list of action ids per player and character, kept in the
 * player's own member entry so it syncs between their devices but never
 * touches anyone else's.
 */

export const MAX_SLOTS = 12

/** Without a character there is one shared bar, so pinning always works. */
const key = (characterId?: string) => `hotbar:${characterId ?? 'global'}`

/** Pin to the end; already-pinned ids stay where they are. */
export function pin(slots: string[], id: string): string[] {
  return slots.includes(id) || slots.length >= MAX_SLOTS ? slots : [...slots, id]
}

export const unpin = (slots: string[], id: string) => slots.filter((s) => s !== id)

/** Move a slot one place left (-1) or right (+1). */
export function shift(slots: string[], id: string, by: -1 | 1): string[] {
  const i = slots.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= slots.length) return slots
  const next = [...slots]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** What a fresh hotbar holds: the character's moves, gear with uses, and the table tools. */
export function defaultHotbar(campaign: Campaign, characterId: string): string[] {
  const system = systemOf(campaign)
  const c = getCharacter(campaign, characterId)
  if (!c) return ['tool:ping', 'tool:ruler']
  const d = derive(c, system)
  const moves = movesFor(c, system, d)
    .filter((m) => m.category !== 'special')
    .map((m) => `move:${m.id}`)
  const gear = c.inventory.filter((i) => i.uses && itemActive(i)).map((i) => `use:${i.id}`)
  return [...moves, ...gear, 'tool:ping', 'tool:ruler'].slice(0, MAX_SLOTS)
}

export function hotbarSlots(campaign: Campaign, characterId: string | undefined): string[] {
  const saved: string[] | undefined = campaign.members.get(device.value.id)?.get(key(characterId))
  return saved ?? (characterId ? defaultHotbar(campaign, characterId) : ['tool:ping', 'tool:ruler'])
}

export function setHotbar(campaign: Campaign, characterId: string | undefined, slots: string[]) {
  campaign.members.get(device.value.id)?.set(key(characterId), slots)
}

/** Move a slot to a position (as counted before it was lifted out). */
export function moveTo(slots: string[], id: string, index: number): string[] {
  const from = slots.indexOf(id)
  if (from < 0) return slots
  const rest = slots.filter((s) => s !== id)
  rest.splice(index > from ? index - 1 : index, 0, id)
  return rest
}

/** Edit the selected character's hotbar (or the shared one with no character). */
export function editHotbar(campaign: Campaign, edit: (slots: string[]) => string[]): boolean {
  const id = selectedCharacterId(campaign)
  if (!campaign.members.get(device.value.id)) return false
  setHotbar(campaign, id, edit(hotbarSlots(campaign, id)))
  return true
}

export const isPinned = (campaign: Campaign, id: string) =>
  hotbarSlots(campaign, selectedCharacterId(campaign)).includes(id)

/** Pin an action at a position, or move it there if it is already pinned. */
export function insertAt(slots: string[], id: string, index: number): string[] {
  if (slots.includes(id)) return placeAt(slots, id, index)
  if (slots.length >= MAX_SLOTS) return slots
  const next = [...slots]
  next.splice(index, 0, id)
  return next
}

/** Put a slot at a position among the other slots (counted with it lifted out). */
export function placeAt(slots: string[], id: string, index: number): string[] {
  if (!slots.includes(id)) return slots
  const rest = slots.filter((s) => s !== id)
  rest.splice(index, 0, id)
  return rest
}
