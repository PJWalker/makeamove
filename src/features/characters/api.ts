import { batch, signal } from "@preact/signals-react";
import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { newId } from "../../lib/ids";
import { formatCommaList, parseCommaList } from "../../lib/list";

import { postRoll, myName, postText } from "../chat/send";
import { contentFromText } from "../chat/content";
import type { MoveSuggestion, MoveTarget } from "../chat/types";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import { getSystem } from "../../systems";
import type { ActionDef, GameSystem, ItemDef, ResetEvent, TokenStat } from "../../systems/types";
import type { DataValue } from "../../core/types";
import { listHomebrew, withHomebrew } from "../homebrew/homebrew";
import type { CharacterView, ItemInstance, TemplateSettings } from "./types";
import { asksFirst, performMove, type MoveChoice } from "./moves";
import { claimSessionMove, sessionMoveUsed } from "./sessionMoves";
import { relationshipsOf, setRelationship, setRelationshipDepth } from "./relationships";
import {
  addTreasureBoxes,
  DW2_SERVICES,
  wealthTierForBoxes,
  WEALTH_TIERS,
  type ServiceRank,
} from "../../systems/dungeon-world-2/wealth";
import {
  characterView,
  derive,
  actionsFor,
  canEditCharacter,
  createCharacter,
  instanceOf,
} from "./store";

/** The campaign's system as published, without the table's homebrew: for the Libraries. */
export const baseSystemOf = (campaign: Campaign) => getSystem(campaign.meta.get("systemId"));

/** The merged system, rebuilt only when the system or homebrew changes. */
const merged = new WeakMap<Campaign, { base: GameSystem; version: number; system: GameSystem }>();
const versions = new WeakMap<Campaign, number>();

/** Count homebrew changes, so the merged system knows when to rebuild. */
function homebrewVersion(campaign: Campaign): number {
  let v = versions.get(campaign);
  if (v === undefined) {
    versions.set(campaign, (v = 0));
    campaign.homebrew.observe(() => versions.set(campaign, (versions.get(campaign) ?? 0) + 1));
  }
  return v;
}

/** The campaign's system, with the table's homebrew gear and moves. */
export function systemOf(campaign: Campaign): GameSystem {
  const base = baseSystemOf(campaign);
  const version = homebrewVersion(campaign);
  const known = merged.get(campaign);
  if (known && known.base === base && known.version === version) return known.system;
  const system = withHomebrew(base, listHomebrew(campaign.homebrew));
  merged.set(campaign, { base, version, system });
  return system;
}

/** A copy's template's map, if it's a copy. */
const baseOf = (campaign: Campaign, m: Y.Map<any> | undefined): Y.Map<any> | undefined => {
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

/**
 * A new copy of a template, for one of its tokens: it has only a name, and
 * takes everything else from the template until it's changed on the copy.
 */
export function createCopy(campaign: Campaign, templateId: string, name: string): string {
  const id = newId();
  const m = new Y.Map<any>();
  campaign.doc.transact(() => {
    campaign.characters.set(id, m);
    m.set("base", templateId);
    m.set("name", name);
  });
  return id;
}

/** Undo everything changed on a copy but its name, so it's the template again. */
export function resetCopy(campaign: Campaign, id: string) {
  const m = campaign.characters.get(id);
  if (!m?.get("base")) return;
  campaign.doc.transact(() => {
    for (const key of [...m.keys()]) if (key !== "base" && key !== "name") m.delete(key);
  });
}

/** Make a character a template (its tokens keep their own state), or an individual again with null. */
export function setTemplate(campaign: Campaign, id: string, settings: TemplateSettings | null) {
  const m = campaign.characters.get(id);
  if (!m) return;
  if (settings) m.set("template", settings);
  else m.delete("template");
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

export function selectCharacter(campaign: Campaign, id: string | undefined) {
  const m = campaign.members.get(device.value.id);
  if (!m) return;
  if (id) m.set("character", id);
  else m.delete("character");
}

/** A new player character, with the scores and data the guided creation flow worked out, if any. */
export function newCharacter(
  campaign: Campaign,
  name: string,
  classId: string,
  made?: { scores: Record<string, number>; data: Record<string, DataValue> },
) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || "Unnamed",
    owner: device.value.id,
    ...(made ? { scores: made.scores } : {}),
    data: { classId, ...made?.data },
  });
  selectCharacter(campaign, id);
  return id;
}

