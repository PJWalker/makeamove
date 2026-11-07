import * as Y from "yjs";
import type { Campaign } from "../../campaign/campaign";
import type { ResetEvent } from "../../systems/types";
import type { DataValue } from "../../core/types";
import { baseOf, getCharacter } from "./queries";
import { derive } from "./store";
import { systemOf } from "./system";

/*
 * Changing what's on one character's sheet. A copy's changes land on the copy,
 * over what it takes from its template.
 */

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
