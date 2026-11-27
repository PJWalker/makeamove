import type { Object3D } from "three";
import * as entry from "./entries";

/**
 * One model per library-entry icon, keyed by the name systems use for it
 * (src/ui/entryIcons.tsx) and by the file it renders to.
 */
export const MODELS = {
  rations: entry.rations,
  gear: entry.gear,
  potion: entry.potion,
  herbs: entry.herbs,
  poultice: entry.poultice,
  books: entry.books,
  dagger: entry.dagger,
  sword: entry.shortSword,
  longsword: entry.longsword,
  axe: entry.axe,
  spear: entry.spear,
  polearm: entry.polearm,
  rapier: entry.rapier,
  bow: entry.bow,
  arrows: entry.arrows,
  chainmail: entry.chainmail,
  "scale-armor": entry.scaleArmor,
  shield: entry.shield,
  "holy-symbol": entry.holySymbol,
  spellbook: entry.spellbook,
  tools: entry.lockpicks,
  bag: entry.bag,
  mace: entry.mace,
  flail: entry.flail,
  hammer: entry.hammer,
  staff: entry.staff,
  crossbow: entry.crossbow,
  "leather-armor": entry.leatherArmor,
  breastplate: entry.breastplate,
  torch: entry.torch,
  wand: entry.wand,
  ring: entry.ring,
  cloak: entry.cloak,
  gauntlet: entry.gauntlet,
  bard: entry.lyre,
  cleric: entry.ankh,
  druid: entry.oakLeaf,
  paladin: entry.paladin,
  thief: entry.thief,
  wizard: entry.wizard,
  hero: entry.hero,
  barbarian: entry.barbarian,
  monk: entry.monk,
  sorcerer: entry.sorcerer,
  warlock: entry.warlock,
  move: entry.move,
  "class-move": entry.classMove,
  tag: entry.tag,
} satisfies Record<string, () => Object3D>;

export type IconName = keyof typeof MODELS;
