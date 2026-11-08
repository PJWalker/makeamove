/*
 * A game system: mostly declarative data (stats, actions, gear,
 * conditions) plus a few pure functions. The core provides characters,
 * sheets, dice, chat, effects and storage; a system describes the rules
 * (see design, "Plugin system" and "D&D 5.5e plugin and a general rules
 * engine").
 */

import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { DataValue } from "../core/types";
import type { Roll } from "../features/dice/notation";
import type { DiagonalRule } from "../scene/grid";
import type { Range } from "../scene/measure";
import type { EffectSource, Resolved } from "./effects";
import type { Effect, EffectActive } from "./effectTypes";

export type { DataValue } from "../core/types";
export type { Effect, EffectActive } from "./effectTypes";

export interface StatDef {
  id: string;
  name: string;
  abbr: string;
  default?: number;
  min?: number;
  max?: number;
}

/** One of the system's own character fields, with its value on a new character. */
export interface DataField {
  id: string;
  default: DataValue;
  /** Only on player characters, or only on NPCs. */
  for?: "pc" | "npc";
}

/** A system-owned value shared by everyone in a campaign rather than one character. */
export interface CampaignFieldDef {
  id: string;
  label: string;
  default: DataValue;
  type: "text" | "number" | "select" | "multiselect";
  options?: { id: string; label: string }[];
  min?: number;
  max?: number;
}

/** A named campaign count rendered and advanced by the shared chat counter card. */
export interface SystemCounterDef {
  id: string;
  label: string;
  start: number;
  max?: number;
}

/** Events that refill resources: rests, and in combat the start of the character's turn. */
export type ResetEvent = "short-rest" | "long-rest" | "turn";

/** A counter with a maximum: hit points, spell slots, a system resource. */
export interface ResourceDef {
  id: string;
  name: string;
  /** The derived value that is its maximum. */
  max: string;
  /** Starting value for a new character; defaults to the maximum. */
  initial?: number;
  /** What refills it to its maximum. */
  resets?: ResetEvent[];
  /** A state it puts the character in while it's at or below a derived value: "Bloodied". */
  status?: ResourceStatus;
}

/** A state read from a resource, shown beside it on the sheet and as a pip on tokens. */
export interface ResourceStatus {
  id: string;
  name: string;
  /** The derived value it applies at or below. */
  atOrBelow: string;
  colour: string;
}

/**
 * A number on a character that text can change with an inline button,
 * written [[+1 XP]] or [[-1 Treasure|Spend 1 Treasure]].
 */
export interface TrackerDef {
  id: string;
  name: string;
  /** Other names text may use for it ("Treasure boxes"). */
  aliases?: string[];
  /** Where it's kept: a resource, or one of the system's data fields. */
  resource?: string;
  data?: string;
  /** Its maximum: a number, or a derived value's name. */
  max?: number | string;
}

/** A condition a character can have, and what it does while they have it. */
export interface ConditionDef {
  id: string;
  name: string;
  text?: string;
  effects: Effect[];
  /** Offer clear, marked, and locked states instead of a binary toggle. */
  lockable?: boolean;
  /** The stat it's shown beside on the sheet, if it belongs to one. */
  stat?: string;
  /** Its pip colour; otherwise one by its place in the system's list. */
  colour?: string;
}

/**
 * A standing roll modifier the sheet keeps as a number: spent by the next
 * roll, or kept until removed.
 */
export interface ModifierDef {
  id: string;
  label: string;
  until: "next-roll" | "removed";
}

/** One result of a check, best first: "Full success". */
export interface ResultDef {
  id: string;
  /** Shown on the card; empty to show no result line. */
  label: string;
  /** How the card colours it. */
  tone?: "good" | "mixed" | "bad";
}

/** Another way to make the base roll, offered before a check: "Advantage". */
export interface RollMode {
  id: string;
  label: string;
  roll: string;
  /** Limit this mode to action categories such as Blades action rolls. */
  categories?: string[];
}

