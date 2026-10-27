/*
 * A game system: mostly declarative data (stats, actions, classes, gear,
 * conditions) plus a few pure functions. The core provides characters,
 * sheets, dice, chat, effects and storage; a system describes the rules
 * (see design, "Plugin system" and "D&D 5.5e plugin and a general rules
 * engine").
 */

import type { CharacterView } from '../characters/store'
import type { DiagonalRule } from '../scene/grid'
import type { Range } from '../scene/measure'
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

/** Events that refill resources: rests, and in combat the start of the character's turn. */
export type ResetEvent = 'short-rest' | 'long-rest' | 'turn'

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
  /** Shown on the card; empty to show no result line. */
  label: string
  /** How the card colours it. */
  tone?: 'good' | 'mixed' | 'bad'
}

/** Another way to make the base roll, offered before a check: "Advantage". */
export interface RollMode {
  id: string
  label: string
  roll: string
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
  /** Derived values added after the stat, each with its label: proficiency, a spell attack bonus. Zero adds nothing. */
  add?: { value: string; label: string }[]
  /**
   * A value each target's character has that the total must reach ("ac"):
   * the check is then rolled once per target and read as a hit or a miss
   * (see GameSystem.hits).
   */
  against?: string
  /** What each result means, by result id. */
  outcomes: Record<string, string>
  /** Follow-up buttons offered for each result, by follow-up id. On a check against targets, those of the best result that hit. */
  followUps?: Record<string, string[]>
}

/**
 * Ask each target to roll one of their own actions (a saving throw) against
 * a number the actor has (their spell save DC). The card carries a roll
 * request per target, which only that target's owner or the GM can answer.
 */
export interface SaveStep {
  kind: 'save'
  /** The action each target rolls: "save-dex". */
  action: string
  /** The actor's derived value it's rolled against: "spellDc". */
  dc: string
  /** What happens on a success and on a failure. */
  success: string
  failure: string
}

/**
 * What an action is aimed at. Using it asks the player to pick tokens on the
 * scene first.
 */
export interface TargetSpec {
  /** What to target, as an instruction: "Target the enemy you're attacking". */
  prompt: string
  /** How many must be chosen, at least. */
  min: number
  /** How many can be chosen; no limit if missing. */
  max?: number
  /** How far away a target may be, in scene units. */
  range?: Range
  /** An area placed on the scene; the tokens it covers become the targets. */
  area?: AreaSpec
}

/**
 * An area of effect, in scene units: a sphere or emanation by its radius, a
 * cube by its side, a cone or line by its length (and a line's width).
 */
export interface AreaSpec {
  shape: 'sphere' | 'emanation' | 'cube' | 'cone' | 'line'
  size: number
  width?: number
}

/** Parts of an action, done in order. */
export type ActionStep = CheckStep | SaveStep

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
  /** What it's aimed at, if it asks for targets. */
  target?: TargetSpec
  /** Lasts while the character concentrates: using it ends any other concentration. */
  concentration?: boolean
  /** What it does when it's used. With no steps it is just read out. */
  steps: ActionStep[]
  /** Follow-up buttons offered when it has no check (a heal, a spell's damage), by follow-up id. */
  followUps?: string[]
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
  | {
      id: string
      kind: 'roll'
      label: string
      comment: string
      formula: (c: CharacterView, d: Derived) => string
      /** A damage type, or 'healing': the roll then offers to apply itself to the action's targets. */
      damage?: string
    }

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

/** A size a creature's token can be, in grid cells across: Large is 2. */
export interface SizeDef {
  id: string
  name: string
  cells: number
}

/** How a system measures its scenes, as defaults for new ones. */
export interface SceneDefaults {
  /** How far one cell is, in `unitName`s. */
  unit: number
  unitName: string
  diagonal: DiagonalRule
}