/** A non-player character, with the folder it starts in. */
export function newNpc(campaign: Campaign, name: string, folder?: string) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || "Unnamed NPC",
    owner: device.value.id,
    kind: "npc",
    ...(folder ? { folder } : {}),
  });
  selectCharacter(campaign, id);
  return id;
}

/** Copy a system monster into a new NPC character. */
export function newNpcFromMonster(campaign: Campaign, monsterId: string) {
  const system = systemOf(campaign);
  const monster = system.monsters?.find((entry) => entry.id === monsterId);
  if (!monster) return undefined;
  const id = newNpc(campaign, monster.name);
  const character = campaign.characters.get(id)!;
  if (monster.scores) {
    const scores = character.get("scores") as Y.Map<number>;
    for (const [stat, value] of Object.entries(monster.scores))
      if (system.stats.some((entry) => entry.id === stat)) scores.set(stat, value);
  }
  const hp = system.resources.find((resource) => resource.id === "hp");
  if (hp) (character.get("resources") as Y.Map<number>).set(hp.id, monster.hp);
  for (const [field, value] of Object.entries(monster.fields))
    if (system.npcFields.some((entry) => entry.id === field))
      setNpcField(campaign, id, field, value);
  if (monster.size && system.npcFields.some((field) => field.id === "size"))
    setNpcField(campaign, id, "size", monster.size);
  return id;
}

/* Folders */

export interface FolderView {
  id: string;
  name: string;
}

export function listFolders(campaign: Campaign): FolderView[] {
  return [...campaign.characterFolders.entries()]
    .map(([id, f]) => ({ id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createFolder(campaign: Campaign, name: string) {
  const id = newId();
  campaign.characterFolders.set(id, { name: name.trim() || "New folder" });
  return id;
}

export function renameFolder(campaign: Campaign, id: string, name: string) {
  if (campaign.characterFolders.has(id) && name.trim())
    campaign.characterFolders.set(id, { name: name.trim() });
}

/** Deleting a folder files its characters back at the top. */
export function deleteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.characters.values()) if (m.get("folder") === id) m.delete("folder");
    campaign.characterFolders.delete(id);
  });
}

/** Delete a character (and a template's copies), and stop anyone playing it from pointing at it. */
export function deleteCharacter(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.members.values()) if (m.get("character") === id) m.delete("character");
    for (const [copy, m] of [...campaign.characters.entries()])
      if (m.get("base") === id) campaign.characters.delete(copy);
    campaign.characters.delete(id);
  });
}

export function moveToFolder(
  campaign: Campaign,
  characterId: string,
  folderId: string | undefined,
) {
  const m = campaign.characters.get(characterId);
  if (!m) return;
  if (folderId) m.set("folder", folderId);
  else m.delete("folder");
}

export function canEdit(campaign: Campaign, c: CharacterView) {
  return canEditCharacter(c, device.value.id, campaign.isGm());
}

/** Set one of the core fields (name, level, notes, portrait…). */
export function setField(campaign: Campaign, id: string, key: string, value: unknown) {
  const m = campaign.characters.get(id);
  if (value === undefined) m?.delete(key);
  else m?.set(key, value);
}

/** A sub-map value as the character has it: its own, or for a copy, its template's. */
function current(campaign: Campaign, id: string, key: string, field: string): unknown {
  const m = campaign.characters.get(id);
  const own = m?.get(key) as Y.Map<any> | undefined;
  if (own?.has(field)) return own.get(field);
  return (baseOf(campaign, m)?.get(key) as Y.Map<any> | undefined)?.get(field);
}

/** One of the character's sub-maps (data, scores, resources…), made if it's missing. A copy's writes land here, over its template. */
function part(
  campaign: Campaign,
  id: string,
  key: "data" | "scores" | "resources" | "modifiers" | "fields",
): Y.Map<any> | undefined {
  const m = campaign.characters.get(id);
  if (!m) return undefined;
  let map = m.get(key) as Y.Map<any> | undefined;
  if (!(map instanceof Y.Map)) {
    map = new Y.Map();
    m.set(key, map);
  }
  return map;
}