/** Something asked of the player before an action rolls. */
export type Ask =
  /** Which stat to add. */
  | { kind: "stat" }
  /** A number to add, such as a bond. `label` names it in the formula. */
  | { kind: "number"; label: string; prompt: string; min: number; max: number; initial?: number }
  /** Yes-or-no questions, adding one for each yes. `label` names the total in the formula. */
  | { kind: "questions"; label: string; prompt: string; questions: string[] };

/**
 * Roll the system's base roll plus a stat and every bonus that applies, and
 * read out the result: Dungeon World's moves.
 */
export interface CheckStep {
  kind: "check";
  /** The stat added. */
  stat?: string;
  ask?: Ask;
  /** Difficulty is either entered for a roll or read from each targeted character. */
  difficulty?: CheckDifficulty;
  /** A shared counter selected before the roll; follow-ups can advance it. */
  counter?: { prompt: string };
  /** Character-owned optional bonuses selectable before this check. */
  rollBonuses?: {
    id: string;
    label: string;
    nameField?: string;
    valueField: string;
    cost?: { resource: string; by: number };
  }[];
  /** Derived values added after the stat, each with its label: proficiency, a spell attack bonus. Zero adds nothing. */
  add?: { value: string; label: string }[];
  /** What each result means, by result id. */
  outcomes: Record<string, string>;
  /** Follow-up buttons offered for each result, by follow-up id. On a check against targets, those of the best result that hit. */
  followUps?: Record<string, string[]>;
  followUpsFor?(roll: Roll, character: CharacterView, derived: Derived): string[];
}

export type CheckDifficulty =
  | { kind: "fixed"; value: number }
  | { kind: "derived"; value: string }
  | { kind: "prompt"; prompt: string; initial?: number; min?: number; max?: number }
  | { kind: "target"; value: string };

/**
 * Ask each target to roll one of their own actions (a saving throw) against
 * a number the actor has (their spell save DC). The card carries a roll
 * request per target, which only that target's owner or the GM can answer.
 */
export interface SaveStep {
  kind: "save";
  /** The action each target rolls: "save-dex". */
  action: string;
  /** The actor's derived value it's rolled against: "spellDc". */
  difficulty: CheckDifficulty;
  /** What happens on a success and on a failure. */
  success: string;
  failure: string;
}

/**
 * What an action is aimed at. Using it asks the player to pick tokens on the
 * scene first.
 */
export interface TargetSpec {
  /** What to target, as an instruction: "Target the enemy you're attacking". */
  prompt: string;
  /** How many must be chosen, at least. */
  min: number;
  /** How many can be chosen; no limit if missing. */
  max?: number;
  /** How far away a target may be, in scene units. */
  range?: Range;
  /** An area placed on the scene; the tokens it covers become the targets. */
  area?: AreaSpec;
}

/**
 * An area of effect, in scene units: a sphere or emanation by its radius, a
 * cube by its side, a cone or line by its length (and a line's width).
 */
export interface AreaSpec {
  shape: "sphere" | "emanation" | "cube" | "cone" | "line";
  size: number;
  width?: number;
}

/** Parts of an action, done in order. */
export type ActionStep = CheckStep | SaveStep;

/** Something a character can do: a move, an attack, a spell, a feature. */
export interface ActionDef {
  id: string;
  name: string;
  /** The system's grouping, for filters. */
  category: string;
  /** A move limited per character or per campaign session. */
  sessionUse?: "character" | "campaign";
  /** When it applies, in a line. */
  trigger: string;
  /** The full rules text. */
  text: string;
  /** What it's aimed at, if it asks for targets. */
  target?: TargetSpec;
  /** Lasts while the character concentrates: using it ends any other concentration. */
  concentration?: boolean;
  /** What it does when it's used. With no steps it is just read out. */
  steps: ActionStep[];
  costs?: { resource: string; by: number }[];
  variants?(
    character: CharacterView,
    derived: Derived,
  ): {
    id: string;
    label: string;
    costs: { resource: string; by: number }[];
    values?: Record<string, number>;
  }[];
  /** Follow-up buttons offered when it has no check (a heal, a spell's damage), by follow-up id. */
  followUps?: string[];
  tags?: string[];
}