/** A field on an NPC's sheet. The system decides what NPCs have. */
export interface NpcFieldDef {
  id: string
  label: string
  /** 'longtext' is rich text, kept apart from the other fields (see table/CharacterText.tsx). */
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

/** A kind of damage, which a creature may resist (half), be vulnerable to (double) or be immune to. */
export interface DamageTypeDef {
  id: string
  name: string
}

/** One option of a character-creation choice: a species, a background, a subclass, a feat. */
export interface OptionDef {
  id: string
  name: string
  /** What it is and gives, in a few lines. */
  text: string
  /** Stats the player may raise when picking it (5.5e backgrounds: +2 and +1, or +1 to all three), by these amounts. */
  boost?: { stats: string[]; amounts: number[][] }
  /** Data fields it sets on the character: a background's skill proficiencies. */
  grants?: Record<string, DataValue>
  /** Only for this class (subclasses). */
  classId?: string
}

/** A choice made when creating or levelling a character, kept in a data field. */
export interface ChoiceDef {
  id: string
  label: string
  /** Its options' collection name in the Libraries ("Backgrounds"); the label if missing. */
  plural?: string
  /** The data field the chosen option's id is stored in. */
  field: string
  options: OptionDef[]
  /** Made at creation, or on reaching a level (a subclass at 3). */
  at: 'create' | number
}

/** Ways to set ability scores when creating a character. */
export interface ScoreMethods {
  /** Scores to assign, one to each stat. */
  standardArray?: number[]
  /** Points to spend, and each score's cost. */
  pointBuy?: { budget: number; costs: Record<number, number> }
  /** A formula to roll for each score. */
  roll?: string
}

/** Character creation and levelling, as data the core's guided flow walks through. */
export interface CreationDef {
  choices: ChoiceDef[]
  scores: ScoreMethods
  /** Levels at which a character raises stats (by `asi` amounts) or takes a feat instead. */
  improvementLevels?: number[]
  /** The feats a character may take at those levels, if the system has feats. */
  feats?: ChoiceDef
}

/**
 * A section of a declarative character sheet (design: core change 13). The
 * core draws each kind; a system lists them in order.
 */
export type SheetSection =
  /** Name, portrait and the class or "NPC" line. */
  | { kind: 'header' }
  /** Numbers with − and + buttons: resources, data fields, the level. */
  | { kind: 'counters'; items: SheetCounter[] }
  /** A ready-to-level-up banner when a data field reaches a derived value. */
  | { kind: 'levelUp'; xp: string; needed: string }
  /** Derived values, read-only, each with the effects that changed it as a tooltip. */
  | { kind: 'derived'; items: { label: string; value: string; format?: 'die'; plus?: string; max?: string }[] }
  /** Each stat: its modifier (click to roll), its score, and any condition tied to it. */
  | { kind: 'stats'; label: string; hint?: string }
  /** The system's standing roll modifiers. */
  | { kind: 'modifiers'; label: string }
  /** The character's actions. */
  | { kind: 'actions'; label: string }
  | { kind: 'inventory' }
  /** An NPC's system-defined fields. */
  | { kind: 'npcFields' }
  /** Rich text fields, under one heading (or none). */
  | { kind: 'text'; label?: string; fields: { field: string; label: string; placeholder?: string }[] }

/** A number on a sheet: a resource, a data field or the level, with an optional maximum (a derived value). */
export type SheetCounter =
  | { label: string; resource: string; max?: string }
  | { label: string; data: string; max?: string; /** A plain number field instead of − and + buttons. */ input?: boolean }
  | { label: string; level: true }

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
  /** Other base rolls the player can pick before a check (advantage, disadvantage); a check then always asks. */
  rollModes?: RollMode[]
  /** A check's possible results, best first. */
  results: ResultDef[]
  /** Which result a check gets, from its total and the kept dice of its base roll. */
  result(total: number, natural: number[]): string
  /** Whether a check against a target's value hits; by default, when the total reaches it. */
  hits?(total: number, natural: number[], target: number): boolean
  /** The roll mode forced at long range (disadvantage); a chosen opposite mode cancels it to a normal roll. */
  longRange?: { mode: string; cancels: string }
  /** Damage types, for follow-ups that roll damage. */
  damageTypes?: DamageTypeDef[]
  /** A data field that soaks damage before hit points do: temporary HP. */
  tempHp?: string
  /** The action that rolls initiative. Systems without one have no turn tracker. */
  initiative?: string
  /** The save a concentrating character makes on taking damage. */
  concentrationSave?(damage: number): { action: string; dc: number }
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
  /** Token sizes, smallest first. */
  sizes: SizeDef[]
  /** Units and diagonal rule for new scenes. */
  scene: SceneDefaults
  /** What an NPC's sheet records, besides name, HP and notes. */
  npcFields: NpcFieldDef[]
  /** A character's effective numbers, from their record and every active effect source. */
  derive(c: CharacterView, sources: EffectSource[]): Derived
  /** The actions a character has. */
  actionsFor(c: CharacterView, d: Derived): ActionDef[]
  /** What a token tied to this character shows, in order (the system decides). */
  tokenStats(c: CharacterView, d: Derived): TokenStat[]
  /** Character creation and levelling, for the guided flow. */
  creation?: CreationDef
  /** Declarative sheets, drawn by the core. A system without them supplies its own components (table/sheets.tsx). */
  sheet?: { pc: SheetSection[]; npc: SheetSection[] }
  /** Credit for the rules text. */
  attribution: string
}
