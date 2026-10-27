import * as Y from 'yjs'
import type { BlobRef, TokenStyle } from '../scene/types'
import { newId } from '../lib/ids'
import type { EffectSource } from '../systems/effects'
import type { TemplateSettings } from './templates'
import type { ActionDef, DataValue, Derived, Effect, EffectActive, GameSystem, ItemDef } from '../systems/types'

/*
 * Characters live in the campaign's root document as `characters`, a Y.Map
 * of id -> Y.Map. The core keeps what every system has; the rest is the
 * system's, in maps of its own so two players editing different fields
 * never overwrite each other:
 *
 *   name, owner, kind, folder, classId, level, portrait,
 *   tokenStyle, tokenColour, template, base     plain fields
 *   learned     array  action ids learned beyond the system's
 *   text:*      Y.XmlFragment  rich text: notes, bonds, an NPC's long fields
 *   scores      Y.Map  stat id -> score
 *   data        Y.Map  the system's own fields (characterData)
 *   resources   Y.Map  resource id -> current value (HP, spell slots…)
 *   modifiers   Y.Map  modifier id -> value (Dungeon World's forward, ongoing)
 *   conditions  array  condition ids
 *   durations   object condition id -> how long it lasts in combat (combat/combat.ts)
 *   concentration      the action id the character is concentrating on
 *   fields      Y.Map  an NPC's system-defined fields
 *   inventory   Y.Map  item instances
 *
 * Effective values (armour, load, maximum HP) are worked out by the system
 * on read and never stored.
 *
 * A copy (a template's token, see characters/templates.ts) is a character
 * with `base` set to its template. It stores only what's been changed on it;
 * every field, and every key of every sub-map, it doesn't have comes from
 * the template, like a subclass. Conditions and inventory are taken whole:
 * the copy's own once it has any, else the template's.
 */

export interface ItemInstance {
  id: string
  /** The library entry this came from, if any. */
  defId?: string
  name: string
  description: string
  weight: number
  tags: string[]
  /** Total uses, and how many are left. */
  uses?: number
  usesLeft?: number
  equippable?: boolean
  equipped: boolean
  /** The icon it was given, by name (see ui/entryIcons.tsx). */
  icon?: string
  effects: Effect[]
  active: EffectActive
  /** Fractional position, so reordering never conflicts. */
  order: string
}

/** A player character has a class and a full sheet; an NPC has the fields its system lists. */
export type CharacterKind = 'pc' | 'npc'

export interface CharacterView {
  id: string
  kind: CharacterKind
  /** The folder it's filed in, if any (see Campaign.characterFolders). */
  folder?: string
  name: string
  /** Device id of the player who owns it. */
  owner: string
  classId: string
  level: number
  scores: Record<string, number>
  /** The system's own fields, with its defaults filled in. */
  data: Record<string, DataValue>
  /** Current values of the system's resources. */
  resources: Record<string, number>
  /** Condition ids. */
  conditions: string[]
  /** How long conditions last in combat, by condition id; those without one last until removed. */
  durations: Record<string, Duration>
  /** The action (a spell) the character is concentrating on. */
  concentration?: string
  /** The system's standing roll modifiers, by id. */
  modifiers: Record<string, number>
  /** An NPC's system-defined fields, by id. */
  fields: Record<string, string | number>
  inventory: ItemInstance[]
  /** The character's picture, in the blob store. */
  portrait?: BlobRef
  /** How its token is drawn when placed on a map. */
  tokenStyle?: TokenStyle
  tokenColour?: string
  /** Set for a template, whose tokens are each a copy of it (see characters/templates.ts). */
  template?: TemplateSettings
  /** For a copy: the template it overrides. */
  base?: string
  /** Actions learned beyond what their system gives them (dropped onto them), by id. */
  learned: string[]
}

/**
 * A condition's time left: so many rounds, counted down at the start or end
 * of one combatant's turn (usually whoever caused it).
 */
export interface Duration {
  rounds: number
  tick: 'start' | 'end'
  /** The combatant whose turn counts it down. */
  of: string
}

export type CharacterMap = Y.Map<any>

const subMap = (m: CharacterMap, key: string): Y.Map<any> | undefined => m.get(key) as Y.Map<any> | undefined
const entries = <T,>(m: Y.Map<T> | undefined): Record<string, T> => (m ? Object.fromEntries(m.entries()) : {})

