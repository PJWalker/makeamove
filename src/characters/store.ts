import * as Y from 'yjs'
import { newId } from '../lib/ids'
import { resolveEffects, type EffectSource, type Resolved } from '../systems/effects'
import type { ClassDef, Effect, EffectActive, GameSystem, ItemDef } from '../systems/types'

/*
 * Characters live in the campaign's root document as `characters`, a Y.Map
 * of id -> Y.Map. Each character map holds plain fields (name, scores, HP…)
 * and an `inventory` Y.Map of item instances, so two players editing
 * different fields never overwrite each other. Effective values (armour,
 * load, damage) are computed on read and never stored.
 */

export interface ItemInstance {
  id: string
  /** The compendium entry this came from, if any. */
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
  effects: Effect[]
  active: EffectActive
  /** Fractional position, so reordering never conflicts. */
  order: string
}

export interface CharacterView {
  id: string
  name: string
  /** Device id of the player who owns it. */
  owner: string
  classId: string
  race: string
  alignment: string
  level: number
  xp: number
  hp: number
  /** Added to the computed maximum, for the odd homebrew change. */
  hpBonus: number
  scores: Record<string, number>
  debilities: string[]
  bonds: string
  notes: string
  coin: number
  /** +N forward, spent by the next roll. */
  forward: number
  /** +N ongoing, until the GM says it ends. */
  ongoing: number
  inventory: ItemInstance[]
}

export type CharacterMap = Y.Map<any>

export function createCharacter(
  characters: Y.Map<CharacterMap>,
  system: GameSystem,
  init: { name: string; classId: string; owner: string; scores?: Record<string, number> },
): string {
  const id = newId()
  const cls = system.classes.find((c) => c.id === init.classId) ?? system.classes[0]
  const m = new Y.Map<any>()
  characters.doc!.transact(() => {
    characters.set(id, m)
    m.set('name', init.name)
    m.set('owner', init.owner)
    m.set('classId', cls.id)
    m.set('level', 1)
    m.set('xp', 0)
    m.set('coin', 0)
    m.set('forward', 0)
    m.set('ongoing', 0)
    m.set('hpBonus', 0)
    for (const s of system.stats) m.set(`score:${s.id}`, init.scores?.[s.id] ?? 10)
    m.set('inventory', new Y.Map())
    // Start at full health.
    m.set('hp', cls.baseHp + (init.scores?.con ?? 10))
  })
  return id
}

export function characterView(id: string, m: CharacterMap, system: GameSystem): CharacterView {
  const scores: Record<string, number> = {}
  for (const s of system.stats) scores[s.id] = m.get(`score:${s.id}`) ?? 10
  const inv = m.get('inventory') as Y.Map<ItemInstance> | undefined
  const inventory = inv ? [...inv.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)) : []
  return {
    id,
    name: m.get('name') ?? 'Unnamed',
    owner: m.get('owner') ?? '',
    classId: m.get('classId') ?? system.classes[0].id,
    race: m.get('race') ?? '',
    alignment: m.get('alignment') ?? '',
    level: m.get('level') ?? 1,
    xp: m.get('xp') ?? 0,
    hp: m.get('hp') ?? 0,
    hpBonus: m.get('hpBonus') ?? 0,
    scores,
    debilities: (m.get('debilities') as string[] | undefined) ?? [],
    bonds: m.get('bonds') ?? '',
    notes: m.get('notes') ?? '',
    coin: m.get('coin') ?? 0,
    forward: m.get('forward') ?? 0,
    ongoing: m.get('ongoing') ?? 0,
    inventory,
  }
}

export interface Derived {
  cls: ClassDef
  mods: Record<string, number>
  maxHp: number
  armor: number
  /** Damage die sides. */
  damage: number
  damageBonus: number
  load: number
  maxLoad: number
  /** XP needed to level up. */
  xpNeeded: number
  resolved: Resolved
}

/** Whether an item's effects count: carried, or worn/wielded. */
export function itemActive(item: ItemInstance): boolean {
  return item.active === 'always' || item.active === 'carried' || item.equipped
}

export function derive(c: CharacterView, system: GameSystem): Derived {
  const cls = system.classes.find((k) => k.id === c.classId) ?? system.classes[0]
  const mods: Record<string, number> = {}
  for (const s of system.stats) mods[s.id] = system.modifier(c.scores[s.id] ?? 10)
  const sources: EffectSource[] = c.inventory
    .filter((i) => i.effects.length && itemActive(i))
    .map((i) => ({ name: i.name, effects: i.effects }))
  const resolved = resolveEffects(
    {
      maxHp: cls.baseHp + (c.scores.con ?? 10) + c.hpBonus,
      armor: 0,
      damage: cls.damage,
      damageBonus: 0,
      maxLoad: cls.load + (mods.str ?? 0),
    },
    sources,
  )
  const v = resolved.values
  return {
    cls,
    mods,
    maxHp: v.maxHp,
    armor: v.armor,
    damage: v.damage,
    damageBonus: v.damageBonus,
    load: c.inventory.reduce((n, i) => n + i.weight, 0),
    maxLoad: v.maxLoad,
    xpNeeded: c.level + 7,
    resolved,
  }
}

/** Moves the character has: their class's, plus any granted by items. */
export function movesFor(c: CharacterView, system: GameSystem, d: Derived) {
  const granted = new Set(d.resolved.moves)
  return system.moves.filter((m) => m.category !== 'class' || m.classId === c.classId || granted.has(m.id))
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
    effects: def.effects ?? [],
    active: def.active ?? 'carried',
    order,
  }
}

export function canEditCharacter(c: CharacterView, deviceId: string, isGm: boolean) {
  return isGm || c.owner === deviceId
}
