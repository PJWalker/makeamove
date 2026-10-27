import type * as Y from 'yjs'
import { newId } from '../lib/ids'
import type { ActionDef, GameSystem, ItemDef } from '../systems/types'

/*
 * A campaign's homebrew: gear and moves made at the table, kept in the
 * campaign root as `homebrew` (id -> entry) so they sync like everything
 * else. They join the system's own gear and moves (`withHomebrew`), so they
 * go in inventories, are learned by dropping them on a character, and roll
 * like any other move. The Items panel lists and edits them.
 */

export type HomebrewEntry = { kind: 'gear'; item: ItemDef } | { kind: 'move'; move: ActionDef }

/** Homebrew ids are prefixed so they never collide with a system's. */
const PREFIX = 'hb-'

export const newHomebrewId = () => `${PREFIX}${newId()}`
export const isHomebrew = (id: string) => id.startsWith(PREFIX)

export function listHomebrew(map: Y.Map<HomebrewEntry>): (HomebrewEntry & { id: string })[] {
  return [...map.entries()]
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
}

const nameOf = (e: HomebrewEntry) => (e.kind === 'gear' ? e.item.name : e.move.name)

/** Save gear: a new id when it has none yet. Returns the id. */
export function saveGear(map: Y.Map<HomebrewEntry>, item: ItemDef): string {
  const id = item.id || newHomebrewId()
  map.set(id, { kind: 'gear', item: { ...item, id } })
  return id
}

export function saveMove(map: Y.Map<HomebrewEntry>, move: ActionDef): string {
  const id = move.id || newHomebrewId()
  map.set(id, { kind: 'move', move: { ...move, id } })
  return id
}

export function deleteHomebrew(map: Y.Map<HomebrewEntry>, id: string) {
  map.delete(id)
}

/** A system with the campaign's homebrew added: its gear after the system's, its moves too. */
export function withHomebrew(system: GameSystem, entries: HomebrewEntry[]): GameSystem {
  if (!entries.length) return system
  const items = entries.flatMap((e) => (e.kind === 'gear' ? [e.item] : []))
  const actions = entries.flatMap((e) => (e.kind === 'move' ? [e.move] : []))
  return { ...system, items: [...system.items, ...items], actions: [...system.actions, ...actions] }
}
