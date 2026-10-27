import type { Effect, OptionDef, TargetSpec } from '../types'
import type { Ability } from './data'

/*
 * D&D 5.5e character origins and growth from the SRD 5.2: species,
 * backgrounds, feats and subclasses. Condensed paraphrase, used under
 * CC BY 4.0; check the SRD for exact wording.
 *
 * Each is an option the guided creation and level-up flow offers (see
 * CreationDef). What the formulas need from them (a species' Speed, a
 * feat's bonus) is in the extra fields read by index.ts.
 */

export interface Species extends OptionDef {
  speed: number
  size: 'small' | 'medium'
  /** Effects that always apply. */
  effects?: Effect[]
  /** Hit point maximum added per character level (Dwarven Toughness). */
  hpPerLevel?: number
}

export const SPECIES: Species[] = [
  { id: 'dragonborn', name: 'Dragonborn', speed: 30, size: 'medium', text: 'Draconic Ancestry picks a damage type. Breath Weapon: replace an attack with a 15-foot cone or 30-foot line; each creature in it makes a Dexterity save (DC 8 + Con modifier + Proficiency Bonus), taking 1d10 of that type on a failure, half on a success (more dice at levels 5, 11 and 17), Proficiency Bonus times per Long Rest. Damage Resistance to that type. Darkvision 60 feet. Draconic Flight from level 5.' },
  { id: 'dwarf', name: 'Dwarf', speed: 30, size: 'medium', hpPerLevel: 1, text: 'Darkvision 120 feet. Dwarven Resilience: Resistance to Poison damage and Advantage on saves against Poisoned. Dwarven Toughness: +1 Hit Point maximum per level. Stonecunning: Tremorsense 60 feet as a Bonus Action while on stone, Proficiency Bonus times per Long Rest.' },
  { id: 'elf', name: 'Elf', speed: 30, size: 'medium', text: 'Darkvision 60 feet. Elven Lineage (Drow, High Elf or Wood Elf) grants a cantrip and later spells. Fey Ancestry: Advantage on saves against Charmed. Keen Senses: proficiency in Insight, Perception or Survival. Trance: a Long Rest takes 4 hours.' },
  { id: 'gnome', name: 'Gnome', speed: 30, size: 'small', text: 'Darkvision 60 feet. Gnomish Cunning: Advantage on Intelligence, Wisdom and Charisma saves. Gnomish Lineage (Forest or Rock Gnome) grants cantrips and a spell.' },
  { id: 'goliath', name: 'Goliath', speed: 35, size: 'medium', text: 'Giant Ancestry: a boon such as Cloud’s Jaunt, Fire’s Burn or Stone’s Endurance, Proficiency Bonus times per Long Rest. Large Form from level 5. Powerful Build: Advantage on ending the Grappled condition, and count as one size larger for carrying.' },
  { id: 'halfling', name: 'Halfling', speed: 30, size: 'small', text: 'Brave: Advantage on saves against Frightened. Halfling Nimbleness: move through the space of a creature larger than you. Luck: reroll a 1 on a d20 Test. Naturally Stealthy: hide behind a creature larger than you.' },
  { id: 'human', name: 'Human', speed: 30, size: 'medium', text: 'Resourceful: gain Heroic Inspiration after each Long Rest. Skillful: one skill proficiency. Versatile: an Origin feat of your choice.' },
  { id: 'orc', name: 'Orc', speed: 30, size: 'medium', text: 'Adrenaline Rush: Dash as a Bonus Action and gain Temporary Hit Points equal to your Proficiency Bonus, Proficiency Bonus times per Short or Long Rest. Darkvision 120 feet. Relentless Endurance: drop to 1 Hit Point instead of 0, once per Long Rest.' },
  { id: 'tiefling', name: 'Tiefling', speed: 30, size: 'medium', text: 'Darkvision 60 feet. Fiendish Legacy (Abyssal, Chthonic or Infernal) grants a Resistance, a cantrip and later spells. Otherworldly Presence: the Thaumaturgy cantrip.' },
]

export interface Background extends OptionDef {
  /** The Origin feat it gives. */
  feat: string
}

/** A background's increases: +2 and +1 to two of its three abilities, or +1 to all three. */
const BOOST = [
  [2, 1, 0],
  [1, 1, 1],
]

const skills = (...ids: string[]) => Object.fromEntries(ids.map((id) => [`skill:${id}`, 1]))

