import type { Campaign } from "../../campaign/campaign";
import type { Init } from "../../data/schema";
import type { ResetEvent } from "../../systems/types";
import type { DataValue } from "../../data/types";
import { baseOf, getCharacter } from "./queries";
import { derive, ensureSystemPart, systemPartOf, type SystemPart } from "./store";
import type { characterEntry } from "./schema";
import { systemOf } from "./system";

/*
 * Changing what's on one character's sheet. A copy's changes land on the copy,
 * over what it takes from its template.
 */

export type CoreShape = (typeof characterEntry)["shape"];
/** The core fields set whole: name, owner, token looks… */
export type CoreField = {
  [K in keyof CoreShape]: CoreShape[K] extends { kind: "lww" } ? K : never;
}[keyof CoreShape];

/** Set one of the core fields (name, owner, token looks…); `undefined` clears it. */
export function setField<K extends CoreField>(
  campaign: Campaign,
  id: string,
  key: K,
  value: Init<CoreShape[K]> | undefined,
) {
  campaign.characters.get(id)?.patch({ [key]: value });
}

/** One of the system's parts of a character (data, scores…), made if it's missing. A copy's writes land here, over its template. */
function part<P extends SystemPart>(campaign: Campaign, id: string, key: P) {
  const m = campaign.characters.get(id);
  return m && ensureSystemPart(m, systemOf(campaign), key);
}

/** A value in one of the system's parts as the character has it: its own, or for a copy, its template's. */
function current(campaign: Campaign, id: string, key: SystemPart, field: string): unknown {
  const system = systemOf(campaign);
  const m = campaign.characters.get(id);
  const own = systemPartOf(m, system)?.get(key);
  if (own?.has(field)) return own.get(field);
  return systemPartOf(baseOf(campaign, m), system)?.get(key)?.get(field);
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

export function setScore(campaign: Campaign, id: string, stat: string, score: number) {
  part(campaign, id, "scores")?.set(stat, score);
}

/** Set a resource (HP, spell slots) outright. */
export function setResource(campaign: Campaign, id: string, resource: string, value: number) {
  part(campaign, id, "resources")?.set(resource, value);
}

/**
 * Add to a resource (HP, spell slots), between zero and its maximum. The
 * change is added, so damage dealt by two players at once all lands.
 */
export function bumpResource(
  campaign: Campaign,
  id: string,
  resource: string,
  by: number,
  max?: number,
) {
  const r = part(campaign, id, "resources");
  if (!r) return;
  const now = Number(current(campaign, id, "resources", resource) ?? 0);
  const next = Math.max(0, now + by);
  const clamped = max === undefined ? next : Math.min(next, max);
  // A copy's first change makes its own count, starting from the template's.
  if (r.has(resource)) r.add(resource, clamped - now);
  else r.set(resource, clamped);
}

/** Refill every resource that this rest resets (see ResourceDef.resets) to its maximum. */
export function rest(campaign: Campaign, id: string, event: ResetEvent) {
  const system = systemOf(campaign);
  const c = getCharacter(campaign, id);
  if (!c) return;
  const d = derive(c, system);
  campaign.doc.transact(() => {
    for (const def of system.resources)
      if (def.resets?.includes(event)) setResource(campaign, id, def.id, d.values[def.max] ?? 0);
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
  const now =
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
  const list = (key: "conditions" | "lockedConditions") =>
    (m.has(key) ? m.get(key) : inherited?.get(key)) ?? [];
  const conditions = new Set(list("conditions"));
  const locked = new Set(list("lockedConditions"));
  if (state === "clear") conditions.delete(condition);
  else conditions.add(condition);
  if (state === "locked") locked.add(condition);
  else locked.delete(condition);
  m.transact(() => {
    m.patch({ conditions: [...conditions], lockedConditions: [...locked] });
    if (state === "clear") {
      const durations = { ...m.get("durations") };
      delete durations[condition];
      m.set("durations", durations);
    }
  });
}

/** Clear a condition and its duration. */
export function clearCondition(campaign: Campaign, id: string, condition: string) {
  setConditionState(campaign, id, condition, "clear");
}

/** Teach a character an action (a move dropped on them), or with `known` false, let them forget it. */
export function setLearned(campaign: Campaign, id: string, actionId: string, known: boolean) {
  const m = campaign.characters.get(id);
  if (!m) return;
  const now = (m.has("learned") ? m.get("learned") : baseOf(campaign, m)?.get("learned")) ?? [];
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
  const previousSet = new Set(previous);
  const costs = new Map<string, number>();
  if (!free) {
    for (const option of next)
      if (!previousSet.has(option)) {
        const cost = definition.costs?.[option];
        if (cost) costs.set(cost.resource, (costs.get(cost.resource) ?? 0) + cost.by);
      }
  }
  const resourcesById = new Map<string, (typeof system.resources)[number]>();
  for (const resource of system.resources)
    if (!resourcesById.has(resource.id)) resourcesById.set(resource.id, resource);
  for (const [resource, by] of costs) {
    const currentValue = character.resources[resource] ?? 0;
    const max = derived.values[resourcesById.get(resource)?.max ?? ""];
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
        derived.values[resourcesById.get(resource)?.max ?? ""],
      );
  });
}
