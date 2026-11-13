import { isNumber } from "../../data/guards";
import type { Campaign } from "../../campaign/campaign";
import { contentFromText } from "../../features/chat/content";
import { postText } from "../../features/chat/send";
import {
  bumpData,
  bumpResource,
  clearCondition,
  getCharacter,
  listCharacters,
  makeMove,
  removeItem,
  setConditionState,
  setData,
  setScore,
  setResource,
  startMove,
  systemOf,
  updateItem,
} from "../../features/characters/api";
import {
  relationshipsOf,
  setRelationship,
  setRelationshipDepth,
} from "../../features/characters/relationships";
import { actionsFor, derive } from "../../features/characters/store";
import type { DataValue } from "../../data/types";
import { commaListOf, formatCommaList } from "../../lib/list";
import { DW2_RELATIONSHIP_DEPTH } from "./bondStore";
import { revealedStruggleData, STRUGGLES } from "./struggles";
import {
  addTreasureBoxes,
  DW2_SERVICES,
  wealthTierForBoxes,
  WEALTH_TIERS,
  type ServiceRank,
} from "./wealth";

/*
 * Dungeon World 2's campaign actions: the moves and Downtime activities
 * that change several characters or the campaign at once, called by its
 * move forms, sheet and inventory extension.
 */

/** Tags that make an item a weapon, which Snap the Blade can break. */
export const WEAPON_TAGS = new Set([
  "close",
  "hand",
  "near",
  "far",
  "precise",
  "thrown",
  "piercing",
]);

/** Reveal a DW2 Struggle on a PC with none revealed, as when they confess one while they Make Camp. */
export function revealStruggle(campaign: Campaign, id: string, struggleId: string): boolean {
  const character = getCharacter(campaign, id);
  const struggle = STRUGGLES.find((entry) => entry.id === struggleId);
  if (character?.kind !== "pc" || character.data.struggleRevealed === true || !struggle)
    return false;
  campaign.doc.transact(() => {
    for (const [field, value] of Object.entries(revealedStruggleData(struggle)))
      setData(campaign, id, field, value);
  });
  return true;
}

/** Resolve the active DW2 Struggle, level up without clearing XP, and remove its advancement marker. */
export function resolveStruggle(campaign: Campaign, id: string): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, id);
  if (character?.kind !== "pc" || character.data.struggleRevealed !== true) return false;

  const level = Number(character.data.level ?? 1) + 1;
  const previousMaxHp = derive(character, system).values.maxHp ?? 0;
  const struggleId = String(character.data.struggleId ?? "");
  const revealed = `reveal-struggle-${struggleId}`;
  const advancements = commaListOf(character.data.advancements).filter(
    (entry) => entry !== revealed,
  );

  campaign.doc.transact(() => {
    setData(campaign, id, "level", level);
    setData(campaign, id, "struggleRevealed", false);
    setData(campaign, id, "struggleId", "");
    setData(campaign, id, "struggleName", "");
    setData(campaign, id, "struggleTrack", "");
    setData(campaign, id, "struggleProgress", 0);
    setData(campaign, id, "struggleMax", 0);
    setData(campaign, id, "advancements", formatCommaList(advancements));
  });

  const resolved = getCharacter(campaign, id)!;
  const maxHp = derive(resolved, system).values.maxHp ?? 0;
  const hpGain = maxHp - previousMaxHp;
  if (hpGain > 0) bumpResource(campaign, id, "hp", hpGain, maxHp);
  return true;
}

