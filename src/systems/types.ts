/*
 * A game system: mostly declarative data (stats, moves, classes, gear) plus a
 * few pure functions. The core provides sheets, dice, chat, effects and
 * storage; a system only describes the rules (see design, "Plugin system").
 */

import type { CharacterView, Derived } from '../characters/store'

export interface StatDef {
  id: string
  name: string
  abbr: string
}

export type Band = 'strong' | 'weak' | 'miss'

/** What a move's result bands do, in plain text for the card. */
export interface MoveOutcomes {
  strong: string
  weak: string
  miss: string
}

/** A follow-up the card offers. The GM stays in charge: nothing is automatic. */
export type SuggestionKind = 'xp' | 'damage'

export interface MoveDef {
  id: string
  name: string
  category: 'basic' | 'special' | 'class'
  /** For class moves: the class that has it, so the sheet can list it. */
  classId?: string
  trigger: string
  /** The full rules text. */
  text: string
  /**
   * Which stat the roll adds: a stat id, 'choose' to ask when it's used, or
   * 'bond' for a bond bonus asked for when it's used. Absent for moves that
   * don't roll.
   */
  roll?: { stat: string }
  outcomes?: MoveOutcomes
  /** Offered when the result lands in these bands. */
  suggest?: Partial<Record<Band, SuggestionKind[]>>
  tags?: string[]
}

export interface ClassDef {
  id: string
  name: string
  baseHp: number
  /** Damage die sides. */
  damage: number
  /** Load capacity before adding STR. */
  load: number
  /** What the class is, in a line. */
  blurb: string
  /** An icon from the core vocabulary (ui/entryIcons.tsx), by name. */
  icon?: string
}

export type EffectOp = 'add' | 'set' | 'multiply' | 'min' | 'max'

/** Shared by items, conditions and features (design: "Effect model"). */
export type Effect =
  | { type: 'modify'; path: string; op: EffectOp; value: number; priority?: number }
  | { type: 'grantMove'; move: string }
  | { type: 'grantTag'; tag: string }
  | { type: 'rollBonus'; stat?: string; moves?: string[]; value: number }

export type EffectActive = 'always' | 'carried' | 'equipped'

export interface ItemDef {
  id: string
  name: string
  description: string
  weight: number
  /** Total uses, for things that run out (rations, ammo, potions). */
  uses?: number
  tags: string[]
  effects?: Effect[]
  /** Which state turns the effects on; defaults to 'carried'. */
  active?: EffectActive
  /** True for things you can wear or wield, so the sheet shows an Equipped toggle. */
  equippable?: boolean
  /** An icon from the core vocabulary (ui/entryIcons.tsx), by name. */
  icon?: string
}

export interface TagDef {
  id: string
  name: string
  text: string
}

/** A field on an NPC's sheet. The system decides what NPCs have. */
export interface NpcFieldDef {
  id: string
  label: string
  type: 'text' | 'number' | 'longtext'
}

/** A figure a system shows on a character's token. */
export interface TokenStat {
  id: string
  label: string
  /** Drawn as a bar of value out of max. */
  value: number
  max: number
  /** CSS colour of the filled part. */
  colour: string
}

export interface GameSystem {
  id: string
  name: string
  version: string
  stats: StatDef[]
  /** The modifier a stat score gives. */
  modifier(score: number): number
  /** Which band a roll total lands in. */
  band(total: number): Band
  /** The roll to make, before modifiers. */
  baseRoll: string
  moves: MoveDef[]
  classes: ClassDef[]
  items: ItemDef[]
  tags: TagDef[]
  /** Debilities: each gives -1 to its stat's rolls. */
  debilities: { id: string; name: string; stat: string }[]
  /** What an NPC's sheet records, besides name, HP and notes. */
  npcFields: NpcFieldDef[]
  /** What a token tied to this character shows, in order (the system decides). */
  tokenStats(c: CharacterView, d: Derived): TokenStat[]
  /** Credit for the rules text. */
  attribution: string
}
