import Fuse, { type IFuseOptions } from "fuse.js";
import { plainText } from "../../core/richText";
import { store } from "../../lib/store";
import type {
  ActionDef,
  ChoiceDef,
  GameSystem,
  ItemDef,
  LibraryNode,
  MonsterDef,
  OptionDef,
  TagDef,
} from "../../systems/types";
import { useValue } from "../../ui/useValue";

/*
 * Libraries: collections of things to look up and use (items, moves,
 * options, tags), contributed by the game system and by plugins. The
 * Libraries panel lists them; characters' inventories draw on them.
 *
 * A source is whoever contributes (a system, a plugin, later the campaign's
 * homebrew); it holds named collections, each of one kind of entry. An entry
 * can hold others under headings: a class its paths, a path its moves.
 */

export type EntryKind = "item" | "move" | "tag" | "option" | "monster";

interface EntryBase {
  id: string;
  name: string;
  text: string;
  tags: string[];
  /** An icon from the core vocabulary (ui/entryIcons.tsx); its kind's icon if absent. */
  icon?: string;
  /** A few words on when or how it applies: "Level 5+", "Starting move". */
  note?: string;
  /** What it holds, under headings. */
  groups?: LibraryGroup[];
}

export interface LibraryGroup {
  id: string;
  name: string;
  /** How many to take, or similar: "Choose 2". */
  note?: string;
  entries: LibraryEntry[];
}

export type LibraryEntry =
  | (EntryBase & { kind: "item"; item: ItemDef })
  | (EntryBase & { kind: "move"; move: ActionDef })
  | (EntryBase & { kind: "tag"; tag: TagDef })
  /** A character option: a species, background, subclass or feat. */
  | (EntryBase & { kind: "option"; option: OptionDef })
  | (EntryBase & { kind: "monster"; monster: MonsterDef });

export interface LibraryCollection {
  id: string;
  name: string;
  kind: EntryKind;
  entries: LibraryEntry[];
}

export interface LibrarySource {
  id: string;
  name: string;
  /** Who contributed it: the campaign's game system, or a plugin. */
  from: "system" | "plugin";
  collections: LibraryCollection[];
  /** Credit for the text, shown under the source. */
  attribution?: string;
}

export const KIND_LABEL: Record<EntryKind, string> = {
  item: "Gear",
  move: "Moves",
  option: "Character",
  monster: "Monsters",
  tag: "Tags",
};

export const itemEntry = (i: ItemDef): LibraryEntry => ({
  kind: "item",
  id: i.id,
  name: i.name,
  text: `${i.description}${i.wealthCost ? `\n\nCost: ${i.wealthCost.tier} (${i.wealthCost.rank})` : ""}`,
  tags: i.tags,
  ...(i.icon ? { icon: i.icon } : {}),
  item: i,
});
export const moveEntry = (m: ActionDef): LibraryEntry => ({
  kind: "move",
  id: m.id,
  name: m.name,
  text: plainText(m.text),
  tags: m.tags ?? [],
  ...(m.category === "class" ? { icon: "class-move" } : {}),
  move: m,
});
export const monsterEntry = (m: MonsterDef): LibraryEntry => ({
  kind: "monster",
  id: m.id,
  name: m.name,
  text: m.description,
  tags: [],
  monster: m,
});

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
const built = new WeakMap<GameSystem, LibrarySource>();

/** What a game system contributes: gear, actions, character options and tags. */
export function systemLibrary(system: GameSystem): LibrarySource {
  let source = built.get(system);
  if (!source) built.set(system, (source = buildSystemLibrary(system)));
  return source;
}

