/*
 * A game system: mostly declarative data (stats, actions, classes, gear,
 * conditions) plus a few pure functions. The core provides characters,
 * sheets, dice, chat, effects and storage; a system describes the rules
 * (see design, "Plugin system" and "D&D 5.5e plugin and a general rules
 * engine").
 */

import type { CharacterView } from '../characters/store'
import type { EffectSource, Resolved } from './effects'

export interface StatDef {
  id: string
  name: string
  abbr: string
}

/** A value the system keeps in a character's data. */
export type DataValue = string | number | boolean

/** One of the system's own character fields, with its value on a new character. */
export interface DataField {
  id: string
  default: DataValue
  /** Only on player characters, or only on NPCs. */
  for?: 'pc' | 'npc'
}

/** Events that refill resources. */
export type ResetEvent = 'short-rest' | 'long-rest'

/** A counter with a maximum: hit points, spell slots, a class resource. */
export interface ResourceDef {
  id: string
  name: string
  /** The derived value that is its maximum. */
  max: string
  /** What refills it to its maximum. */
  resets?: ResetEvent[]
}

/** A condition a character can have, and what it does while they have it. */
export interface ConditionDef {
  id: string
  name: string
  text?: string
  effects: Effect[]
  /** The stat it's shown beside on the sheet, if it belongs to one. */
  stat?: string
}

/**
 * A standing roll modifier the sheet keeps as a number: spent by the next
 * roll, or kept until removed.
 */
export interface ModifierDef {
  id: string
  label: string
  until: 'next-roll' | 'removed'
}

/** One result of a check, best first: "Full success". */
export interface ResultDef {
  id: string
  label: string
}

/** Something asked of the player before an action rolls. */
export type Ask =
  /** Which stat to add. */
  | { kind: 'stat' }
  /** A number to add, such as a bond. `label` names it in the formula. */
  | { kind: 'number'; label: string; prompt: string; min: number; max: number }

/**
 * Roll the system's base roll plus a stat and every bonus that applies, and
 * read out the result: Dungeon World's moves.
 */
export interface CheckStep {
  kind: 'check'
  /** The stat added. */
  stat?: string
  ask?: Ask
  /** What each result means, by result id. */
  outcomes: Record<string, string>
  /** Follow-up buttons offered for each result, by follow-up id. */
  followUps?: Record<string, string[]>
}

/** Parts of an action, done in order. More kinds arrive with targeting (M5 step 3). */
export type ActionStep = CheckStep

/** Something a character can do: a move, an attack, a spell, a feature. */
export interface ActionDef {
  id: string
  name: string
  /** The system's grouping, for filters: "basic", "class". */
  category: string
  /** For class actions: the class that has it. */
  classId?: string
  /** When it applies, in a line. */
  trigger: string
  /** The full rules text. */
  text: string
  /** What it does when it's used. With no steps it is just read out. */
  steps: ActionStep[]
  tags?: string[]
}

/** A grouping of actions, for the sheet's filter. */
export interface ActionCategory {
  id: string
  label: string
  /** False for actions too situational to fill a new hotbar with. */
  onHotbar?: boolean
}

/** A follow-up button on an action card. The GM stays in charge: nothing is automatic. */
export type FollowUpDef =
  /** Add to one of the character's data fields: "Mark XP". */
  | { id: string; kind: 'bump'; label: string; field: string; by: number }
  /** Roll a formula worked out from the character: "Roll damage". */
  | { id: string; kind: 'roll'; label: string; comment: string; formula: (c: CharacterView, d: Derived) => string }

export interface ClassDef {
  id: string
  name: string
  /** What the class is, in a line. */
  blurb: string
  /** An icon from the core vocabulary (ui/entryIcons.tsx), by name. */
  icon?: string
  /** The system's numbers for the class: Dungeon World's base HP, damage die, load. */
  values: Record<string, number>
}

export type EffectOp = 'add' | 'set' | 'multiply' | 'min' | 'max'

/** Shared by items, conditions and features (design: "Effect model"). */
export type Effect =
  | { type: 'modify'; path: string; op: EffectOp; value: number; priority?: number }
  /** Gives the character an action they wouldn't otherwise have. */
  | { type: 'grantMove'; move: string }
  | { type: 'grantTag'; tag: string }
  /** Adds to rolls with a stat, or with given actions. */
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

/** A character's effective numbers, worked out by the system. */
export interface Derived {
  /** Named values (max HP, armour, load…), after every active effect. */
  values: Record<string, number>
  /** Each stat's modifier. */
  mods: Record<string, number>
  /** How effects changed things: explanations, granted actions, roll bonuses. */
  resolved: Resolved
}

export interface GameSystem {
  id: string
  name: string
  version: string
  stats: StatDef[]
  /** The modifier a stat score gives. */
  modifier(score: number): number
  /** The roll a check starts from, before modifiers. */
  baseRoll: string
  /** A check's possible results, best first. */
  results: ResultDef[]
  /** Which result a check's total gets. */
  result(total: number): string
  actions: ActionDef[]
  actionCategories: ActionCategory[]
  followUps: FollowUpDef[]
  classes: ClassDef[]
  items: ItemDef[]
  tags: TagDef[]
  conditions: ConditionDef[]
  modifiers: ModifierDef[]
  resources: ResourceDef[]
  /** The system's own character fields. */
  characterData: DataField[]
  /** What an NPC's sheet records, besides name, HP and notes. */
  npcFields: NpcFieldDef[]
  /** A character's effective numbers, from their record and every active effect source. */
  derive(c: CharacterView, sources: EffectSource[]): Derived
  /** The actions a character has. */
  actionsFor(c: CharacterView, d: Derived): ActionDef[]
  /** What a token tied to this character shows, in order (the system decides). */
  tokenStats(c: CharacterView, d: Derived): TokenStat[]
  /** Credit for the rules text. */
  attribution: string
}