/** Apply a DW2 Class Change using a newly assigned stat line and reallocated advancements. */
export function applyClassChange(
  campaign: Campaign,
  id: string,
  classId: string,
  scores: Record<string, number>,
  reallocatedData: Record<string, DataValue>,
): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, id);
  const classChoice = system.creation?.choices.find((choice) => choice.id === "class");
  if (
    character?.kind !== "pc" ||
    character.data.classId === classId ||
    !classChoice?.options.some((option) => option.id === classId)
  )
    return false;

  const hpResource = system.resources.find((resource) => resource.id === "hp");
  const oldMaxHp = hpResource ? (derive(character, system).values[hpResource.max] ?? 0) : 0;
  const oldHp = hpResource ? (character.resources[hpResource.id] ?? 0) : 0;
  campaign.doc.transact(() => {
    setData(campaign, id, "classId", classId);
    for (const [field, value] of Object.entries(reallocatedData))
      if (field !== "classId") setData(campaign, id, field, value);
    for (const stat of system.stats)
      if (scores[stat.id] !== undefined) setScore(campaign, id, stat.id, scores[stat.id]!);
  });

  const changed = getCharacter(campaign, id);
  const newMaxHp =
    changed && hpResource ? (derive(changed, system).values[hpResource.max] ?? 0) : 0;
  if (changed && hpResource) {
    setResource(
      campaign,
      id,
      hpResource.id,
      Math.max(1, Math.min(newMaxHp, oldHp + newMaxHp - oldMaxHp)),
    );
  }
  return true;
}

/** Resolve the DW2 group questions and award their XP to every PC. */
export async function endDungeonWorld2Session(
  campaign: Campaign,
  actorId: string,
  answers: [boolean, boolean, boolean],
): Promise<boolean> {
  const system = systemOf(campaign);
  const move = system.actions.find((action) => action.id === "end-the-session");
  const actor = getCharacter(campaign, actorId);
  if (!move || actor?.kind !== "pc") return false;

  const card = await makeMove(campaign, actorId, move);
  if (!card) return false;
  const xp = answers.filter(Boolean).length;
  if (xp > 0) {
    for (const character of listCharacters(campaign)) {
      if (character.kind === "pc") bumpData(campaign, character.id, "xp", xp);
    }
  }
  return true;
}

/** Resolve the DW2 party-wide Make Camp benefits after each PC picks a Condition to clear. */
export async function makeDungeonWorld2Camp(
  campaign: Campaign,
  actorId: string,
  clearByCharacter: Record<string, string>,
  repairByCharacter: Record<string, string> = {},
): Promise<boolean> {
  const system = systemOf(campaign);
  const move = system.actions.find((action) => action.id === "make-camp");
  const actor = getCharacter(campaign, actorId);
  if (!move || actor?.kind !== "pc") return false;

  const card = await makeMove(campaign, actorId, move);
  if (!card) return false;
  for (const character of listCharacters(campaign)) {
    if (character.kind !== "pc") continue;
    const maxHp = derive(character, system).values.maxHp ?? 0;
    bumpResource(campaign, character.id, "hp", maxHp - (character.resources.hp ?? 0), maxHp);
    for (const item of character.inventory)
      if (item.resetUsesAtCamp && item.uses !== undefined && item.usesLeft !== item.uses)
        updateItem(campaign, character.id, item.id, { usesLeft: item.uses });
    const condition = clearByCharacter[character.id];
    if (
      condition &&
      character.conditions.includes(condition) &&
      !character.lockedConditions?.includes(condition)
    )
      clearCondition(campaign, character.id, condition);
    const repairItemId = repairByCharacter[character.id];
    if (repairItemId) {
      const current = getCharacter(campaign, character.id)!;
      const hasSnapTheBlade = actionsFor(current, system, derive(current, system)).some(
        (action) => action.name === "Snap the Blade",
      );
      const item = current.inventory.find((entry) => entry.id === repairItemId);
      if (hasSnapTheBlade && item?.broken && !item.tags.includes("magic"))
        updateItem(campaign, character.id, repairItemId, { broken: false });
    }
  }
  return true;
}

export type ComfortBenefit =
  | { kind: "clear-comforted"; condition: string }
  | { kind: "gain-depth" }
  | { kind: "clear-supporter"; condition: string };

