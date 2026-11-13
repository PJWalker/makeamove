import { isNumber, isObject, isString } from "../../data/guards";
import { collection, lww, record, type Root } from "../../data/schema";

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
export const combatShape = {
  combat: record({
    /** 0 before the fight starts. */
    round: lww(isNumber).or(0),
    /** Whose turn: a combatant id. */
    turn: lww(isString),
  }),
  combatants: collection(lww(isObject<Combatant>), "combatant"),
};

export type CombatMaps = Root<typeof combatShape>;