/** Set one of the system's own fields. */
export function setData(campaign: Campaign, id: string, key: string, value: DataValue) {
  part(campaign, id, "data")?.set(key, value);
}

/** Add to one of the system's numeric fields, never below zero. */
export function bumpData(campaign: Campaign, id: string, key: string, by: number, max?: number) {
  const data = part(campaign, id, "data");
  if (!data) return;
  const next = Math.max(0, Number(current(campaign, id, "data", key) ?? 0) + by);
  data.set(key, max === undefined ? next : Math.min(next, max));
}

/** Resolve the active DW2 Struggle, level up without clearing XP, and remove its advancement marker. */
export function resolveStruggle(campaign: Campaign, id: string): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, id);
  if (
    system.id !== "dungeon-world-2" ||
    character?.kind !== "pc" ||
    character.data.struggleRevealed !== true
  )
    return false;

  const level = Number(character.data.level ?? 1) + 1;
  const previousMaxHp = derive(character, system).values.maxHp ?? 0;
  const struggleId = String(character.data.struggleId ?? "");
  const revealed = `reveal-struggle-${struggleId}`;
  const advancements = parseCommaList(String(character.data.advancements ?? "")).filter(
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
    system.id !== "dungeon-world-2" ||
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
    const resources = campaign.characters.get(id)?.get("resources") as Y.Map<number> | undefined;
    resources?.set(hpResource.id, Math.max(1, Math.min(newMaxHp, oldHp + newMaxHp - oldMaxHp)));
  }
  return true;
}

export function setScore(campaign: Campaign, id: string, stat: string, score: number) {
  part(campaign, id, "scores")?.set(stat, score);
}

/** Add to a resource (HP, spell slots), between zero and its maximum. */
export function bumpResource(
  campaign: Campaign,
  id: string,
  resource: string,
  by: number,
  max?: number,
) {
  const r = part(campaign, id, "resources");
  if (!r) return;
  const next = Math.max(0, Number(current(campaign, id, "resources", resource) ?? 0) + by);
  r.set(resource, max === undefined ? next : Math.min(next, max));
}

/** Refill every resource that this rest resets (see ResourceDef.resets) to its maximum. */
export function rest(campaign: Campaign, id: string, event: ResetEvent) {
  const system = systemOf(campaign);
  const c = getCharacter(campaign, id);
  const r = part(campaign, id, "resources");
  if (!c || !r) return;
  const d = derive(c, system);
  campaign.doc.transact(() => {
    for (const def of system.resources)
      if (def.resets?.includes(event)) r.set(def.id, d.values[def.max] ?? 0);
  });
}

/** Set a standing roll modifier (Dungeon World's forward, ongoing). */
export function setModifier(campaign: Campaign, id: string, modifier: string, value: number) {
  part(campaign, id, "modifiers")?.set(modifier, value);
}

/** Give or take away a condition. */
export function toggleCondition(campaign: Campaign, id: string, condition: string) {
  const m = campaign.characters.get(id);
  if (!m) return;
  const now: string[] =
    (m.has("conditions") ? m.get("conditions") : baseOf(campaign, m)?.get("conditions")) ?? [];
  m.set(
    "conditions",
    now.includes(condition) ? now.filter((x) => x !== condition) : [...now, condition],
  );
}

export type ConditionState = "clear" | "marked" | "locked";

/** Set a condition's clear, marked, or protected state. */
export function setConditionState(
  campaign: Campaign,
  id: string,
  condition: string,
  state: ConditionState,
) {
  const m = campaign.characters.get(id);
  if (!m) return;
  const inherited = baseOf(campaign, m);
  const conditions = new Set<string>(
    (m.has("conditions") ? m.get("conditions") : inherited?.get("conditions")) ?? [],
  );
  const locked = new Set<string>(
    (m.has("lockedConditions") ? m.get("lockedConditions") : inherited?.get("lockedConditions")) ??
      [],
  );
  if (state === "clear") conditions.delete(condition);
  else conditions.add(condition);
  if (state === "locked") locked.add(condition);
  else locked.delete(condition);
  m.set("conditions", [...conditions]);
  m.set("lockedConditions", [...locked]);
  if (state === "clear") {
    const durations = { ...(m.get("durations") ?? {}) };
    delete durations[condition];
    m.set("durations", durations);
  }
}