/** Apply one chosen benefit for each affirmative Comfort or Support answer. */
export async function resolveComfortOrSupport(
  campaign: Campaign,
  supporterId: string,
  comfortedId: string,
  benefits: ComfortBenefit[],
): Promise<boolean> {
  const system = systemOf(campaign);
  const move = system.actions.find((action) => action.id === "comfort-or-support");
  const supporter = getCharacter(campaign, supporterId);
  const comforted = getCharacter(campaign, comfortedId);
  if (!move || supporter?.kind !== "pc" || comforted?.kind !== "pc" || supporterId === comfortedId)
    return false;

  const card = await makeMove(campaign, supporterId, move);
  if (!card) return false;
  for (const benefit of benefits) {
    if (benefit.kind === "gain-depth") {
      const relationship = relationshipsOf(campaign.characters, comfortedId).find(
        (entry) => entry.to === supporterId,
      );
      if (!relationship) setRelationship(campaign.characters, comfortedId, supporterId, "");
      setRelationshipDepth(
        campaign.characters,
        comfortedId,
        supporterId,
        (relationship?.depth ?? 0) + 1,
        DW2_RELATIONSHIP_DEPTH.max,
      );
    } else {
      const characterId = benefit.kind === "clear-comforted" ? comfortedId : supporterId;
      const character = getCharacter(campaign, characterId);
      if (
        character?.conditions.includes(benefit.condition) &&
        !character.lockedConditions?.includes(benefit.condition)
      )
        clearCondition(campaign, characterId, benefit.condition);
    }
  }
  return true;
}

export type JourneyPace = "quick" | "regular" | "slow";

/** Mark the pace's Condition costs and open the leader's Journey roll. */
export function prepareDungeonWorld2Journey(
  campaign: Campaign,
  leaderId: string,
  pace: JourneyPace,
  conditionByCharacter: Record<string, string>,
): boolean {
  const system = systemOf(campaign);
  const move = system.actions.find((action) => action.id === "perilous-journey");
  const leader = getCharacter(campaign, leaderId);
  if (!move || leader?.kind !== "pc") return false;
  const party = listCharacters(campaign).filter((character) => character.kind === "pc");
  const affected = pace === "quick" ? party : pace === "regular" ? [leader] : [];
  for (const character of affected) {
    const condition = conditionByCharacter[character.id];
    if (
      !condition ||
      !system.conditions.some((entry) => entry.id === condition) ||
      character.conditions.includes(condition)
    )
      return false;
  }
  for (const character of affected)
    setConditionState(campaign, character.id, conditionByCharacter[character.id]!, "marked");
  const extra = pace === "quick" ? -1 : pace === "regular" ? 1 : 2;
  startMove(campaign, leaderId, move, undefined, { extra });
  return true;
}

const DW2_DOWNTIME_KEY = "downtime";
/** Each PC's id -> the Downtime epoch they last trained in. */
const trainedIn = (campaign: Campaign) => campaign.systemData.store("downtime-trained", isNumber);

export function dungeonWorld2DowntimeEpoch(campaign: Campaign): number {
  return Number(campaign.systemData.value(DW2_DOWNTIME_KEY) ?? 0);
}

/** Start a fresh Downtime period so each PC can Train once during it. */
export function beginDungeonWorld2Downtime(campaign: Campaign): number {
  const epoch = dungeonWorld2DowntimeEpoch(campaign) + 1;
  campaign.systemData.setValue(DW2_DOWNTIME_KEY, epoch);
  return epoch;
}

export function trainedDuringDungeonWorld2Downtime(
  campaign: Campaign,
  characterId: string,
): boolean {
  const epoch = dungeonWorld2DowntimeEpoch(campaign);
  return epoch > 0 && trainedIn(campaign).get(characterId) === epoch;
}

function spendTreasure(campaign: Campaign, characterId: string): boolean {
  const character = getCharacter(campaign, characterId);
  const boxes = Number(character?.data.treasureBoxes ?? 0);
  if (character?.kind !== "pc" || boxes < 1) return false;
  setData(campaign, characterId, "treasureBoxes", boxes - 1);
  return true;
}

