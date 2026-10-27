import type { GameSystem } from '../systems/types'
import { derive, type CharacterView } from './store'

/*
 * A character is an individual or a template. An individual's tokens all
 * share its one record: hurt one and they all show it, on every scene. A
 * template's tokens each keep their own state (HP and other resources,
 * conditions, roll modifiers) on the token itself, and take everything else
 * (stats, fields, gear) from the template; a pack of goblins needs one sheet.
 */

/** How a template names each token placed from it. */
export type Naming = 'number' | 'list' | 'adjective'

export interface TemplateSettings {
  naming: Naming
  /** Names to pick from, for 'list'. */
  names: string[]
}

export const DEFAULT_TEMPLATE: TemplateSettings = { naming: 'number', names: [] }

export const NAMINGS: { id: Naming; label: string; title: string }[] = [
  { id: 'number', label: 'Numbered', title: 'Goblin 1, Goblin 2, Goblin 3…' },
  { id: 'list', label: 'From a list', title: 'A name picked at random from your list' },
  { id: 'adjective', label: 'Adjective', title: 'A random word before the name: Scarred Goblin' },
]

/** What one token of a template keeps for itself. */
export interface TokenState {
  resources: Record<string, number>
  conditions: string[]
  modifiers: Record<string, number>
}

/** A new token's state: every resource full, no conditions or modifiers. */
export function freshState(c: CharacterView, system: GameSystem): TokenState {
  const d = derive({ ...c, conditions: [], modifiers: {} }, system)
  return {
    resources: Object.fromEntries(system.resources.map((r) => [r.id, d.values[r.max] ?? 0])),
    conditions: [],
    modifiers: {},
  }
}

/** The character as one of its tokens: the template, with the token's own state and name. */
export function asToken(c: CharacterView, system: GameSystem, state: TokenState | undefined, name?: string): CharacterView {
  const s = state ?? freshState(c, system)
  return { ...c, name: name || c.name, resources: s.resources, conditions: s.conditions, modifiers: s.modifiers }
}

/** Fitting words to set one goblin apart from the next. */
export const ADJECTIVES = [
  'Angry', 'Bald', 'Bent', 'Big', 'Bitter', 'Bloody', 'Bony', 'Brash', 'Burly', 'Clumsy',
  'Crafty', 'Crooked', 'Cruel', 'Dirty', 'Drowsy', 'Fat', 'Fierce', 'Filthy', 'Gaunt', 'Greedy',
  'Grim', 'Grumpy', 'Hairy', 'Hungry', 'Jittery', 'Lanky', 'Limping', 'Loud', 'Mangy', 'Mean',
  'Nervous', 'Old', 'One-eyed', 'Pale', 'Patchy', 'Puny', 'Quiet', 'Ragged', 'Rotten', 'Rusty',
  'Scarred', 'Scrawny', 'Shifty', 'Sickly', 'Sly', 'Smelly', 'Sneaky', 'Squinting', 'Stout', 'Surly',
  'Tall', 'Toothless', 'Twitchy', 'Ugly', 'Warty', 'Weary', 'Wild', 'Wiry', 'Young', 'Zealous',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `base` with the next number after any already taken: "Goblin 3". */
function numbered(base: string, taken: string[]): string {
  const re = new RegExp(`^${escape(base)} (\\d+)$`)
  const used = taken.map((n) => Number(re.exec(n)?.[1] ?? 0))
  return `${base} ${Math.max(0, ...used) + 1}`
}

/**
 * A name for a new token of a template, unlike the names `taken` on the
 * scene where possible. When a list or the adjectives run out, names get
 * numbers.
 */
export function tokenName(c: Pick<CharacterView, 'name'>, t: TemplateSettings, taken: string[], random = Math.random): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)]
  const base = c.name.trim() || 'Unnamed'
  if (t.naming === 'list') {
    const names = t.names.map((n) => n.trim()).filter(Boolean)
    const free = names.filter((n) => !taken.includes(n))
    if (free.length) return pick(free)
    if (names.length) return numbered(pick(names), taken)
  }
  if (t.naming === 'adjective') {
    const free = ADJECTIVES.map((a) => `${a} ${base}`).filter((n) => !taken.includes(n))
    if (free.length) return pick(free)
  }
  return numbered(base, taken)
}