/** Clear a condition and its duration. */
export function clearCondition(campaign: Campaign, id: string, condition: string) {
  setConditionState(campaign, id, condition, "clear");
}

/** Teach a character an action (a move dropped on them), or with `known` false, let them forget it. */
export function setLearned(campaign: Campaign, id: string, actionId: string, known: boolean) {
  const m = campaign.characters.get(id);
  if (!m) return;
  const now: string[] =
    (m.has("learned") ? m.get("learned") : baseOf(campaign, m)?.get("learned")) ?? [];
  if (known === now.includes(actionId)) return;
  m.set("learned", known ? [...now, actionId] : now.filter((x) => x !== actionId));
}

/** Set one of an NPC's system-defined fields. */
export function setNpcField(campaign: Campaign, id: string, field: string, value: string | number) {
  part(campaign, id, "fields")?.set(field, value);
}

/** Replace a character's active options in one system-defined loadout. */
export function setLoadout(
  campaign: Campaign,
  characterId: string,
  loadoutId: string,
  requested: string[],
  free = false,
) {
  const system = systemOf(campaign);
  const definition = system.loadouts?.find((entry) => entry.id === loadoutId);
  const character = getCharacter(campaign, characterId);
  if (!definition || !character) return;
  const derived = derive(character, system);
  const maximum =
    typeof definition.max === "number" ? definition.max : derived.values[definition.max];
  if (maximum === undefined || !Number.isFinite(maximum) || maximum < 0) return;
  const owned = new Set(
    definition.available?.(character, derived) ??
      String(character.data[definition.ownedField] ?? "")
        .split(",")
        .filter(Boolean),
  );
  const valid = new Set(definition.options.map((option) => option.id));
  const next = [...new Set(requested)]
    .filter((option) => valid.has(option) && owned.has(option))
    .slice(0, maximum);
  const previous = String(character.data[definition.activeField] ?? "")
    .split(",")
    .filter(Boolean);
  const costs = new Map<string, number>();
  if (!free) {
    for (const option of next)
      if (!previous.includes(option)) {
        const cost = definition.costs?.[option];
        if (cost) costs.set(cost.resource, (costs.get(cost.resource) ?? 0) + cost.by);
      }
  }
  for (const [resource, by] of costs) {
    const currentValue = character.resources[resource] ?? 0;
    const max = derived.values[system.resources.find((entry) => entry.id === resource)?.max ?? ""];
    if (max === undefined || currentValue + by < 0 || currentValue + by > max) return;
  }
  campaign.doc.transact(() => {
    setData(campaign, characterId, definition.activeField, next.join(","));
    for (const [resource, by] of costs)
      bumpResource(
        campaign,
        characterId,
        resource,
        by,
        derived.values[system.resources.find((entry) => entry.id === resource)?.max ?? ""],
      );
  });
}

/** Set by Characters/Palette to ask for a stat or bond before a move rolls. */
export const moveRequest = signal<{
  moveId: string;
  characterId: string;
  targets?: MoveTarget[];
  choice?: Pick<MoveChoice, "extra">;
} | null>(null);

/** A move waiting for its targets to be picked on the scene (see table/MovePrompt.tsx). */
export const targetRequest = signal<{
  moveId: string;
  characterId: string;
} | null>(null);

/** Make a move as a character: ask for input if it needs any, otherwise roll and post. */
/**
 * Use a move: first ask for targets if it's aimed at someone, then for any
 * stat or number it needs, then roll.
 */
export function startMove(
  campaign: Campaign,
  characterId: string,
  move: ActionDef,
  targets?: MoveTarget[],
  initialChoice?: Pick<MoveChoice, "extra">,
) {
  if (sessionMoveUsed(campaign, characterId, move)) return;
  batch(() => {
    if (move.target && !targets) {
      moveRequest.value = null;
      targetRequest.value = { moveId: move.id, characterId };
      return;
    }
    targetRequest.value = null;
    if (asksFirst(systemOf(campaign), move))
      moveRequest.value = {
        moveId: move.id,
        characterId,
        ...(targets ? { targets } : {}),
        ...(initialChoice ? { choice: initialChoice } : {}),
      };
    else {
      moveRequest.value = null;
      void makeMove(campaign, characterId, move, {}, targets);
    }
  });
}