/** A grouping of actions, for the sheet's filter. */
export interface ActionCategory {
  id: string;
  label: string;
  /** False for actions too situational to fill a new hotbar with. */
  onHotbar?: boolean;
}

/** A follow-up button on an action card. The GM stays in charge: nothing is automatic. */
export type FollowUpDef =
  /** Add to one of the character's data fields: "Mark XP". */
  | { id: string; kind: "bump"; label: string; field: string; by: number }
  /** Change a character resource such as Hope, HP, or Stress. */
  | { id: string; kind: "resource"; label: string; resource: string; by: number }
  /** Advance the selected counter, or a named system counter. */
  | { id: string; kind: "counter"; label: string; by: number; systemCounter?: string }
  /** Roll a formula worked out from the character: "Roll damage". */
  | {
      id: string;
      kind: "roll";
      label: string;
      comment: string;
      formula: (c: CharacterView, d: Derived) => string;
      /** A damage type, or 'healing': the roll then offers to apply itself to the action's targets. */
      damage?: string;
    };

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  weight: number;
  /** Optional abstract Wealth tier cost used by systems with campaign economies. */
  wealthCost?: { rank: number; tier: string };
  /** Total uses, for things that run out (rations, ammo, potions). */
  uses?: number;
  /** Uses refreshed by the system's own camp or rest move, rather than spent by the Use button. */
  resetUsesAtCamp?: boolean;
  /** A system-defined use: the system's inventory extension decides what using it does. */
  itemUse?: string;
  /** Progress and move choices for a source-defined Artifact. */
  artifact?: ArtifactDef;
  tags: string[];
  effects?: Effect[];
  /** Which state turns the effects on; defaults to 'carried'. */
  active?: EffectActive;
  /** True for things you can wear or wield, so the sheet shows an Equipped toggle. */
  equippable?: boolean;
  /** An icon from the core vocabulary (ui/entryIcons.tsx), by name. */
  icon?: string;
}

export interface ArtifactDef {
  track: string;
  capacity: number;
  unlocks: { id: string; name: string; text?: string }[];
  unlockMode: "choose" | "sequential" | "sequential-replace";
  requiresEquipped?: boolean;
}

export interface TagDef {
  id: string;
  name: string;
  text: string;
}

export interface ReferenceSectionDef {
  id: string;
  title: string;
  text: string;
}

/** A size a creature's token can be, in grid cells across: Large is 2. */
export interface SizeDef {
  id: string;
  name: string;
  cells: number;
}

/** How a system measures its scenes, as defaults for new ones. */
export interface SceneDefaults {
  /** How far one cell is, in `unitName`s. */
  unit: number;
  unitName: string;
  diagonal: DiagonalRule;
}

/** A field on an NPC's sheet. The system decides what NPCs have. */
export interface NpcFieldDef {
  id: string;
  label: string;
  /** 'longtext' is rich text, kept apart from the other fields (see workspace/CharacterText.tsx). */
  type: "text" | "number" | "longtext";
  default?: string | number;
  /** A text field holding dice, like "d8+2": the sheet offers to roll it. */
  rollable?: boolean;
}

/** A system-provided NPC/monster entry that can be copied into a campaign character. */
export interface MonsterDef {
  id: string;
  name: string;
  description: string;
  hp: number;
  scores?: Record<string, number>;
  fields: Record<string, string | number>;
  size?: string;
}

