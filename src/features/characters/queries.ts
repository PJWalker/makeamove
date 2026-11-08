import type * as Y from "yjs";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import type { TokenStat } from "../../systems/types";
import type { CharacterView } from "./types";
import { canEditCharacter, characterView, derive, statBonus } from "./store";
import { systemOf } from "./system";

/*
 * Reading the campaign's characters.
 */

/** A copy's template's map, if it's a copy. */
export const baseOf = (campaign: Campaign, m: Y.Map<any> | undefined): Y.Map<any> | undefined => {
  const base = m?.get("base");
  return base ? campaign.characters.get(base) : undefined;
};

/**
 * Every character, by name. Copies (a template's tokens) are left out unless
 * asked for: they belong to their tokens, not the Characters list.
 */
export function listCharacters(campaign: Campaign, { copies = false } = {}): CharacterView[] {
  const system = systemOf(campaign);
  return [...campaign.characters.entries()]
    .filter(([, m]) => copies || !m.get("base"))
    .map(([id, m]) => characterView(id, m, system, baseOf(campaign, m)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What a linked token shows (HP bars), by character id, copies included.
 * Built from the characters as they are now; make a new one when they change.
 */
export function tokenStatsSource(campaign: Campaign) {
  const system = systemOf(campaign);
  const characters = new Map(listCharacters(campaign, { copies: true }).map((c) => [c.id, c]));
  const cache = new Map<string, TokenStat[]>();
  return (characterId: string): TokenStat[] => {
    const c = characters.get(characterId);
    if (!c) return [];
    let stats = cache.get(characterId);
    if (!stats) cache.set(characterId, (stats = system.tokenStats(c, derive(c, system))));
    return stats;
  };
}

export function getCharacter(
  campaign: Campaign,
  id: string | undefined,
): CharacterView | undefined {
  const m = id ? campaign.characters.get(id) : undefined;
  return m && id ? characterView(id, m, systemOf(campaign), baseOf(campaign, m)) : undefined;
}

/** The character this device is playing: their choice, else the only one they own. */
export function selectedCharacterId(campaign: Campaign): string | undefined {
  const chosen: string | undefined = campaign.members.get(device.value.id)?.get("character");
  if (chosen && campaign.characters.has(chosen)) return chosen;
  const mine = listCharacters(campaign).filter(
    (c) => c.kind === "pc" && c.owner === device.value.id,
  );
  return mine.length === 1 ? mine[0]!.id : undefined;
}

export function canEdit(campaign: Campaign, c: CharacterView) {
  return canEditCharacter(c, device.value.id, campaign.isGm());
}

/**
 * What each of the selected character's stats adds to a roll, by abbreviation,
 * for the dice tray's stat chips. None without a character, or in a system
 * whose stats aren't added to rolls.
 */
export function selectedStatBonuses(campaign: Campaign): { stat: string; value: number }[] {
  const system = systemOf(campaign);
  const c =
    system.statsAddToRolls === false
      ? undefined
      : getCharacter(campaign, selectedCharacterId(campaign));
  if (!c) return [];
  const d = derive(c, system);
  return system.stats.map((stat) => ({ stat: stat.abbr, value: statBonus(d, stat.id) }));
}