export const BACKGROUNDS: Background[] = [
  { id: 'acolyte', name: 'Acolyte', feat: 'magic-initiate', boost: { stats: ['int', 'wis', 'cha'], amounts: BOOST }, grants: skills('insight', 'religion'), text: 'You served in a temple. Skills: Insight and Religion. Feat: Magic Initiate (Cleric). Tools: Calligrapher’s Supplies.' },
  { id: 'criminal', name: 'Criminal', feat: 'alert', boost: { stats: ['dex', 'con', 'int'], amounts: BOOST }, grants: skills('sleight-of-hand', 'stealth'), text: 'You lived outside the law. Skills: Sleight of Hand and Stealth. Feat: Alert. Tools: Thieves’ Tools.' },
  { id: 'sage', name: 'Sage', feat: 'magic-initiate', boost: { stats: ['con', 'int', 'wis'], amounts: BOOST }, grants: skills('arcana', 'history'), text: 'You studied in libraries and halls of learning. Skills: Arcana and History. Feat: Magic Initiate (Wizard). Tools: Calligrapher’s Supplies.' },
  { id: 'soldier', name: 'Soldier', feat: 'savage-attacker', boost: { stats: ['str', 'dex', 'con'], amounts: BOOST }, grants: skills('athletics', 'intimidation'), text: 'You trained for war. Skills: Athletics and Intimidation. Feat: Savage Attacker. Tools: a gaming set.' },
]

export interface Feat extends OptionDef {
  category: 'origin' | 'general' | 'fighting-style' | 'epic'
  /** Effects that always apply. */
  effects?: Effect[]
  /** Hit point maximum added per character level (Tough). */
  hpPerLevel?: number
  /** Proficiency Bonus added to initiative (Alert). */
  initiativeProf?: boolean
}