export function makeMove(
  campaign: Campaign,
  characterId: string,
  move: ActionDef,
  choice: MoveChoice = {},
  targets?: MoveTarget[],
) {
  const system = systemOf(campaign);
  const c = getCharacter(campaign, characterId);
  if (!c) return;
  if (!claimSessionMove(campaign, characterId, move)) return;
  const d = derive(c, system);
  const valueAt = (t: MoveTarget, key: string) => {
    const tc = getCharacter(campaign, t.characterId);
    return tc ? derive(tc, system).values[key] : undefined;
  };
  const { spent, ...result } = performMove(system, move, c, d, choice, undefined, {
    ...(targets ? { targets } : {}),
    valueAt,
  });
  // A roll uses up modifiers that last for one roll; text-only moves leave them.
  for (const id of spent) setModifier(campaign, c.id, id, 0);
  if (
    system.id === "dungeon-world-2" &&
    move.id === "perilous-journey" &&
    result.result === "miss"
  ) {
    for (const character of listCharacters(campaign))
      if (character.kind === "pc") bumpData(campaign, character.id, "xp", 1);
  }
  // A concentration spell ends any other.
  if (move.concentration) setField(campaign, c.id, "concentration", move.id);
  return campaign.chat.post(
    {
      kind: "move",
      moveId: move.id,
      moveName: move.name,
      trigger: move.trigger,
      characterId: c.id,
      characterName: c.name,
      ...result,
      ...(result.targets?.length ? { targets: result.targets } : {}),
    },
    { id: device.value.id, name: myName(campaign) },
  );
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
  if (system.id !== "dungeon-world-2" || !move || actor?.kind !== "pc") return false;

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
  if (system.id !== "dungeon-world-2" || !move || actor?.kind !== "pc") return false;

  const card = await makeMove(campaign, actorId, move);
  if (!card) return false;
  for (const character of listCharacters(campaign)) {
    if (character.kind !== "pc") continue;
    const maxHp = derive(character, system).values.maxHp ?? 0;
    bumpResource(campaign, character.id, "hp", maxHp - (character.resources.hp ?? 0), maxHp);
    const inventory = inventoryOf(campaign, character.id);
    for (const [itemId, item] of inventory?.entries() ?? [])
      if (item.resetUsesAtCamp && item.uses !== undefined && item.usesLeft !== item.uses)
        inventory?.set(itemId, { ...item, usesLeft: item.uses });
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
  if (
    system.id !== "dungeon-world-2" ||
    !move ||
    supporter?.kind !== "pc" ||
    comforted?.kind !== "pc" ||
    supporterId === comfortedId
  )
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
  if (system.id !== "dungeon-world-2" || !move || leader?.kind !== "pc") return false;
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

const DW2_DOWNTIME_KEY = "dungeon-world-2:downtime";
const DW2_DOWNTIME_TRAINED_KEY = "dungeon-world-2:downtime-trained";

export function dungeonWorld2DowntimeEpoch(campaign: Campaign): number {
  return Number(campaign.systemData.get(DW2_DOWNTIME_KEY) ?? 0);
}

/** Start a fresh Downtime period so each PC can Train once during it. */
export function beginDungeonWorld2Downtime(campaign: Campaign): number | undefined {
  if (systemOf(campaign).id !== "dungeon-world-2" || !campaign.isGm()) return;
  const epoch = dungeonWorld2DowntimeEpoch(campaign) + 1;
  campaign.systemData.set(DW2_DOWNTIME_KEY, epoch);
  return epoch;
}

export function trainedDuringDungeonWorld2Downtime(
  campaign: Campaign,
  characterId: string,
): boolean {
  const epoch = dungeonWorld2DowntimeEpoch(campaign);
  const trained = campaign.systemData.get(DW2_DOWNTIME_TRAINED_KEY) as Y.Map<number> | undefined;
  return epoch > 0 && trained?.get(characterId) === epoch;
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
  if (
    systemOf(campaign).id !== "dungeon-world-2" ||
    character?.kind !== "pc" ||
    dungeonWorld2DowntimeEpoch(campaign) === 0
  )
    return false;
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
      );
    }
    return true;
  });
}

