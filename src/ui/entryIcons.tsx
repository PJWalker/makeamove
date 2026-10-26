import type { EntryKind } from '../library'
import { icon, type Icon } from './icons'

/*
 * Icons for library entries and inventory items. Icons are bundled at build
 * time, so systems and plugins pick from this vocabulary by name (an item's
 * or class's `icon`) rather than shipping their own. Anything unnamed or
 * unknown gets its kind's icon. Game-icons.net, CC BY 3.0.
 */

import GiAnkh from '~icons/game-icons/ankh'
import GiArrowFlights from '~icons/game-icons/arrow-flights'
import GiBattleAxe from '~icons/game-icons/battle-axe'
import GiBookPile from '~icons/game-icons/book-pile'
import GiBowArrow from '~icons/game-icons/bow-arrow'
import GiBroadsword from '~icons/game-icons/broadsword'
import GiChainMail from '~icons/game-icons/chain-mail'
import GiCheckedShield from '~icons/game-icons/checked-shield'
import GiCloakDagger from '~icons/game-icons/cloak-dagger'
import GiGladius from '~icons/game-icons/gladius'
import GiHalberd from '~icons/game-icons/halberd'
import GiHamShank from '~icons/game-icons/ham-shank'
import GiHealthPotion from '~icons/game-icons/health-potion'
import GiHerbsBundle from '~icons/game-icons/herbs-bundle'
import GiHolySymbol from '~icons/game-icons/holy-symbol'
import GiKnapsack from '~icons/game-icons/knapsack'
import GiLockpicks from '~icons/game-icons/lockpicks'
import GiLyre from '~icons/game-icons/lyre'
import GiOakLeaf from '~icons/game-icons/oak-leaf'
import GiPointyHat from '~icons/game-icons/pointy-hat'
import GiPowderBag from '~icons/game-icons/powder-bag'
import GiPriceTag from '~icons/game-icons/price-tag'
import GiRollingDices from '~icons/game-icons/rolling-dices'
import GiRopeCoil from '~icons/game-icons/rope-coil'
import GiRoundShield from '~icons/game-icons/round-shield'
import GiScaleMail from '~icons/game-icons/scale-mail'
import GiSpears from '~icons/game-icons/spears'
import GiSpellBook from '~icons/game-icons/spell-book'
import GiStiletto from '~icons/game-icons/stiletto'
import GiSwordman from '~icons/game-icons/swordman'
import GiVisoredHelm from '~icons/game-icons/visored-helm'
import GiWingedSword from '~icons/game-icons/winged-sword'

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
  'scale-armor': icon(GiScaleMail),
  shield: icon(GiRoundShield),
  'holy-symbol': icon(GiHolySymbol),
  spellbook: icon(GiSpellBook),
  tools: icon(GiLockpicks),
  bag: icon(GiKnapsack),
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
  // Moves and tags
  move: icon(GiRollingDices),
  'class-move': icon(GiWingedSword),
  tag: icon(GiPriceTag),
} satisfies Record<string, Icon>

export type EntryIconName = keyof typeof ENTRY_ICONS

const KIND_ICON: Record<EntryKind, EntryIconName> = { item: 'bag', move: 'move', class: 'hero', tag: 'tag' }

/** The icon for an entry: the one it names, or its kind's. */
export function entryIcon(kind: EntryKind, name?: string): Icon {
  return (name && ENTRY_ICONS[name as EntryIconName]) || ENTRY_ICONS[KIND_ICON[kind]]
}