export const FEATS: Feat[] = [
  { id: 'alert', name: 'Alert', category: 'origin', initiativeProf: true, text: 'Add your Proficiency Bonus to Initiative rolls, and you can swap your Initiative with a willing ally’s.' },
  { id: 'magic-initiate', name: 'Magic Initiate', category: 'origin', text: 'Learn two cantrips and one level 1 spell from the Cleric, Druid or Wizard list. You can cast the spell once per Long Rest without a slot.' },
  { id: 'savage-attacker', name: 'Savage Attacker', category: 'origin', text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  { id: 'skilled', name: 'Skilled', category: 'origin', text: 'Gain proficiency in any combination of three skills or tools.' },
  { id: 'tough', name: 'Tough', category: 'origin', hpPerLevel: 2, text: 'Your Hit Point maximum increases by twice your character level.' },
  { id: 'grappler', name: 'Grappler', category: 'general', text: 'Ability Score Increase: Strength or Dexterity +1. Punch and Grab: once per turn, deal Unarmed Strike damage and grapple with one attack. Advantage on attacks against creatures you’re grappling.' },
  { id: 'war-caster', name: 'War Caster', category: 'general', text: 'Ability Score Increase: Intelligence, Wisdom or Charisma +1. Advantage on Constitution saves to keep Concentration; cast a spell as an Opportunity Attack; perform somatic components with your hands full.' },
  { id: 'archery', name: 'Archery', category: 'fighting-style', text: 'You gain a +2 bonus to attack rolls you make with Ranged weapons.' },
  { id: 'defense', name: 'Defense', category: 'fighting-style', text: 'While wearing Light, Medium or Heavy armour, you gain a +1 bonus to Armor Class.' },
  { id: 'great-weapon-fighting', name: 'Great Weapon Fighting', category: 'fighting-style', text: 'When you roll damage for a two-handed or versatile melee weapon held in two hands, treat any 1 or 2 on a damage die as a 3.' },
  { id: 'two-weapon-fighting', name: 'Two-Weapon Fighting', category: 'fighting-style', text: 'When you make an extra attack from the Light property, add your ability modifier to its damage.' },
]

export interface Subclass extends OptionDef {
  classId: string
}

export const SUBCLASSES: Subclass[] = [
  { id: 'berserker', classId: 'barbarian', name: 'Path of the Berserker', text: 'Frenzy: while raging, if you use Reckless Attack, the first target you hit takes extra damage (d6s equal to your Rage Damage bonus). Mindless Rage from level 6.' },
  { id: 'lore', classId: 'bard', name: 'College of Lore', text: 'Bonus Proficiencies in three skills. Cutting Words: as a Reaction, spend Bardic Inspiration to subtract the die from a creature’s attack roll, check or damage roll.' },
  { id: 'life', classId: 'cleric', name: 'Life Domain', text: 'Disciple of Life: healing spells restore an extra 2 + the spell’s level. Life Domain Spells always prepared. Preserve Life: Channel Divinity to restore HP equal to five times your Cleric level, split among creatures.' },
  { id: 'land', classId: 'druid', name: 'Circle of the Land', text: 'Circle of the Land Spells by your chosen land (arid, polar, temperate, tropical). Land’s Aid: Channel Wild Shape to deal 2d6 Necrotic damage in a sphere (Con save) and heal one creature 2d6.' },
  { id: 'champion', classId: 'fighter', name: 'Champion', text: 'Improved Critical: your weapon and Unarmed Strike attacks score a Critical Hit on a roll of 19 or 20. Remarkable Athlete: Advantage on Initiative and Strength (Athletics) checks.' },
  { id: 'open-hand', classId: 'monk', name: 'Warrior of the Open Hand', text: 'Open Hand Technique: when you hit with Flurry of Blows, impose Addle, Push (Str save or pushed 15 ft) or Topple (Dex save or Prone).' },
  { id: 'devotion', classId: 'paladin', name: 'Oath of Devotion', text: 'Oath of Devotion Spells always prepared. Sacred Weapon: Channel Divinity to add your Charisma modifier to attack rolls with a weapon for 10 minutes; it sheds light and deals Radiant damage if you choose.' },
  { id: 'hunter', classId: 'ranger', name: 'Hunter', text: 'Hunter’s Lore: know a marked creature’s immunities, resistances and vulnerabilities. Hunter’s Prey: Colossus Slayer (extra 1d8 to a wounded target once per turn) or Horde Breaker.' },
  { id: 'thief', classId: 'rogue', name: 'Thief', text: 'Fast Hands: Cunning Action can Sleight of Hand, use Thieves’ Tools, or Utilize. Second-Story Work: climb at full Speed and jump farther.' },
  { id: 'draconic', classId: 'sorcerer', name: 'Draconic Sorcery', text: 'Draconic Resilience: +1 Hit Point maximum per Sorcerer level, and AC 10 + Dex + Cha without armour. Draconic Spells always prepared.' },
  { id: 'fiend', classId: 'warlock', name: 'Fiend Patron', text: 'Dark One’s Blessing: when you reduce an enemy to 0 HP, gain Temporary Hit Points equal to your Charisma modifier + Warlock level. Fiend Spells always prepared.' },
  { id: 'evoker', classId: 'wizard', name: 'Evoker', text: 'Evocation Savant: add two Evocation spells to your spellbook for free. Potent Cantrip: a cantrip that misses or is saved against still deals half damage.' },
]

/** The level every class picks its subclass. */
export const SUBCLASS_LEVEL = 3

/** Levels that give an Ability Score Improvement (or a feat instead). */
export const IMPROVEMENT_LEVELS = [4, 8, 12, 16, 19]

/** Species traits that are actions. */
export interface SpeciesAction {
  id: string
  species: string
  name: string
  trigger: string
  text: string
  /** Ability for its save, against 8 + Con modifier + Proficiency Bonus. */
  save?: Ability
  target?: TargetSpec
}

export const SPECIES_ACTIONS: SpeciesAction[] = [
  { id: 'breath-weapon', species: 'dragonborn', name: 'Breath Weapon', trigger: 'Replaces one attack · 15-foot cone or 30-foot line', text: 'Each creature in the area makes a Dexterity saving throw (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 damage of your ancestry’s type on a failure, or half on a success. 2d10 at level 5, 3d10 at 11, 4d10 at 17. Proficiency Bonus times per Long Rest.', save: 'dex', target: { prompt: 'Target each creature in the area', min: 1, area: { shape: 'cone', size: 15 } } },
  { id: 'adrenaline-rush', species: 'orc', name: 'Adrenaline Rush', trigger: 'Bonus Action', text: 'Take the Dash action and gain Temporary Hit Points equal to your Proficiency Bonus. Proficiency Bonus times per Short or Long Rest.' },
  { id: 'stonecunning', species: 'dwarf', name: 'Stonecunning', trigger: 'Bonus Action, on or touching stone', text: 'Gain Tremorsense with a range of 60 feet for 10 minutes. Proficiency Bonus times per Long Rest.' },
  { id: 'luck', species: 'halfling', name: 'Luck', trigger: 'When you roll a 1 on a d20 Test', text: 'Reroll the die, and use the new roll.' },
]