function buildSystemLibrary(system: GameSystem): LibrarySource {
  const collections: LibraryCollection[] = system.library ? laidOut(system) : flat(system);
  if (system.monsters?.length)
    collections.push({
      id: "monsters",
      name: "Monsters",
      kind: "monster",
      entries: system.monsters.map(monsterEntry),
    });
  if (system.tags.length) {
    collections.push({
      id: "tags",
      name: "Tags",
      kind: "tag",
      entries: system.tags.map((t) => ({
        kind: "tag",
        id: t.id,
        name: t.name,
        text: t.text,
        tags: [],
        tag: t,
      })),
    });
  }
  return {
    id: `system:${system.id}`,
    name: system.name,
    from: "system",
    collections,
    attribution: system.attribution,
  };
}

/** A system's own layout, its ids resolved to entries. */
function laidOut(system: GameSystem): LibraryCollection[] {
  const items = new Map(system.items.map((i) => [i.id, i]));
  const moves = new Map(system.actions.map((m) => [m.id, m]));
  const resolve = (node: LibraryNode): LibraryEntry[] => {
    const base: LibraryEntry | undefined =
      "item" in node
        ? items.has(node.item)
          ? itemEntry(items.get(node.item)!)
          : undefined
        : "move" in node
          ? moves.has(node.move)
            ? moveEntry(moves.get(node.move)!)
            : undefined
          : {
              kind: "option",
              id: node.entity.id,
              name: node.entity.name,
              text: node.entity.text,
              tags: [],
              ...(node.entity.icon ? { icon: node.entity.icon } : {}),
              option: node.entity,
            };
    if (!base) return [];
    const groups = (node.groups ?? [])
      .map((g) => ({
        id: g.id,
        name: g.name,
        ...(g.note ? { note: g.note } : {}),
        entries: g.entries.flatMap(resolve),
      }))
      .filter((g) => g.entries.length);
    return [
      { ...base, ...(node.note ? { note: node.note } : {}), ...(groups.length ? { groups } : {}) },
    ];
  };
  return system.library!.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    entries: c.entries.flatMap(resolve),
  }));
}

/** Each kind listed flat: gear, moves by category, then each choice's options. */
function flat(system: GameSystem): LibraryCollection[] {
  const collections: LibraryCollection[] = [];
  if (system.items.length) {
    collections.push({
      id: "items",
      name: "Gear",
      kind: "item",
      entries: system.items.map(itemEntry),
    });
  }
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
  for (const c of [
    ...(system.creation?.choices ?? []),
    ...(system.creation?.feats ? [system.creation.feats] : []),
  ]) {
    if (c.options.length) collections.push(optionCollection(c));
  }
  return collections;
}

const plugins = store<LibrarySource[]>([]);

/**
 * Add a plugin's library. Returns a function that takes it away again.
 * A source with the same id replaces the earlier one.
 */
export function registerLibrary(source: LibrarySource): () => void {
  const entry = { ...source, from: "plugin" as const };
  plugins.value = [...plugins.value.filter((s) => s.id !== source.id), entry];
  return () => {
    plugins.value = plugins.value.filter((s) => s !== entry);
  };
}

/** Every library a campaign can see: its system's first, then plugins'. */
export function librariesFor(system: GameSystem): LibrarySource[] {
  return [systemLibrary(system), ...plugins.value];
}

/** `librariesFor`, re-rendering when a plugin's library comes or goes. */
export function useLibrariesFor(system: GameSystem): LibrarySource[] {
  return [systemLibrary(system), ...useValue(plugins)];
}

const SEARCH: IFuseOptions<LibraryEntry> = {
  keys: [
    { name: "name", weight: 3 },
    { name: "tags", getFn: (e) => [...e.tags, e.note ?? ""], weight: 2 },
    { name: "text", weight: 1 },
  ],
  includeScore: true,
  ignoreDiacritics: true,
  ignoreLocation: true,
  threshold: 0.3,
  useTokenSearch: true,
  tokenMatch: "all",
};

/** Above this a match is only a few scattered letters deep in long text. */
const WEAKEST = 0.6;

/** A Fuse index over a list's entries, nested ones included, built once per list. */
const searchers = new WeakMap<LibraryEntry[], Fuse<LibraryEntry>>();

