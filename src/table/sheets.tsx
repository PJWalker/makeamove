import type { ComponentType } from 'preact'
import type { CharacterView } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { DndNpcSheet, DndSheet } from '../systems/dnd55e/Sheet'
import type { GameSystem } from '../systems/types'
import { CopyBanner, TemplateSettings } from './TemplateSettings'
import { DeclarativeSheet } from './DeclarativeSheet'
import { RelationshipsSection } from './Relationships'

/*
 * A character's sheet: the system's declarative layout, drawn by the core,
 * or for a system that draws its own (5.5e), its components, kept here so
 * the systems' rules stay free of UI code.
 */

type SheetProps = { campaign: Campaign; system: GameSystem; c: CharacterView }

const SHEETS: Record<string, { pc: ComponentType<SheetProps>; npc: ComponentType<SheetProps> }> = {
  'dnd-5.5e': { pc: DndSheet, npc: DndNpcSheet },
}

/** For systems with a layout: the core's declarative sheet. */
const declarative = (kind: 'pc' | 'npc') => (p: SheetProps) => <DeclarativeSheet {...p} layout={p.system.sheet![kind]} />
const DECLARATIVE = { pc: declarative('pc'), npc: declarative('npc') }

/** A character's sheet, as their campaign's system draws it. */
export function CharacterSheet({ campaign, system, c }: SheetProps) {
  const sheets = system.sheet ? DECLARATIVE : (SHEETS[system.id] ?? DECLARATIVE)
  const Sheet = c.kind === 'npc' ? sheets.npc : sheets.pc
  return (
    <>
      {c.base && <CopyBanner campaign={campaign} c={c} />}
      <Sheet key={c.id} campaign={campaign} system={system} c={c} />
      <RelationshipsSection key={`rel-${c.id}`} campaign={campaign} c={c} />
      {c.kind === 'npc' && !c.base && <TemplateSettings campaign={campaign} c={c} />}
    </>
  )
}
