import { isBoolean, isNumber, isString, objectOf, optional } from "../../lib/guards";
import { collection, lww, record  } from "../../data/schema";
import type {Root} from "../../data/schema";

/** Someone in the fight. */
export interface Combatant {
  name: string;
  /** The character the combatant is, if any. */
  characterId?: string;
  /** The token it stands for on a scene. */
  tokenId?: string;
  sceneId?: string;
  /** The initiative total; null until rolled or set. */
  init: number | null;
  /** Breaks ties: higher goes first (5.5e: the Dexterity modifier). */
  tie: number;
  /** Hidden from players until the GM reveals it. */
  hidden?: boolean;
}

/** The turn tracker's parts of the campaign root (combat.ts). */
const isCombatant = objectOf({
  name: isString,
  characterId: optional(isString),
  tokenId: optional(isString),
  sceneId: optional(isString),
  init: (value: unknown): value is number | null => value === null || isNumber(value),
  tie: isNumber,
  hidden: optional(isBoolean),
}) as (value: unknown) => value is Combatant;

export const combatShape = {
  combat: record({
    /** 0 before the fight starts. */
    round: lww(isNumber).or(0),
    /** Whose turn: a combatant id. */
    turn: lww(isString),
  }),
  combatants: collection(lww(isCombatant), "combatant"),
};

export type CombatMaps = Root<typeof combatShape>;
