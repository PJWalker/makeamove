import type { EntryKind } from '../library'
import { icon, type Icon, IconCharacters, IconMap, IconNotes } from "./icons";
import { render } from "preact";

/*
 * Icons for library entries and inventory items. Icons are bundled at build
 * time, so systems and plugins pick from this vocabulary by name (an item's
 * or class's `icon`) rather than shipping their own. Anything unnamed or
 * unknown gets its kind's icon. Game-icons.net, CC BY 3.0.
 */

import GiAnkh from '~icons/game-icons/ankh'
import GiArrowFlights from '~icons/game-icons/arrow-flights'
import GiBarbarian from '~icons/game-icons/barbarian'
import GiBattleAxe from '~icons/game-icons/battle-axe'
import GiBookPile from '~icons/game-icons/book-pile'
import GiBowArrow from '~icons/game-icons/bow-arrow'
import GiBreastplate from '~icons/game-icons/breastplate'
import GiBroadsword from '~icons/game-icons/broadsword'
import GiChainMail from '~icons/game-icons/chain-mail'
import GiCheckedShield from '~icons/game-icons/checked-shield'
import GiCloak from '~icons/game-icons/cloak'
import GiCloakDagger from '~icons/game-icons/cloak-dagger'
import GiCrossbow from '~icons/game-icons/crossbow'
import GiCrystalWand from '~icons/game-icons/crystal-wand'
import GiFlail from '~icons/game-icons/flail'
import GiGauntlet from '~icons/game-icons/gauntlet'
import GiGladius from '~icons/game-icons/gladius'
import GiHalberd from '~icons/game-icons/halberd'
import GiHamShank from '~icons/game-icons/ham-shank'
import GiHealthPotion from '~icons/game-icons/health-potion'
import GiHerbsBundle from '~icons/game-icons/herbs-bundle'
import GiHolySymbol from '~icons/game-icons/holy-symbol'
import GiKnapsack from '~icons/game-icons/knapsack'
import GiLeatherArmor from '~icons/game-icons/leather-armor'
import GiLockpicks from '~icons/game-icons/lockpicks'
import GiLyre from '~icons/game-icons/lyre'
import GiMaceHead from '~icons/game-icons/mace-head'
import GiMagicSwirl from '~icons/game-icons/magic-swirl'
import GiMonkFace from '~icons/game-icons/monk-face'
import GiOakLeaf from '~icons/game-icons/oak-leaf'
import GiPointyHat from '~icons/game-icons/pointy-hat'
import GiPowderBag from '~icons/game-icons/powder-bag'
import GiPriceTag from '~icons/game-icons/price-tag'
import GiRing from '~icons/game-icons/ring'
import GiRollingDices from '~icons/game-icons/rolling-dices'
import GiRopeCoil from '~icons/game-icons/rope-coil'
import GiRoundShield from '~icons/game-icons/round-shield'
import GiScaleMail from '~icons/game-icons/scale-mail'
import GiSpears from '~icons/game-icons/spears'
import GiSpellBook from '~icons/game-icons/spell-book'
import GiStiletto from '~icons/game-icons/stiletto'
import GiSwordman from '~icons/game-icons/swordman'
import GiTorch from '~icons/game-icons/torch'
import GiVisoredHelm from '~icons/game-icons/visored-helm'
import GiWarhammer from '~icons/game-icons/warhammer'
import GiWarlockEye from '~icons/game-icons/warlock-eye'
import GiWingedSword from '~icons/game-icons/winged-sword'
import GiWizardStaff from '~icons/game-icons/wizard-staff'

/** The icon names systems and plugins can use. */
export const ENTRY_ICONS = {
  // Gear
  rations: icon(GiHamShank),
  gear: icon(GiRopeCoil),
  potion: icon(GiHealthPotion),
  herbs: icon(GiHerbsBundle),
  poultice: icon(GiPowderBag),
  books: icon(GiBookPile),
  dagger: icon(GiStiletto),
  sword: icon(GiGladius),
  longsword: icon(GiBroadsword),
  axe: icon(GiBattleAxe),
  spear: icon(GiSpears),
  polearm: icon(GiHalberd),
  rapier: icon(GiSwordman),
  bow: icon(GiBowArrow),
  arrows: icon(GiArrowFlights),
  chainmail: icon(GiChainMail),
  "scale-armor": icon(GiScaleMail),
  shield: icon(GiRoundShield),
  "holy-symbol": icon(GiHolySymbol),
  spellbook: icon(GiSpellBook),
  tools: icon(GiLockpicks),
  bag: icon(GiKnapsack),
  mace: icon(GiMaceHead),
  flail: icon(GiFlail),
  hammer: icon(GiWarhammer),
  staff: icon(GiWizardStaff),
  crossbow: icon(GiCrossbow),
  "leather-armor": icon(GiLeatherArmor),
  breastplate: icon(GiBreastplate),
  torch: icon(GiTorch),
  wand: icon(GiCrystalWand),
  ring: icon(GiRing),
  cloak: icon(GiCloak),
  gauntlet: icon(GiGauntlet),
  // Classes
  bard: icon(GiLyre),
  cleric: icon(GiAnkh),
  druid: icon(GiOakLeaf),
  fighter: icon(GiBroadsword),
  paladin: icon(GiCheckedShield),
  ranger: icon(GiBowArrow),
  thief: icon(GiCloakDagger),
  wizard: icon(GiPointyHat),
  hero: icon(GiVisoredHelm),
  barbarian: icon(GiBarbarian),
  monk: icon(GiMonkFace),
  sorcerer: icon(GiMagicSwirl),
  warlock: icon(GiWarlockEye),
  // Moves and tags
  move: icon(GiRollingDices),
  "class-move": icon(GiWingedSword),
  tag: icon(GiPriceTag),
  character: IconCharacters,
  note: IconNotes,
  map: IconMap,
} satisfies Record<string, Icon>;

export type EntryIconName = keyof typeof ENTRY_ICONS

const KIND_ICON: Record<EntryKind, EntryIconName> = { item: 'bag', move: 'move', class: 'hero', tag: 'tag', option: 'books' }

/** The icon for an entry: the one it names, or its kind's. */
export function entryIcon(kind: EntryKind, name?: string): Icon {
  return (name && ENTRY_ICONS[name as EntryIconName]) || ENTRY_ICONS[KIND_ICON[kind]]
}

/** SVG markup for the same bundled icon used in lists, ready for a canvas texture. */
export function entryIconSvg(name?: string): string {
  const Icon = (name && ENTRY_ICONS[name as EntryIconName]) || ENTRY_ICONS.bag
  const host = document.createElement('span')
  render(<Icon size={128} />, host)
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('Could not render entry icon')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', '128')
  svg.setAttribute('height', '128')
  svg.setAttribute('fill', '#ffffff')
  svg.style.color = '#ffffff'
  for (const shape of svg.querySelectorAll('[fill="currentColor"]')) shape.setAttribute('fill', '#ffffff')
  const markup = svg.outerHTML
  render(null, host)
  return markup
}