/** A figure a system shows on a character's token. */
export interface TokenStat {
  id: string;
  label: string;
  /** Drawn as a bar of value out of max. */
  value: number;
  max: number;
  /** CSS colour of the filled part. */
  colour: string;
}

/** A kind of damage, which a creature may resist (half), be vulnerable to (double) or be immune to. */
export interface DamageTypeDef {
  id: string;
  name: string;
}

/** One option of a character-creation choice: a species, background, or other system-defined selection. */
export interface OptionDef {
  id: string;
  name: string;
  /** An icon from the core vocabulary (ui/entryIcons.tsx), by name. */
  icon?: string;
  /** What it is and gives, in a few lines. */
  text: string;
  /** Advancement slots consumed by this option; defaults to one. */
  cost?: number;
  /** Stats the player may raise when picking it (5.5e backgrounds: +2 and +1, or +1 to all three), by these amounts. */
  boost?: { stats: string[]; amounts: number[][] };
  /** Data fields it sets on the character: a background's skill proficiencies. */
  grants?: Record<string, DataValue>;
  /** Only when the character has these system-defined values. */
  requires?: Record<string, DataValue>;
  /** Hide when a system-defined value equals one of these values. */
  notRequires?: Record<string, DataValue>;
  /** Require these system data fields to have a nonempty value. */
  requiresFilled?: string[];
  /** System-owned data changes applied when this advancement is selected. */
  dataBoost?: { field: string; by: number }[];
  /** Offer only while this stat is below the given score. */
  requiresScoreBelow?: { stat: string; value: ByLevel };
  /** How many of a list field's values (those starting with prefix) a character may have. */
  limits?: { field: string; prefix?: string; max: ByLevel }[];
  /** Offered only from this advancement level on. */
  minLevel?: number;
  /** A heading the option sits under among its choice's options ("Gain a Path"). */
  group?: string;
  /** Show when any one set of system-defined requirements matches. */
  requiresAny?: Record<string, DataValue>[];
  /** Show when every value exists in a comma-separated system choice field. */
  requiresIncludes?: { field: string; value: string }[];
  /** Hide when a value already exists in a comma-separated choice field. */
  notIncludes?: { field: string; value: string }[];
}

/**
 * A number that can change with level: a plain number, or the value from each
 * level on ({ 1: 2, 5: 3, 10: 4 } is 2 until level 5, then 3, then 4 from 10).
 */
export type ByLevel = number | Record<number, number>;

/** A ByLevel value at a level: the entry for the highest level at or below it. */
export function atLevel(value: ByLevel, level: number): number {
  if (typeof value === "number") return value;
  let out = 0;
  let best = -Infinity;
  for (const [from, n] of Object.entries(value)) {
    const at = Number(from);
    if (at <= level && at > best) [best, out] = [at, n];
  }
  return out;
}

/** A choice made when creating or advancing a character, kept in a data field. */
export interface ChoiceDef {
  id: string;
  label: string;
  /** Its options' collection name in the Libraries ("Backgrounds"); the label if missing. */
  plural?: string;
  /** The data field the chosen option's id is stored in. */
  field: string;
  options: OptionDef[];
  /** Made at creation, or at a system-defined advancement point. */
  at: "create" | "advance" | number;
  /** Advancement choices the player may skip. */
  optional?: boolean;
}

/** Ways to set ability scores when creating a character. */
export interface ScoreMethods {
  /** Scores to assign, one to each stat. */
  standardArray?: number[];
  /** Points to spend, and each score's cost. */
  pointBuy?: { budget: number; costs: Record<number, number> };
  /** A formula to roll for each score. */
  roll?: string;
}

/**
 * A class's required stat line: set stats, one of a few alternatives, and
 * the values left for the other stats in any order.
 */
export interface ScoreRule {
  /** Stats with a set score. */
  fixed: Record<string, number>;
  /** Exactly one of these must hold, e.g. WIS +2 or CHA +2. Empty when there is no alternative. */
  oneOf: Record<string, number>[];
  /** The scores the other stats take, in any order. */
  remaining: number[];
}

