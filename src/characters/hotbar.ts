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

const key = (characterId: string) => `hotbar:${characterId}`

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
  if (!characterId) return ['tool:ping', 'tool:ruler']
  const saved: string[] | undefined = campaign.members.get(device.value.id)?.get(key(characterId))
  return saved ?? defaultHotbar(campaign, characterId)
}

export function setHotbar(campaign: Campaign, characterId: string, slots: string[]) {
  campaign.members.get(device.value.id)?.set(key(characterId), slots)
}

/** Edit the selected character's hotbar. Returns false when there is none. */
export function editHotbar(campaign: Campaign, edit: (slots: string[]) => string[]): boolean {
  const id = selectedCharacterId(campaign)
  if (!id) return false
  setHotbar(campaign, id, edit(hotbarSlots(campaign, id)))
  return true
}
