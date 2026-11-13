import { arrayOf, isObject, isString, oneOf } from "../../data/guards";
import { collection, lww, record, text } from "../../data/schema";
import { systemCharacterData } from "../../systems/schema";
import { TOKEN_STYLES } from "../../scene/types";
import type { Duration, ItemInstance, TemplateSettings } from "./types";

/*
 * A character, in the campaign root's `characters` (id -> character). The
 * core keeps what every system has; what a system adds is in `ext`, under
 * the system's id, in maps of its own so two players editing different
 * fields never overwrite each other.
 *
 * Effective values (armour, load, maximum HP) are worked out by the system
 * on read and never stored.
 *
 * A copy (a template's token, see characters/templates.ts) is a character
 * with `base` set to its template. It stores only what's been changed on it;
 * every field, and every key of every sub-map, it doesn't have comes from
 * the template, like a subclass. Conditions and inventory are taken whole:
 * the copy's own once it has any, else the template's.
 */

const isStrings = arrayOf(isString);

/** How one character sees another (relationships.ts). */
export interface RelationshipEntry {
  label: string;
  depth?: number;
}

export const characterEntry = record({
  name: lww(isString),
  owner: lww(isString),
  kind: lww(oneOf("pc", "npc")),
  folder: lww(isString),
  tokenStyle: lww(oneOf(...TOKEN_STYLES.map((s) => s.id))),
  tokenColour: lww(isString),
  template: lww(isObject<TemplateSettings>),
  /** The template this is a copy of. */
  base: lww(isString),
  /** Action ids learned beyond the system's. */
  learned: lww(isStrings),
  conditions: lww(isStrings),
  lockedConditions: lww(isStrings),
  /** Condition id -> how long it lasts in combat (combat/combat.ts). */
  durations: lww(isObject<Record<string, Duration>>),
  /** The action the character is concentrating on. */
  concentration: lww(isString),
  inventory: collection(lww(isObject<ItemInstance>), "item"),
  /** Other character id -> how this one sees them. */
  relationships: collection(lww(isObject<RelationshipEntry>), "relationship"),
  /** Rich-text fields by name: notes, bonds, an NPC's long fields (CharacterText.tsx). */
  texts: collection(text()),
  /** Each system's own data, by system id. */
  ext: collection(systemCharacterData),
});