/** Character creation and advancement, as data the core's guided flow walks through. */
export interface CreationDef {
  choices: ChoiceDef[];
  scores: ScoreMethods;
  /** Each class's required stat line, keyed by class id, when classes set their own. */
  classScoreRules?: Record<string, ScoreRule>;
  /** Character-data field containing item ids to add to inventory after creation. */
  startingItemsField?: string;
  /** Require every non-optional creation choice to be selected before creating. */
  requireAllCreationChoicesAtCreate?: boolean;
  /** Fields that gather repeated choice ids as comma-separated values. */
  listFields?: string[];
  /** The system's data field that tracks advancement, if it has one. */
  advancementField?: string;
  /** Optional counter reset when the guided advancement is applied. */
  advancementCounterField?: string;
  /** Required number of distinct guided choices at each advancement. */
  choicesPerAdvancement?: number;
  /** Character data field holding stats marked by advancement choices. */
  markedStatsField?: string;
  /** Advancement ranks that clear previously marked stats before new choices. */
  resetMarkedStatsAt?: number[];
  /** Advancement points at which a character raises stats or takes a feat instead. */
  improvementsAt?: number[];
  /** An additional choice available at specified advancement points, if the system defines one. */
  feats?: ChoiceDef;
  /** Free-text character fields asked for at creation, under one heading. */
  identity?: { label: string; fields: { field: string; label: string }[] };
  /** A data field that player characters should each pick differently, with the note shown when one repeats. */
  distinct?: { field: string; note: string };
  /** A new player character starts with a relationship to an existing one, with a starting depth. */
  startingRelationship?: { depths: { value: number; label: string }[] };
  /** Prompts shown under the creation inputs they belong to, from the choices made so far. */
  hints?(data: Record<string, DataValue>): CreationHints;
}

/** Creation prompts, each shown under its input. */
export interface CreationHints {
  name?: string;
  /** Keyed by identity field. */
  identity?: Record<string, string>;
  relationship?: string;
  scores?: string;
}

export interface LoadoutDef {
  id: string;
  label: string;
  ownedField: string;
  available?(character: CharacterView, derived: Derived): string[];
  activeField: string;
  max: number | string;
  options: OptionDef[];
  costs?: Record<string, { resource: string; by: number }>;
  freeSwapLabel?: string;
}

/**
 * A section of a declarative character sheet (design: core change 13). The
 * core draws each kind; a system lists them in order.
 */
export type SheetSection =
  /** Name, portrait and character kind. */
  | { kind: "header" }
  /** System-defined choices shown on the sheet. */
  | { kind: "choices"; choices?: string[] }
  | { kind: "loadout"; loadout: string }
  /** Editable system-owned text or numeric data fields. */
  | {
      kind: "fields";
      label?: string;
      items: {
        field: string;
        label: string;
        type: "text" | "number";
        min?: number;
        max?: number;
      }[];
    }
  /** Numbers with minus and plus buttons: resources and data fields. */
  | { kind: "counters"; items: SheetCounter[] }
  /** A ready-to-advance banner when a data field reaches a derived value. */
  | {
      kind: "advancement";
      xp: string;
      needed: string;
      field: string;
      label: string;
      button: string;
    }
  /** Derived values, read-only, each with the effects that changed it as a tooltip. A die rolls when clicked. */
  | {
      kind: "derived";
      items: {
        label: string;
        value: string;
        format?: "die";
        plus?: string;
        max?: string;
      }[];
    }
  /** Each stat: its modifier (click to roll), optional score, and any condition tied to it. */
  | { kind: "stats"; label: string; hint?: string; showScore?: boolean }
  /** The system's standing roll modifiers. */
  | { kind: "modifiers"; label: string }
  /** The character's actions. */
  | { kind: "actions"; label: string }
  | { kind: "inventory" }
  /** An NPC's system-defined fields. */
  | { kind: "npcFields"; fields?: string[] }
  /** Rich text fields, under one heading (or none). */
  | {
      kind: "text";
      label?: string;
      fields: { field: string; label: string; placeholder?: string }[];
    };