export function resupplyDungeonWorld2(campaign: Campaign, characterId: string): boolean {
  const character = getCharacter(campaign, characterId);
  if (
    systemOf(campaign).id !== "dungeon-world-2" ||
    character?.kind !== "pc" ||
    dungeonWorld2DowntimeEpoch(campaign) === 0 ||
    Number(character.data.treasureBoxes ?? 0) < 1
  )
    return false;
  const inventory = inventoryOf(campaign, characterId);
  if (!inventory) return false;
  const replenishable = [...inventory.entries()].filter(
    ([, item]) =>
      item.uses !== undefined && !item.tags.includes("magic") && item.usesLeft !== item.uses,
  );
  if (!replenishable.length) return false;
  campaign.doc.transact(() => {
    if (!spendTreasure(campaign, characterId)) return;
    for (const [id, item] of replenishable)
      if (item.uses !== undefined) inventory.set(id, { ...item, usesLeft: item.uses });
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
    systemOf(campaign).id !== "dungeon-world-2" ||
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
    systemOf(campaign).id !== "dungeon-world-2" ||
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
    systemOf(campaign).id !== "dungeon-world-2" ||
    character?.kind !== "pc" ||
    epoch === 0 ||
    trainedDuringDungeonWorld2Downtime(campaign, characterId) ||
    Number(character.data.treasureBoxes ?? 0) < 1
  )
    return false;

  return campaign.doc.transact(() => {
    if (!spendTreasure(campaign, characterId)) return false;
    bumpData(campaign, characterId, "xp", 1);
    let trained = campaign.systemData.get(DW2_DOWNTIME_TRAINED_KEY) as Y.Map<number> | undefined;
    if (!(trained instanceof Y.Map)) {
      trained = new Y.Map<number>();
      campaign.systemData.set(DW2_DOWNTIME_TRAINED_KEY, trained);
    }
    trained.set(characterId, epoch);
    return true;
  });
}

/** Carry out a suggestion button from a move card. */
export function applySuggestion(campaign: Campaign, characterId: string, s: MoveSuggestion) {
  if (s.bump) bumpData(campaign, characterId, s.bump.field, s.bump.by);
  else if (s.roll) {
    const { formula, comment, damage, targets } = s.roll;
    postRoll(
      campaign,
      formula,
      "public",
      comment,
      damage && targets?.length ? { type: damage, targets } : undefined,
    );
  }
}

/* Inventory */

/**
 * A character's inventory, to change. A copy that's still carrying its
 * template's gear gets its own copy of it first.
 */
function inventoryOf(campaign: Campaign, characterId: string): Y.Map<ItemInstance> | undefined {
  const m = campaign.characters.get(characterId);
  if (!m) return undefined;
  if (m.get("inventory") instanceof Y.Map) return m.get("inventory");
  const base = baseOf(campaign, m)?.get("inventory") as Y.Map<ItemInstance> | undefined;
  if (!m.get("base")) return undefined;
  const own = new Y.Map<ItemInstance>();
  m.set("inventory", own);
  for (const [id, item] of base?.entries() ?? []) own.set(id, item);
  return own;
}

export function addItem(campaign: Campaign, characterId: string, def: ItemDef, equip = false) {
  const inv = inventoryOf(campaign, characterId);
  if (!inv) return;
  const last =
    [...inv.values()]
      .map((i) => i.order)
      .sort()
      .at(-1) ?? null;
  const item = instanceOf(def, generateKeyBetween(last, null));
  if (equip && item.equippable) item.equipped = true;
  inv.set(item.id, item);
}

/** Items are replaced whole, so edit a copy: concurrent edits to one item keep the last writer's. */
export function updateItem(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  patch: Partial<ItemInstance>,
) {
  const inv = inventoryOf(campaign, characterId);
  const item = inv?.get(itemId);
  if (inv && item) inv.set(itemId, { ...item, ...patch });
}

export function breakDungeonWorld2Weapon(
  campaign: Campaign,
  characterId: string,
  itemId: string,
): boolean {
  const system = systemOf(campaign);
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const weaponTags = new Set(["close", "hand", "near", "far", "precise", "thrown", "piercing"]);
  if (
    system.id !== "dungeon-world-2" ||
    character?.kind !== "pc" ||
    !item?.equippable ||
    item.broken ||
    item.tags.includes("magic") ||
    !item.tags.some((tag) => weaponTags.has(tag)) ||
    !actionsFor(character, system, derive(character, system)).some(
      (action) => action.name === "Snap the Blade",
    )
  )
    return false;
  updateItem(campaign, characterId, itemId, { broken: true });
  return true;
}

export function markArtifactTrack(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  unlockId?: string,
): boolean {
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition =
    item && systemOf(campaign).items.find((entry) => entry.id === (item.defId ?? item.id));
  const artifact = definition?.artifact;
  if (!item || !artifact || character?.kind !== "pc") return false;
  const progress = item.artifactProgress ?? 0;
  if (progress >= artifact.capacity) return false;
  const nextProgress = progress + 1;
  if (nextProgress < artifact.capacity) {
    updateItem(campaign, characterId, itemId, { artifactProgress: nextProgress });
    return true;
  }

  const unlocked = item.artifactUnlocked ?? [];
  const available = artifact.unlocks.filter((move) => !unlocked.includes(move.id));
  if (!available.length) {
    updateItem(campaign, characterId, itemId, { artifactProgress: artifact.capacity });
    return true;
  }
  const selected =
    artifact.unlockMode === "choose"
      ? available.find((move) => move.id === unlockId)
      : available[0];
  if (!selected || (artifact.unlockMode === "choose" && !unlockId)) return false;
  updateItem(campaign, characterId, itemId, {
    artifactProgress: 0,
    artifactUnlocked:
      artifact.unlockMode === "sequential-replace" ? [selected.id] : [...unlocked, selected.id],
  });
  return true;
}

export function clearArtifactTrack(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  amount = 1,
): boolean {
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition =
    item && systemOf(campaign).items.find((entry) => entry.id === (item.defId ?? item.id));
  const capacity = definition?.artifact?.capacity;
  const progress = item?.artifactProgress ?? 0;
  if (
    !item ||
    capacity === undefined ||
    character?.kind !== "pc" ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > progress
  )
    return false;
  updateItem(campaign, characterId, itemId, { artifactProgress: progress - amount });
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
    if (system.id !== "dungeon-world-2" || !resolvedChoice) return false;
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
    if (system.id !== "dungeon-world-2" || !resolvedChoice) return false;
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
  if (system.id === "dungeon-world-2" && definition?.itemUse === "healing-potion") {
    if (resolvedChoice?.kind === "clear-locked")
      clearCondition(campaign, characterId, resolvedChoice.condition);
    else if (resolvedChoice?.kind === "heal-half-lost") {
      const maxHp = derive(character, system).values.maxHp ?? 0;
      const lostHp = Math.max(0, maxHp - (character.resources.hp ?? 0));
      bumpResource(campaign, characterId, "hp", Math.floor(lostHp / 2), maxHp);
    }
  } else if (system.id === "dungeon-world-2" && definition?.itemUse === "hearty-feast") {
    for (const ally of listCharacters(campaign)) {
      if (ally.kind !== "pc") continue;
      const maxHp = derive(ally, system).values.maxHp ?? 0;
      bumpResource(campaign, ally.id, "hp", Math.floor(maxHp / 2), maxHp);
    }
  } else if (
    system.id === "dungeon-world-2" &&
    definition?.itemUse === "magic-wand" &&
    resolvedChoice?.kind === "mark-condition"
  ) {
    const state = character.conditions.includes(resolvedChoice.condition) ? "locked" : "marked";
    setConditionState(campaign, characterId, resolvedChoice.condition, state);
  }
  return true;
}

export function removeItem(campaign: Campaign, characterId: string, itemId: string) {
  inventoryOf(campaign, characterId)?.delete(itemId);
}