/** How well each entry matches a search, 0 best: names count most, then tags, then text. */
function searchScores(entries: LibraryEntry[], query: string): Map<LibraryEntry, number> {
  let fuse = searchers.get(entries);
  if (!fuse) searchers.set(entries, (fuse = new Fuse(flatEntries(entries), SEARCH)));
  return new Map(
    fuse.search(query).flatMap((r) => ((r.score ?? 1) <= WEAKEST ? [[r.item, r.score ?? 1]] : [])),
  );
}

/** An entry and every entry it holds, depth first. */
export function flatEntries(entries: LibraryEntry[]): LibraryEntry[] {
  return entries.flatMap((e) => [e, ...flatEntries(e.groups?.flatMap((g) => g.entries) ?? [])]);
}

/** The entries at the top of a source's collections, as "kind:id". */
export const topLevelKeys = (source: LibrarySource): Set<string> =>
  new Set(source.collections.flatMap((c) => c.entries.map((e) => `${e.kind}:${e.id}`)));

/** Every entry in a source, nested ones included. */
export const sourceEntries = (source: LibrarySource): LibraryEntry[] =>
  flatEntries(source.collections.flatMap((c) => c.entries));

/** An entry as shown after filtering: what it still holds, and whether to open it to show a match inside. */
export interface EntryView {
  entry: LibraryEntry;
  groups: { group: LibraryGroup; entries: EntryView[] }[];
  /** Kept for something it holds rather than for itself. */
  reveal: boolean;
}

const fullView = (entry: LibraryEntry): EntryView => ({
  entry,
  groups: (entry.groups ?? []).map((group) => ({ group, entries: group.entries.map(fullView) })),
  reveal: false,
});

/**
 * Entries matching a search and kind, nested ones included: an entry that
 * matches keeps all it holds; one that doesn't is kept, opened, for any match
 * inside it. Best matches first. A nested entry that is also listed at the top
 * of its source (an item in a class's starting kit) isn't matched again there.
 */
export function viewEntries(
  entries: LibraryEntry[],
  query: string,
  kind: EntryKind | "all" = "all",
  listed: ReadonlySet<string> = new Set(),
): EntryView[] {
  const q = query.trim();
  if (!q && kind === "all") return entries.map(fullView);
  const scores = q ? searchScores(entries, q) : null;
  const rank = (e: LibraryEntry) => {
    if (kind !== "all" && e.kind !== kind) return -1;
    return scores ? (scores.get(e) ?? -1) : 0;
  };
  const visit = (e: LibraryEntry, nested = false): [EntryView, number] | null => {
    const own = nested && listed.has(`${e.kind}:${e.id}`) ? -1 : rank(e);
    if (own >= 0) return [fullView(e), own];
    let best = Infinity;
    const groups = (e.groups ?? []).flatMap((group) => {
      const kept = group.entries.flatMap((c) => {
        const v = visit(c, true);
        if (!v) return [];
        best = Math.min(best, v[1]);
        return [v[0]];
      });
      return kept.length ? [{ group, entries: kept }] : [];
    });
    return groups.length ? [{ entry: e, groups, reveal: true }, best] : null;
  };
  return entries
    .flatMap((e) => {
      const v = visit(e);
      return v ? [v] : [];
    })
    .sort((a, b) => a[1] - b[1])
    .map(([v]) => v);
}

/** A library entry's window key: its source, kind and id. */
export const libraryKey = (sourceId: string, e: LibraryEntry) =>
  `lib:${sourceId}:${e.kind}:${e.id}`;

/** The entry a window key names, nested ones included; ids may hold colons. */
export function entryByKey(
  sources: LibrarySource[],
  key: string,
): { source: LibrarySource; entry: LibraryEntry | undefined } | undefined {
  const source = sources.find((s) => key.startsWith(`lib:${s.id}:`));
  if (!source) return undefined;
  return { source, entry: sourceEntries(source).find((e) => libraryKey(source.id, e) === key) };
}
