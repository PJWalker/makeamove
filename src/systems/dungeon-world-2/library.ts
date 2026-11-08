import type { ActionDef, ItemDef, LibraryLayoutCollection, LibraryNode } from "../types";
import { PATHS } from "./paths";
import { CLASS_STARTING } from "./startingOptions";
import { STRUGGLES, struggleEntryId } from "./struggles";

/*
 * How Dungeon World 2 lays out its Libraries: moves by the rulebook's
 * headings; each class holding its starting move, its Paths (each holding
 * its moves) and its starting kit; Struggles and Advancements as entries of
 * their own; gear by what it's for, with each Artifact holding its moves.
 */

interface ClassInfo {
  id: string;
  name: string;
  hp: number;
  description: string;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The advancements, one entry for each kind of choice; level-up offers the specific ones. */
const ADVANCEMENTS: { name: string; text: string; note: string }[] = [
  {
    name: "Increase a Stat",
    text: "Raise one Stat by 1, to at most +2 (+3 from level 10).",
    note: "2 times; 3 from level 5, 4 from level 10",
  },
  {
    name: "Gain a Path",
    text: "Gain a Path from your Class that you don't have yet, and its Starting Move.",
    note: "1 Path; 2 from level 5",
  },
  {
    name: "Reveal a Struggle",
    text: "Choose a Struggle and reveal it.",
    note: "One Struggle at a time",
  },
  {
    name: "Gain a Path Move",
    text: "Gain a Move you don't have from a Path you have.",
    note: "4; 12 from level 5, 16 from level 10",
  },
  {
    name: "Multiclass",
    text: "Gain a Path from another Class, and its Starting Move.",
    note: "Level 5+ · 1 Path; 2 from level 10",
  },
  {
    name: "Obtain a magic item",
    text: "Choose a magic item or create one with the GM, then record it in your inventory.",
    note: "Level 5+ · Once",
  },
  {
    name: "Obtain an Artifact",
    text: "Choose an Artifact or create one with the GM, then record it in your inventory.",
    note: "Level 10+ · Once",
  },
];

const ARMOR = new Set(["light-armor", "medium-armor", "heavy-armor", "shield"]);

export function dw2Library({
  classes,
  classMoves,
  actions,
  gear,
  classGear,
  magicItems,
}: {
  classes: ClassInfo[];
  /** Each class's starting move id. */
  classMoves: Record<string, string>;
  actions: ActionDef[];
  gear: ItemDef[];
  classGear: ItemDef[];
  magicItems: ItemDef[];
}): LibraryLayoutCollection[] {
  const itemIds = new Set([...gear, ...classGear, ...magicItems].map((item) => item.id));
  const items = new Map([...gear, ...classGear].map((item) => [item.id, item]));
  const movesIn = (category: string): LibraryNode[] =>
    actions.filter((move) => move.category === category).map((move) => ({ move: move.id }));
  /** A starting-kit choice: the item it gives, or the choice itself if it isn't one. */
  const kitEntry = (
    classId: string,
    option: { id: string; name: string; text: string; items?: string[] },
  ): LibraryNode => {
    const [first, ...more] = option.items ?? [option.id];
    if (first && itemIds.has(first))
      return more.length
        ? { item: first, note: `+ ${more.map((id) => items.get(id)?.name ?? id).join(", ")}` }
        : { item: first };
    return { entity: { id: `${classId}-kit-${option.id}`, name: option.name, text: option.text } };
  };

  const classEntry = (c: ClassInfo): LibraryNode => {
    const kit = CLASS_STARTING[c.id];
    const paths = PATHS.filter((path) => path.classId === c.id);
    return {
      entity: { id: c.id, name: c.name, text: c.description },
      note: `HP ${c.hp}`,
      groups: [
        {
          id: "starting-move",
          name: "Starting move",
          entries: classMoves[c.id] ? [{ move: classMoves[c.id]! }] : [],
        },
        {
          id: "paths",
          name: "Paths",
          entries: paths.map((path) => ({
            entity: {
              id: path.id,
              name: path.name,
              text: path.tagline || `A ${c.name.replace(/^The /, "")} Path.`,
            },
            groups: [
              {
                id: "moves",
                name: "Moves",
                entries: path.rules.map((_, index) => ({
                  move: `path-${path.id}-${index + 1}`,
                  ...(index === 0 ? { note: "Starting move" } : {}),
                })),
              },
            ],
          })),
        },
        ...(kit
          ? [
              {
                id: "weapon",
                name: kit.weaponLabel,
                note: "Choose 1",
                entries: kit.weapons.map((option) => kitEntry(c.id, option)),
              },
              {
                id: "equipment",
                name: "Starting equipment",
                note: "Choose 2",
                entries: kit.equipment.map((option) => kitEntry(c.id, option)),
              },
              {
                id: "appearance",
                name: "Appearance",
                note: kit.appearance[1] ? "Choose 1 look and 1 detail" : "Choose 1",
                entries: kit.appearance.flatMap((row, rowIndex) =>
                  (row ?? []).map((name): LibraryNode => ({
                    entity: {
                      id: `${c.id}-look-${slug(name)}`,
                      name,
                      text: `A starting ${rowIndex === 0 ? "look" : "detail"} for ${c.name}.`,
                    },
                    note: rowIndex === 0 ? "Look" : "Detail",
                  })),
                ),
              },
            ]
          : []),
      ],
    };
  };

  const artifactEntry = (item: ItemDef): LibraryNode => ({
    item: item.id,
    groups: [
      {
        id: "moves",
        name: "Moves",
        entries: (item.artifact?.unlocks ?? []).map((unlock) => ({
          move: `artifact:${item.id}:${unlock.id}`,
        })),
      },
    ],
  });

  return [
    { id: "moves-core", name: "Core moves", kind: "move", entries: movesIn("basic") },
    { id: "moves-extra", name: "Extra moves", kind: "move", entries: movesIn("special") },
    { id: "moves-campaign", name: "Campaign moves", kind: "move", entries: movesIn("campaign") },
    { id: "classes", name: "Classes", kind: "option", entries: classes.map(classEntry) },
    {
      id: "struggles",
      name: "Struggles",
      kind: "option",
      entries: STRUGGLES.map((struggle) => ({
        entity: { id: struggleEntryId(struggle), name: struggle.name, text: struggle.text },
        ...(struggle.track ? { note: `${struggle.track.name} track (${struggle.track.max})` } : {}),
      })),
    },
    {
      id: "advancements",
      name: "Advancements",
      kind: "option",
      entries: ADVANCEMENTS.map(({ name, text, note }) => ({
        entity: { id: `advancement-${slug(name)}`, name, text },
        note,
      })),
    },
    {
      id: "gear-armor",
      name: "Armor & shields",
      kind: "item",
      entries: gear.filter((i) => ARMOR.has(i.id)).map((i) => ({ item: i.id })),
    },
    {
      id: "gear-weapons",
      name: "Weapons",
      kind: "item",
      entries: gear.filter((i) => !ARMOR.has(i.id) && i.equippable).map((i) => ({ item: i.id })),
    },
    {
      id: "gear-supplies",
      name: "Supplies",
      kind: "item",
      entries: gear.filter((i) => !ARMOR.has(i.id) && !i.equippable).map((i) => ({ item: i.id })),
    },
    {
      id: "gear-magic",
      name: "Magic items",
      kind: "item",
      entries: magicItems.filter((i) => !i.artifact).map((i) => ({ item: i.id })),
    },
    {
      id: "gear-artifacts",
      name: "Artifacts",
      kind: "item",
      entries: magicItems.filter((i) => i.artifact).map(artifactEntry),
    },
  ];
}
