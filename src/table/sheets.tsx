import type { ComponentType } from 'preact'
import type { CharacterView } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { DungeonWorldNpcSheet, DungeonWorldSheet } from '../systems/dungeon-world/Sheet'
import type { GameSystem } from '../systems/types'

/*
 * Each system's character sheets, by system id. Kept apart from the systems'
 * rules so those stay free of UI code; declarative sheets (M5) replace most
 * of this.
 */

type SheetProps = { campaign: Campaign; system: GameSystem; c: CharacterView }

const SHEETS: Record<string, { pc: ComponentType<SheetProps>; npc: ComponentType<SheetProps> }> = {
  'dungeon-world': { pc: DungeonWorldSheet, npc: DungeonWorldNpcSheet },
}

/** A character's sheet, as their campaign's system draws it. */
export function CharacterSheet({ campaign, system, c }: SheetProps) {
  const sheets = SHEETS[system.id] ?? SHEETS['dungeon-world']
  const Sheet = c.kind === 'npc' ? sheets.npc : sheets.pc
  return <Sheet key={c.id} campaign={campaign} system={system} c={c} />
}
