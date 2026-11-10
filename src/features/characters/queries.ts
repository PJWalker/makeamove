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
export const baseOf = (
  campaign: Campaign,
  m: Y.Map<unknown> | undefined,
): Y.Map<unknown> | undefined => {
  const base = m?.get("base") as string | undefined;
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

/** A member's character id under `key`, if that character still exists. */
function memberCharacter(campaign: Campaign, memberId: string, key: "character" | "playing") {
  const id = campaign.members.get(memberId)?.get(key) as string | undefined;
  return id && campaign.characters.has(id) ? id : undefined;
}

/** The character whose sheet this device has open in the Characters panel. */
export const viewedCharacterId = (campaign: Campaign) =>
  memberCharacter(campaign, device.value.id, "character");

/** The player character a member has claimed; this device's by default. */
export const playedCharacterId = (campaign: Campaign, memberId = device.value.id) =>
  memberCharacter(campaign, memberId, "playing");

/** The member playing a character, if anyone has claimed it. */
export function playerOf(campaign: Campaign, characterId: string): string | undefined {
  for (const [memberId, m] of campaign.members.entries())
    if (m.get("playing") === characterId) return memberId;
  return undefined;
}

/** Whether this device can claim a character as its player character. */
export function canClaim(campaign: Campaign, c: CharacterView) {
  const player = playerOf(campaign, c.id);
  return (
    c.kind === "pc" &&
    !c.base &&
    !c.template &&
    campaign.members.get(device.value.id)?.get("role") !== "observer" &&
    (player === undefined || player === device.value.id)
  );
}

/**
 * Who actions are made as: the claimed player character, else the character
 * whose sheet is open (how a GM acts as an NPC).
 */
export const actingCharacterId = (campaign: Campaign) =>
  playedCharacterId(campaign) ?? viewedCharacterId(campaign);

export function canEdit(campaign: Campaign, c: CharacterView) {
  return canEditCharacter(c, device.value.id, campaign.isGm());
}

/**
 * What each of the selected character's stats adds to a roll, by abbreviation,
 * for the dice tray's stat chips. None without a character, or in a system
 * whose stats aren't added to rolls.
 */
export function actingStatBonuses(campaign: Campaign): { stat: string; value: number }[] {
  const system = systemOf(campaign);
  const c =
    system.statsAddToRolls === false
      ? undefined
      : getCharacter(campaign, actingCharacterId(campaign));
  if (!c) return [];
  const d = derive(c, system);
  return system.stats.map((stat) => ({ stat: stat.abbr, value: statBonus(d, stat.id) }));
}