/** A number on a sheet: a resource or data field, with an optional maximum (a derived value). */
export type SheetCounter =
  | { label: string; resource: string; max?: string }
  | {
      label: string;
      data: string;
      max?: string;
      /** A plain number field instead of − and + buttons. */ input?: boolean;
    };

/** A character's effective numbers, worked out by the system. */
export interface Derived {
  /** Named values (max HP, armour, load…), after every active effect. */
  values: Record<string, number>;
  /** Each stat's modifier. */
  mods: Record<string, number>;
  /** How effects changed things: explanations, granted actions, roll bonuses. */
  resolved: Resolved;
}

/**
 * An entry in a system's own Libraries layout: one of its items or moves by
 * id, or a rules entity (a class, a path, a struggle) that can hold others.
 */
export type LibraryNode = (
  | { item: string }
  | { move: string }
  | { entity: { id: string; name: string; text: string; icon?: string } }
) & {
  /** A few words on when or how it applies: "Level 5+", "Starting move". */
  note?: string;
  /** What it holds, under headings: a class's paths, a path's moves. */
  groups?: LibraryNodeGroup[];
};

export interface LibraryNodeGroup {
  id: string;
  name: string;
  /** How many to take, or similar: "Choose 2". */
  note?: string;
  entries: LibraryNode[];
}

export interface LibraryLayoutCollection {
  id: string;
  name: string;
  kind: "item" | "move" | "option";
  entries: LibraryNode[];
}

