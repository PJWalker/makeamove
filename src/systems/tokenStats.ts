import type { CharacterView } from "../features/characters/types";
import type { TokenStat } from "./types";

/** Bar colours for a creature's hit points: healthy, under half, under a quarter. */
export const HP_COLOURS = { healthy: "#4aa35a", hurt: "#d49a32", critical: "#d04a3a" } as const;

/** The colour of a hit point bar at this much of its maximum. */
export const hpColour = (hp: number, max: number): string =>
  hp <= max / 4 ? HP_COLOURS.critical : hp <= max / 2 ? HP_COLOURS.hurt : HP_COLOURS.healthy;

/** A token's hit point bar, from the character's `hp` resource. */
export function hpTokenStat(character: CharacterView, max: number): TokenStat {
  const hp = character.resources.hp ?? 0;
  return { id: "hp", label: "HP", value: hp, max, colour: hpColour(hp, max) };
}