export function carouseDungeonWorld2(
  campaign: Campaign,
  characterId: string,
  benefit: "clear-locked" | "gain-depth",
  targetId?: string,
  condition?: string,
): boolean {
  const character = getCharacter(campaign, characterId);
  const target = targetId ? getCharacter(campaign, targetId) : undefined;
  if (character?.kind !== "pc" || dungeonWorld2DowntimeEpoch(campaign) === 0) return false;
  if (benefit === "clear-locked") {
    if (!condition || !character.lockedConditions?.includes(condition)) return false;
  } else if (
    target?.kind !== "pc" ||
    target.id === characterId ||
    (relationshipsOf(campaign.characters, characterId).find((entry) => entry.to === targetId)
      ?.depth ?? 0) >= 3
  )
    return false;

  return campaign.doc.transact(() => {
    if (!spendTreasure(campaign, characterId)) return false;
    if (benefit === "clear-locked") clearCondition(campaign, characterId, condition!);
    else {
      const relationship = relationshipsOf(campaign.characters, characterId).find(
        (entry) => entry.to === targetId,
      );
      if (!relationship) setRelationship(campaign.characters, characterId, targetId!, "");
      setRelationshipDepth(
        campaign.characters,
        characterId,
        targetId!,
        (relationship?.depth ?? 0) + 1,
        DW2_RELATIONSHIP_DEPTH.max,
      );
    }
    return true;
  });
}

export function resupplyDungeonWorld2(campaign: Campaign, characterId: string): boolean {
  const character = getCharacter(campaign, characterId);
  if (
    character?.kind !== "pc" ||
    dungeonWorld2DowntimeEpoch(campaign) === 0 ||
    Number(character.data.treasureBoxes ?? 0) < 1
  )
    return false;
  const replenishable = character.inventory.filter(
    (item) =>
      item.uses !== undefined && !item.tags.includes("magic") && item.usesLeft !== item.uses,
  );
  if (!replenishable.length) return false;
  campaign.doc.transact(() => {
    if (!spendTreasure(campaign, characterId)) return;
    for (const item of replenishable)
      if (item.uses !== undefined)
        updateItem(campaign, characterId, item.id, { usesLeft: item.uses });
  });
  return true;
}

export async function shopDungeonWorld2Service(
  campaign: Campaign,
  characterId: string,
  serviceId: string,
  rank: ServiceRank,
): Promise<boolean> {
  const character = getCharacter(campaign, characterId);
  const service = DW2_SERVICES.find((entry) => entry.id === serviceId);
  const tier = WEALTH_TIERS.find((entry) => entry.rank === rank);
  const example = service?.examples[rank];
  if (
    character?.kind !== "pc" ||
    dungeonWorld2DowntimeEpoch(campaign) === 0 ||
    !service ||
    !tier ||
    !example ||
    Number(character.data.treasureBoxes ?? 0) < 1
  )
    return false;

  setData(campaign, characterId, "treasureBoxes", Number(character.data.treasureBoxes ?? 0) - 1);
  await postText(
    campaign,
    contentFromText(
      `${character.name} spends 1 Treasure on ${service.name} ${tier.name} (${rank}): ${example}.`,
    ),
  );
  return true;
}

export function saleValueDungeonWorld2Item(
  campaign: Campaign,
  characterId: string,
  itemId: string,
): number | null {
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition =
    item && systemOf(campaign).items.find((entry) => entry.id === (item.defId ?? item.id));
  if (
    dungeonWorld2DowntimeEpoch(campaign) === 0 ||
    character?.kind !== "pc" ||
    definition?.wealthCost === undefined
  )
    return null;
  return definition.wealthCost.rank >
    wealthTierForBoxes(Number(character.data.treasureBoxes ?? 0)).rank
    ? 1
    : 0;
}

/** Sell priced gear during Downtime using the beta's Wealth-based resale rule. */
export function sellDungeonWorld2Item(
  campaign: Campaign,
  characterId: string,
  itemId: string,
): boolean {
  const value = saleValueDungeonWorld2Item(campaign, characterId, itemId);
  if (value === null) return false;
  const character = getCharacter(campaign, characterId)!;
  const boxes = Number(character.data.treasureBoxes ?? 0);
  removeItem(campaign, characterId, itemId);
  if (value > 0) setData(campaign, characterId, "treasureBoxes", addTreasureBoxes(boxes, value));
  return true;
}