export function createCharacter(
  characters: Y.Map<CharacterMap>,
  system: GameSystem,
  init: {
    name: string
    classId: string
    owner: string
    scores?: Record<string, number>
    /** The system's fields, over their defaults: choices made at creation. */
    data?: Record<string, DataValue>
    kind?: CharacterKind
    folder?: string
  },
): string {
  const id = newId()
  const kind = init.kind ?? 'pc'
  const cls = system.classes.find((c) => c.id === init.classId) ?? system.classes[0]
  const m = new Y.Map<any>()
  characters.doc!.transact(() => {
    characters.set(id, m)
    m.set('name', init.name)
    m.set('owner', init.owner)
    if (kind === 'npc') m.set('kind', 'npc')
    else m.set('classId', cls.id)
    if (init.folder) m.set('folder', init.folder)
    m.set('level', 1)
    const scores = new Y.Map<number>()
    for (const s of system.stats) scores.set(s.id, init.scores?.[s.id] ?? 10)
    m.set('scores', scores)
    const data = new Y.Map<DataValue>()
    for (const f of system.characterData) if (!f.for || f.for === kind) data.set(f.id, init.data?.[f.id] ?? f.default)
    m.set('data', data)
    m.set('modifiers', new Y.Map<number>())
    m.set('fields', new Y.Map<string | number>())
    m.set('conditions', [])
    m.set('inventory', new Y.Map())
    // Every resource starts full.
    const resources = new Y.Map<number>()
    m.set('resources', resources)
    const c = characterView(id, m, system)
    const d = derive(c, system)
    for (const r of system.resources) resources.set(r.id, d.values[r.max] ?? 0)
  })
  return id
}

/**
 * A character as plain values. For a copy, pass its template's map as
 * `base`: whatever the copy doesn't set comes from there.
 */
export function characterView(id: string, m: CharacterMap, system: GameSystem, base?: CharacterMap): CharacterView {
  const get = (key: string) => (m.has(key) ? m.get(key) : base?.get(key))
  /** A sub-map's keys, the copy's over the template's. */
  const merged = <T,>(key: string): Record<string, T> => ({ ...entries<T>(base && subMap(base, key)), ...entries<T>(subMap(m, key)) })
  const kind: CharacterKind = get('kind') === 'npc' ? 'npc' : 'pc'
  const storedScores = merged<number>('scores')
  const scores: Record<string, number> = {}
  for (const s of system.stats) scores[s.id] = storedScores[s.id] ?? 10
  const storedData = merged<DataValue>('data')
  const data: Record<string, DataValue> = {}
  for (const f of system.characterData) if (!f.for || f.for === kind) data[f.id] = storedData[f.id] ?? f.default
  const storedFields = merged<string | number>('fields')
  const fields: Record<string, string | number> = {}
  for (const f of system.npcFields) fields[f.id] = storedFields[f.id] ?? (f.type === 'number' ? 0 : '')
  const inv = (subMap(m, 'inventory') ?? (base && subMap(base, 'inventory'))) as Y.Map<ItemInstance> | undefined
  const inventory = inv ? [...inv.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)) : []
  return {
    id,
    kind,
    folder: m.get('folder'),
    name: get('name') ?? 'Unnamed',
    owner: get('owner') ?? '',
    classId: get('classId') ?? system.classes[0]?.id ?? '',
    level: get('level') ?? 1,
    scores,
    data,
    resources: merged<number>('resources'),
    conditions: (get('conditions') as string[] | undefined) ?? [],
    durations: (get('durations') as Record<string, Duration> | undefined) ?? {},
    concentration: get('concentration'),
    modifiers: merged<number>('modifiers'),
    fields,
    inventory,
    portrait: get('portrait'),
    tokenStyle: get('tokenStyle'),
    tokenColour: get('tokenColour'),
    // A copy is never a template itself.
    template: m.get('template'),
    base: m.get('base'),
    learned: (get('learned') as string[] | undefined) ?? [],
  }
}

/** Whether an item's effects count: carried, or worn/wielded. */
export function itemActive(item: ItemInstance): boolean {
  return item.active === 'always' || item.active === 'carried' || item.equipped
}

/** Everything changing a character's numbers: their conditions, then their active items. */
export function effectSources(c: CharacterView, system: GameSystem): EffectSource[] {
  const conditions = system.conditions
    .filter((k) => c.conditions.includes(k.id) && k.effects.length)
    .map((k) => ({ name: k.name, effects: k.effects }))
  const items = c.inventory.filter((i) => i.effects.length && itemActive(i)).map((i) => ({ name: i.name, effects: i.effects }))
  return [...conditions, ...items]
}

/** A character's effective numbers, as their system works them out. */
export function derive(c: CharacterView, system: GameSystem): Derived {
  return system.derive(c, effectSources(c, system))
}

/** The actions a character has, as their system decides. */
export function actionsFor(c: CharacterView, system: GameSystem, d: Derived): ActionDef[] {
  const own = system.actionsFor(c, d)
  const learned = c.learned.flatMap((id) => system.actions.filter((a) => a.id === id && !own.includes(a)))
  return [...own, ...learned]
}

/** The value a stat adds to rolls: its modifier plus any bonuses that apply to every roll with it. */
export function statBonus(d: Derived, statId: string): number {
  return (d.mods[statId] ?? 0) + d.resolved.bonuses.filter((b) => b.stat === statId && !b.moves).reduce((n, b) => n + b.value, 0)
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
    equippable: !!def.equippable,
    equipped: false,
    ...(def.icon ? { icon: def.icon } : {}),
    effects: def.effects ?? [],
    active: def.active ?? 'carried',
    order,
  }
}

export function canEditCharacter(c: CharacterView, deviceId: string, isGm: boolean) {
  return isGm || c.owner === deviceId
}
