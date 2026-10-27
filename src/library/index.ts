import { signal } from '@preact/signals'
import type { ActionDef, ClassDef, GameSystem, ItemDef, TagDef } from '../systems/types'

/*
 * Libraries: collections of things to look up and use (items, moves,
 * classes, tags), contributed by the game system and by plugins. The
 * Libraries panel lists them; characters' inventories draw on them.
 *
 * A source is whoever contributes (a system, a plugin, later the campaign's
 * homebrew); it holds named collections, each of one kind of entry.
 */

export type EntryKind = 'item' | 'move' | 'class' | 'tag'

interface EntryBase {
  id: string
  name: string
  text: string
  tags: string[]
  /** An icon from the core vocabulary (ui/entryIcons.tsx); its kind's icon if absent. */
  icon?: string
}

export type LibraryEntry =
  | (EntryBase & { kind: 'item'; item: ItemDef })
  | (EntryBase & { kind: 'move'; move: ActionDef })
  | (EntryBase & { kind: 'class'; cls: ClassDef })
  | (EntryBase & { kind: 'tag'; tag: TagDef })

export interface LibraryCollection {
  id: string
  name: string
  kind: EntryKind
  entries: LibraryEntry[]
}

export interface LibrarySource {
  id: string
  name: string
  /** Who contributed it: the campaign's game system, or a plugin. */
  from: 'system' | 'plugin'
  collections: LibraryCollection[]
  /** Credit for the text, shown under the source. */
  attribution?: string
}

export const KIND_LABEL: Record<EntryKind, string> = { item: 'Items', move: 'Moves', class: 'Classes', tag: 'Tags' }


export const itemEntry = (i: ItemDef): LibraryEntry => ({ kind: 'item', id: i.id, name: i.name, text: i.description, tags: i.tags, icon: i.icon, item: i })
export const moveEntry = (m: ActionDef): LibraryEntry => ({
  kind: 'move',
  id: m.id,
  name: m.name,
  text: m.text,
  tags: m.tags ?? [],
  icon: m.category === 'class' ? 'class-move' : undefined,
  move: m,
})

/** What a game system contributes: its gear, actions (by the system's categories), classes and tags. */
export function systemLibrary(system: GameSystem): LibrarySource {
  const collections: LibraryCollection[] = []
  if (system.items.length) {
    collections.push({ id: 'items', name: 'Gear', kind: 'item', entries: system.items.map(itemEntry) })
  }
  for (const cat of system.actionCategories) {
    const moves = system.actions.filter((m) => m.category === cat.id)
    if (moves.length) collections.push({ id: `moves-${cat.id}`, name: `${cat.label} moves`, kind: 'move', entries: moves.map(moveEntry) })
  }
  if (system.classes.length) {
    collections.push({
      id: 'classes',
      name: 'Classes',
      kind: 'class',
      entries: system.classes.map((c) => ({ kind: 'class', id: c.id, name: c.name, text: c.blurb, tags: [], icon: c.icon, cls: c })),
    })
  }
  if (system.tags.length) {
    collections.push({
      id: 'tags',
      name: 'Tags',
      kind: 'tag',
      entries: system.tags.map((t) => ({ kind: 'tag', id: t.id, name: t.name, text: t.text, tags: [], tag: t })),
    })
  }
  return { id: `system:${system.id}`, name: system.name, from: 'system', collections, attribution: system.attribution }
}

const plugins = signal<LibrarySource[]>([])

/**
 * Add a plugin's library. Returns a function that takes it away again.
 * A source with the same id replaces the earlier one.
 */
export function registerLibrary(source: LibrarySource): () => void {
  const entry = { ...source, from: 'plugin' as const }
  plugins.value = [...plugins.value.filter((s) => s.id !== source.id), entry]
  return () => {
    plugins.value = plugins.value.filter((s) => s !== entry)
  }
}

/** Every library a campaign can see: its system's first, then plugins'. */
export function librariesFor(system: GameSystem): LibrarySource[] {
  return [systemLibrary(system), ...plugins.value]
}

/** Entries matching a search: by name, tag or text, names first. */
export function searchEntries(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  const rank = (e: LibraryEntry) =>
    e.name.toLowerCase().includes(q) ? 0 : e.tags.some((t) => t.toLowerCase().includes(q)) ? 1 : e.text.toLowerCase().includes(q) ? 2 : -1
  return entries
    .map((e) => [e, rank(e)] as const)
    .filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([e]) => e)
}
