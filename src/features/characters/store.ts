import type { Characters } from "../../campaign/schema";
import type { Item, Plain } from "../../data/schema";
import type { SystemCharacterRec } from "../../systems/schema";
import { newId } from "../../lib/ids";
import type { EffectSource } from "../../systems/effects";
import type { ActionDef, Derived, GameSystem, ItemDef } from "../../systems/types";
import type { DataValue } from "../../data/types";
import type { characterEntry } from "./schema";
import type { CharacterKind, CharacterView, ItemInstance } from "./types";

/*
 * Making and reading characters; their layout is declared in schema.ts.
 */

export type CharacterRec = Item<typeof characterEntry>;
/** The parts of a system's data kept as id -> value. */
export type SystemPart = "data" | "scores" | "resources" | "modifiers" | "fields";

const readPart = (data: SystemCharacterRec | undefined, part: SystemPart) =>
  data?.get(part)?.read();

/** The character's data for this system, if it has any of its own. */
export const systemPartOf = (m: CharacterRec | undefined, system: GameSystem) =>
  m?.get("ext")?.get(system.id);

/** One of the system's parts of a character (data, scores…), made if it's missing. */
export const ensureSystemPart = <P extends SystemPart>(
  m: CharacterRec,
  system: GameSystem,
  part: P,
) => m.ensure("ext").ensure(system.id).ensure(part);

export function createCharacter(
  characters: Characters,
  system: GameSystem,
  init: {
    name: string;
    owner: string;
    scores?: Record<string, number>;
    /** The system's fields, over their defaults: choices made at creation. */
    data?: Record<string, DataValue>;
    kind?: CharacterKind;
    folder?: string;
  },
): string {
  const id = newId();
  const kind = init.kind ?? "pc";
  const scores: Record<string, number> = {};
  for (const s of system.stats) scores[s.id] = init.scores?.[s.id] ?? s.default ?? 10;
  const data: Record<string, DataValue> = {};
  for (const f of system.characterData)
    if (!f.for || f.for === kind) data[f.id] = init.data?.[f.id] ?? f.default;
  characters.transact(() => {
    characters.set(id, {
      name: init.name,
      owner: init.owner,
      ...(kind === "npc" && { kind }),
      ...(init.folder && { folder: init.folder }),
      conditions: [],
      lockedConditions: [],
      inventory: {},
      ext: {
        [system.id]: {
          schemaVersion: system.schemaVersion ?? 1,
          scores,
          data,
          modifiers: {},
          fields: {},
          resources: {},
        },
      },
    });
    // Every resource starts full.
    const c = characterView(id, characters.get(id)!, system);
    const d = derive(c, system);
    const resources = systemPartOf(characters.get(id), system)!.ensure("resources");
    for (const r of system.resources) resources.set(r.id, r.initial ?? d.values[r.max] ?? 0);
  });
  return id;
}

/**
 * A character as plain values. For a copy, pass its template's map as
 * `base`: whatever the copy doesn't set comes from there.
 */
export function characterView(
  id: string,
  m: CharacterRec,
  system: GameSystem,
  base?: CharacterRec,
): CharacterView {
  const get = <K extends keyof CharacterRec["shape"]>(key: K) =>
    m.has(key) ? m.get(key) : base?.get(key);
  const own = systemPartOf(m, system);
  const inherited = systemPartOf(base, system);
  /** One of the system's parts, the copy's keys over the template's. */
  const merged = <P extends SystemPart>(part: P) =>
    ({
      ...readPart(inherited, part),
      ...readPart(own, part),
    }) as Plain<SystemCharacterRec["shape"][P]>;
  const kind: CharacterKind = get("kind") === "npc" ? "npc" : "pc";
  const storedScores = merged("scores");
  const scores: Record<string, number> = {};
  for (const s of system.stats) scores[s.id] = storedScores[s.id] ?? s.default ?? 10;
  const storedData = merged("data");
  const data: Record<string, DataValue> = {};
  for (const f of system.characterData)
    if (!f.for || f.for === kind) data[f.id] = storedData[f.id] ?? f.default;
  const storedFields = merged("fields");
  const fields: Record<string, string | number> = {};
  for (const f of system.npcFields)
    fields[f.id] = storedFields[f.id] ?? f.default ?? (f.type === "number" ? 0 : "");
  const inv = m.get("inventory") ?? base?.get("inventory");
  const inventory = inv
    ? inv.values().sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    : [];
  return {
    id,
    kind,
    folder: m.get("folder"),
    name: get("name") ?? "Unnamed",
    owner: get("owner") ?? "",
    scores,
    data,
    resources: merged("resources"),
    conditions: get("conditions") ?? [],
    lockedConditions: get("lockedConditions") ?? [],
    durations: get("durations") ?? {},
    concentration: get("concentration"),
    modifiers: merged("modifiers"),
    fields,
    inventory,
    tokenStyle: get("tokenStyle"),
    tokenColour: get("tokenColour"),
    // A copy is never a template itself.
    template: m.get("template"),
    base: m.get("base"),
    learned: get("learned") ?? [],
  };
}

/** Whether an item's effects count: carried, or worn/wielded. */
export function itemActive(item: ItemInstance): boolean {
  return item.active === "always" || item.active === "carried" || item.equipped;
}

/** Everything changing a character's numbers: their conditions, then their active items. */
export function effectSources(c: CharacterView, system: GameSystem): EffectSource[] {
  const activeConditions = new Set(c.conditions);
  const conditions = system.conditions.flatMap((k) =>
    activeConditions.has(k.id) && k.effects.length ? [{ name: k.name, effects: k.effects }] : [],
  );
  const items = c.inventory.flatMap((i) =>
    i.effects.length && itemActive(i) ? [{ name: i.name, effects: i.effects }] : [],
  );
  return [...conditions, ...items];
}

/** A character's effective numbers, as their system works them out. */
export function derive(c: CharacterView, system: GameSystem): Derived {
  return system.derive(c, effectSources(c, system));
}

/** The actions a character has, as their system decides. */
export function actionsFor(c: CharacterView, system: GameSystem, d: Derived): ActionDef[] {
  const own = system.actionsFor(c, d);
  const ownSet = new Set(own);
  const learned = c.learned.flatMap((id) =>
    system.actions.filter(
      (a) =>
        a.id === id &&
        !ownSet.has(a) &&
        (!system.learnedActionAllowed || system.learnedActionAllowed(a, c, d)),
    ),
  );
  return [...own, ...learned];
}

/** The value a stat adds to rolls: its modifier plus any bonuses that apply to every roll with it. */
export function statBonus(d: Derived, statId: string): number {
  return (
    (d.mods[statId] ?? 0) +
    d.resolved.bonuses.filter((b) => b.stat === statId && !b.moves).reduce((n, b) => n + b.value, 0)
  );
}

export function instanceOf(def: ItemDef, order: string): ItemInstance {
  return {
    id: newId(),
    defId: def.id,
    name: def.name,
    description: def.description,
    weight: def.weight,
    tags: def.tags,
    ...(def.uses ? { uses: def.uses, usesLeft: def.uses } : {}),
    ...(def.resetUsesAtCamp ? { resetUsesAtCamp: true } : {}),
    ...(def.artifact ? { artifactProgress: 0, artifactUnlocked: [] } : {}),
    equippable: !!def.equippable,
    equipped: false,
    ...(def.icon ? { icon: def.icon } : {}),
    effects: def.effects ?? [],
    active: def.active ?? "carried",
    order,
  };
}

export function canEditCharacter(c: CharacterView, deviceId: string, isGm: boolean) {
  return isGm || c.owner === deviceId;
}
