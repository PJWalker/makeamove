import { art, artUrl } from "./iconArt";
import type { Icon } from "./icons";

/** The kinds of entry a library holds. */
export type EntryKind = "item" | "monster" | "move" | "option" | "tag";

/*
 * Icons for library entries and inventory items, rendered with the rest of
 * the kit (scripts/icons/models/entries.ts). Systems and plugins pick from
 * this vocabulary by name (an item's or class's `icon`) rather than shipping
 * their own. Anything unnamed or unknown gets its kind's icon.
 */

/** Each name's art, made once, so names for the same thing share one icon. */
const made = new Map<string, Icon>();
const artName = new Map<Icon, string>();
function entry(name: string): Icon {
  let icon = made.get(name);
  if (!icon) {
    icon = art(name);
    made.set(name, icon);
    artName.set(icon, name);
  }
  return icon;
}

/** The icon names systems and plugins can use. */
export const ENTRY_ICONS = {
  rations: entry("rations"),
  gear: entry("gear"),
  potion: entry("potion"),
  herbs: entry("herbs"),
  poultice: entry("poultice"),
  books: entry("books"),
  dagger: entry("dagger"),
  sword: entry("sword"),
  longsword: entry("longsword"),
  axe: entry("axe"),
  spear: entry("spear"),
  polearm: entry("polearm"),
  rapier: entry("rapier"),
  bow: entry("bow"),
  arrows: entry("arrows"),
  chainmail: entry("chainmail"),
  "scale-armor": entry("scale-armor"),
  shield: entry("shield"),
  "holy-symbol": entry("holy-symbol"),
  spellbook: entry("spellbook"),
  tools: entry("tools"),
  bag: entry("bag"),
  mace: entry("mace"),
  flail: entry("flail"),
  hammer: entry("hammer"),
  staff: entry("staff"),
  crossbow: entry("crossbow"),
  "leather-armor": entry("leather-armor"),
  breastplate: entry("breastplate"),
  torch: entry("torch"),
  wand: entry("wand"),
  ring: entry("ring"),
  cloak: entry("cloak"),
  gauntlet: entry("gauntlet"),
  // Classes
  bard: entry("bard"),
  cleric: entry("cleric"),
  druid: entry("druid"),
  fighter: entry("longsword"),
  paladin: entry("paladin"),
  ranger: entry("bow"),
  thief: entry("thief"),
  wizard: entry("wizard"),
  hero: entry("hero"),
  barbarian: entry("barbarian"),
  monk: entry("monk"),
  sorcerer: entry("sorcerer"),
  warlock: entry("warlock"),
  // Moves and tags
  move: entry("move"),
  "class-move": entry("class-move"),
  tag: entry("tag"),
} satisfies Record<string, Icon>;

export type EntryIconName = keyof typeof ENTRY_ICONS;

const KIND_ICON: Record<EntryKind, EntryIconName> = {
  item: "bag",
  move: "move",
  tag: "tag",
  option: "books",
  monster: "hero",
};

/** The icon for an entry: the one it names, or its kind's. */
export function entryIcon(kind: EntryKind, name?: string): Icon {
  return (name && ENTRY_ICONS[name as EntryIconName]) || ENTRY_ICONS[KIND_ICON[kind]];
}

/** The large render of an entry's icon, for drawing on a token. */
export function tokenIconUrl(name?: string): string {
  return artUrl(artName.get(entryIcon("item", name)) ?? "bag", 128);
}