export function trainDungeonWorld2(campaign: Campaign, characterId: string): boolean {
  const character = getCharacter(campaign, characterId);
  const epoch = dungeonWorld2DowntimeEpoch(campaign);
  if (
    character?.kind !== "pc" ||
    epoch === 0 ||
    trainedDuringDungeonWorld2Downtime(campaign, characterId) ||
    Number(character.data.treasureBoxes ?? 0) < 1
  )
    return false;

  return campaign.doc.transact(() => {
    if (!spendTreasure(campaign, characterId)) return false;
    bumpData(campaign, characterId, "xp", 1);
    trainedIn(campaign).set(characterId, epoch);
    return true;
  });
}

export function breakDungeonWorld2Weapon(
  campaign: Campaign,
  characterId: string,
  itemId: string,
): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  if (
    character?.kind !== "pc" ||
    !item?.equippable ||
    item.broken ||
    item.tags.includes("magic") ||
    !item.tags.some((tag) => WEAPON_TAGS.has(tag)) ||
    !actionsFor(character, system, derive(character, system)).some(
      (action) => action.name === "Snap the Blade",
    )
  )
    return false;
  updateItem(campaign, characterId, itemId, { broken: true });
  return true;
}

export type DungeonWorld2ItemUse =
  | { kind: "heal-half-lost" }
  | { kind: "clear-locked"; condition: string }
  | { kind: "drain" }
  | { kind: "mark-condition"; condition: string };

/** Use a charged item and apply the deterministic DW2 effects supported by the sheet. */
export function consumeDungeonWorld2Item(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  choice?: DungeonWorld2ItemUse,
): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition = item && system.items.find((entry) => entry.id === (item.defId ?? item.id));
  if (!character || !item || item.uses === undefined || (item.usesLeft ?? 0) <= 0) return false;
  const resolvedChoice =
    definition?.itemUse === "healing-potion"
      ? (choice ?? { kind: "heal-half-lost" as const })
      : definition?.itemUse === "magic-wand"
        ? (choice ?? { kind: "drain" as const })
        : choice;
  if (definition?.itemUse === "healing-potion") {
    if (!resolvedChoice) return false;
    if (
      resolvedChoice.kind === "clear-locked" &&
      !character.lockedConditions?.includes(resolvedChoice.condition)
    )
      return false;
    if (
      resolvedChoice.kind === "heal-half-lost" &&
      (derive(character, system).values.maxHp ?? 0) <= (character.resources.hp ?? 0)
    )
      return false;
  }
  if (definition?.itemUse === "magic-wand") {
    if (!resolvedChoice) return false;
    if (
      resolvedChoice.kind === "mark-condition" &&
      (!system.conditions.some((entry) => entry.id === resolvedChoice.condition) ||
        character.lockedConditions?.includes(resolvedChoice.condition))
    )
      return false;
  }

  const wandMarksCondition =
    definition?.itemUse === "magic-wand" && resolvedChoice?.kind === "mark-condition";
  if (!wandMarksCondition)
    updateItem(campaign, characterId, itemId, { usesLeft: Math.max(0, (item.usesLeft ?? 0) - 1) });
  if (definition?.itemUse === "healing-potion") {
    if (resolvedChoice?.kind === "clear-locked")
      clearCondition(campaign, characterId, resolvedChoice.condition);
    else if (resolvedChoice?.kind === "heal-half-lost") {
      const maxHp = derive(character, system).values.maxHp ?? 0;
      const lostHp = Math.max(0, maxHp - (character.resources.hp ?? 0));
      bumpResource(campaign, characterId, "hp", Math.floor(lostHp / 2), maxHp);
    }
  } else if (definition?.itemUse === "hearty-feast") {
    for (const ally of listCharacters(campaign)) {
      if (ally.kind !== "pc") continue;
      const maxHp = derive(ally, system).values.maxHp ?? 0;
      bumpResource(campaign, ally.id, "hp", Math.floor(maxHp / 2), maxHp);
    }
  } else if (definition?.itemUse === "magic-wand" && resolvedChoice?.kind === "mark-condition") {
    const state = character.conditions.includes(resolvedChoice.condition) ? "locked" : "marked";
    setConditionState(campaign, characterId, resolvedChoice.condition, state);
  }
  return true;
}
