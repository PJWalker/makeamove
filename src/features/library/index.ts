import { signal } from '@preact/signals-react'
import type {
  ActionDef,
  ChoiceDef,
  GameSystem,
  ItemDef,
  MonsterDef,
  OptionDef,
  TagDef,
} from "../../systems/types";

/*
 * Libraries: collections of things to look up and use (items, moves,
 * options, tags), contributed by the game system and by plugins. The
 * Libraries panel lists them; characters' inventories draw on them.
 *
 * A source is whoever contributes (a system, a plugin, later the campaign's
 * homebrew); it holds named collections, each of one kind of entry.
 */

export type EntryKind = "item" | "move" | "tag" | "option" | "monster";

interface EntryBase {
  id: string
  name: string
  text: string
  tags: string[]
  /** An icon from the core vocabulary (ui/entryIcons.tsx); its kind's icon if absent. */
  icon?: string
}

export type LibraryEntry =
  | (EntryBase & { kind: "item"; item: ItemDef })
  | (EntryBase & { kind: "move"; move: ActionDef })
  | (EntryBase & { kind: "tag"; tag: TagDef })
  /** A character option: a species, background, subclass or feat. */
  | (EntryBase & { kind: "option"; option: OptionDef })
  | (EntryBase & { kind: "monster"; monster: MonsterDef });

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

export const KIND_LABEL: Record<EntryKind, string> = {
  item: "Gear",
  move: "Moves",
  option: "Options",
  monster: "Monsters",
  tag: "Tags",
};


export const itemEntry = (i: ItemDef): LibraryEntry => ({ kind: 'item', id: i.id, name: i.name, text: i.description, tags: i.tags, ...(i.icon ? { icon: i.icon } : {}), item: i })
export const moveEntry = (m: ActionDef): LibraryEntry => ({
  kind: 'move',
  id: m.id,
  name: m.name,
  text: m.text,
  tags: m.tags ?? [],
  ...(m.category === 'class' ? { icon: 'class-move' } : {}),
  move: m,
})
export const monsterEntry = (m: MonsterDef): LibraryEntry => ({ kind: 'monster', id: m.id, name: m.name, text: m.description, tags: [], monster: m })

const optionCollection = (c: ChoiceDef): LibraryCollection => ({
  id: `options-${c.id}`,
  name: c.plural ?? c.label,
  kind: "option",
  entries: c.options.map((o) => ({
    kind: "option",
    id: o.id,
    name: o.name,
    text: o.text,
    tags: [],
    ...(o.icon ? { icon: o.icon } : {}),
    option: o,
  })),
});

/** Built once per system: a system's data never changes while the app runs. */
const built = new WeakMap<GameSystem, LibrarySource>()

/** What a game system contributes: gear, actions, character options and tags. */
export function systemLibrary(system: GameSystem): LibrarySource {
  let source = built.get(system)
  if (!source) built.set(system, (source = buildSystemLibrary(system)))
  return source
}

function buildSystemLibrary(system: GameSystem): LibrarySource {
  const collections: LibraryCollection[] = []
  if (system.items.length) {
    collections.push({ id: 'items', name: 'Gear', kind: 'item', entries: system.items.map(itemEntry) })
  }
  if (system.monsters?.length) collections.push({ id: 'monsters', name: 'Monsters', kind: 'monster', entries: system.monsters.map(monsterEntry) })
  for (const cat of system.actionCategories) {
    const moves = system.actions.filter((m) => m.category === cat.id);
    if (moves.length)
      collections.push({
        id: `moves-${cat.id}`,
        name: `${cat.label} moves`,
        kind: "move",
        entries: moves.map(moveEntry),
      });
  }
  for (const c of [...(system.creation?.choices ?? []), ...(system.creation?.feats ? [system.creation.feats] : [])]) {
    if (c.options.length) collections.push(optionCollection(c))
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

/** Each entry's search text, lower-cased once: name, tags, text. */
const index = new WeakMap<LibraryEntry, [string, string, string]>()
function indexed(e: LibraryEntry): [string, string, string] {
  let k = index.get(e)
  if (!k) index.set(e, (k = [e.name.toLowerCase(), e.tags.join(' ').toLowerCase(), e.text.toLowerCase()]))
  return k
}

/** Entries matching a search: by name, tag or text, names first. */
export function searchEntries(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  const rank = (e: LibraryEntry) => {
    const [name, tags, text] = indexed(e)
    return name.includes(q) ? 0 : tags.includes(q) ? 1 : text.includes(q) ? 2 : -1
  }
  return entries
    .map((e) => [e, rank(e)] as const)
    .filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([e]) => e)
}