export interface GameSystem {
  id: string;
  name: string;
  version: string;
  stats: StatDef[];
  /** Whether a stat is a number added to rolls, offered as a chip in the dice tray; true if absent. */
  statsAddToRolls?: boolean;
  /** The modifier a stat score gives. */
  modifier: (score: number) => number;
  /** The roll a check starts from, before modifiers. */
  baseRoll: string;
  /** Label for the unselected base mode in the roll prompt. */
  defaultRollLabel?: string;
  /** Finalize a check formula using system-owned rules. */
  checkRoll?(
    formula: string,
    stat: string | undefined,
    character: CharacterView,
    action?: ActionDef,
  ): string;
  /**
   * Other base rolls the player can pick before a check; a check then always asks. The prompt
   * shows the first half before the plain roll and the rest after: list disadvantage, then advantage.
   */
  rollModes?: RollMode[];
  /** A check's possible results, best first. */
  results: ResultDef[];
  /** Which result a check gets, from its total and the kept dice of its base roll. */
  result(total: number, natural: number[], roll?: Roll, context?: RollContext): string;
  /** Whether a check against a target's value hits; by default, when the total reaches it. */
  hits?(
    total: number,
    natural: number[],
    target: number,
    roll?: Roll,
    context?: RollContext,
  ): boolean;
  /** The roll mode forced at long range (disadvantage); a chosen opposite mode cancels it to a normal roll. */
  longRange?: { mode: string; cancels: string };
  /** Damage types, for follow-ups that roll damage. */
  damageTypes?: DamageTypeDef[];
  /** A data field that soaks damage before hit points do: temporary HP. */
  tempHp?: string;
  damageArmor?: { resource: string; label: string };
  resolveDamage?(
    character: CharacterView,
    derived: Derived,
    amount: number,
    options: { armor?: boolean; type?: string },
  ): { hp: number; resources?: { id: string; by: number }[] };
  /** The action that rolls initiative. Systems without one have no turn tracker. */
  initiative?: string;
  /** The save a concentrating character makes on taking damage. */
  concentrationSave?(damage: number): { action: string; difficulty: CheckDifficulty };
  actions: ActionDef[];
  loadouts?: LoadoutDef[];
  learnedActionAllowed?(action: ActionDef, character: CharacterView, derived: Derived): boolean;
  actionCategories: ActionCategory[];
  followUps: FollowUpDef[];
  items: ItemDef[];
  tags: TagDef[];
  conditions: ConditionDef[];
  modifiers: ModifierDef[];
  resources: ResourceDef[];
  /** What inline buttons in text can change; the resources if absent. */
  trackers?: TrackerDef[];
  /** The system's own character fields. */
  characterData: DataField[];
  /** Shared system state such as crew tier or the GM's Fear pool. */
  campaignFields?: CampaignFieldDef[];
  campaignLabel?: string;
  /** Named campaign counts that should use the core's pinned counter cards. */
  counters?: SystemCounterDef[];
  /** Token sizes, smallest first. */
  sizes: SizeDef[];
  /** Units and diagonal rule for new scenes. */
  scene: SceneDefaults;
  /** What an NPC's sheet records, besides name, HP and notes. */
  npcFields: NpcFieldDef[];
  /** Optional prepared monster/NPC entries for the system library. */
  monsters?: MonsterDef[];
  /**
   * The system's gear, moves and character options as it wants them browsed,
   * nested where they belong. Without it, the Libraries list each kind flat.
   * Tags and monsters are listed as usual either way.
   */
  library?: LibraryLayoutCollection[];
  /** Searchable, system-provided guidance for the GM. */
  gmReference?: ReferenceSectionDef[];
  /** A character's effective numbers, from their record and every active effect source. */
  derive(c: CharacterView, sources: EffectSource[]): Derived;
  /** The actions a character has. */
  actionsFor(c: CharacterView, d: Derived): ActionDef[];
  /** What a token tied to this character shows, in order (the system decides). */
  tokenStats(c: CharacterView, d: Derived): TokenStat[];
  /** Character creation and advancement, for the guided flow. */
  creation?: CreationDef;
  /** Declarative sheets, drawn by the core. A system without them supplies its own components (table/sheets.tsx). */
  sheet?: { pc: SheetSection[]; npc: SheetSection[] };
  /** Relationships carry a depth, from 0 to its maximum. */
  relationshipDepth?: RelationshipDepthDef;
  /** What follows a move once it's rolled (a missed journey's XP for the party). */
  afterMove?(move: ActionDef, result: string | undefined): MoveAftermath | undefined;
  /** Items a character can spend to block a hit of this damage type, best first. */
  damageBlockers?(c: CharacterView, damageType: string): ItemInstance[];
  /** How an item is taken from the Libraries, by the chosen character if any; given for free if absent or undefined. */
  acquireItem?(item: ItemDef, c: CharacterView | undefined): ItemAcquisition | undefined;
  /** Whether the inventory offers a Use button for an item with uses; true if absent. */
  itemUsable?(item: ItemInstance, definition: ItemDef | undefined): boolean;
  /** Credit for the rules text. */
  attribution: string;
}

/** How relationships between characters are measured, for systems that rate them. */
export interface RelationshipDepthDef {
  label: string;
  max: number;
}

/** What follows a move automatically, for the core to apply. */
export interface MoveAftermath {
  /** Data fields bumped on every player character. */
  partyBumps?: { field: string; by: number }[];
}

/** How a character can take an item from the Libraries. */
export interface ItemAcquisition {
  /** The button's label. */
  label: string;
  /** Only the GM can hand it out. */
  gmOnly?: boolean;
  /** Why it can't be taken now, if it can't. */
  blocked?: string;
  /** Data fields set on the character as it's taken: a spent currency. */
  data?: Record<string, DataValue>;
}

/** Context used by result rules that compare a roll against a difficulty. */
export interface RollContext {
  action: ActionDef;
  character?: CharacterView;
  difficulty?: number;
}
