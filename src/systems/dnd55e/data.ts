import type { ConditionDef, ItemDef, TagDef, TargetSpec } from '../types'

/*
 * D&D 5th edition, 2024 rules ("5.5e"): the tables. Rules text is a condensed
 * paraphrase of the System Reference Document 5.2 (Wizards of the Coast),
 * used under CC BY 4.0. https://creativecommons.org/licenses/by/4.0/
 *
 * The formulas that read these tables are in index.ts.
 */

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export const ABILITIES: { id: Ability; name: string; abbr: string }[] = [
  { id: 'str', name: 'Strength', abbr: 'STR' },
  { id: 'dex', name: 'Dexterity', abbr: 'DEX' },
  { id: 'con', name: 'Constitution', abbr: 'CON' },
  { id: 'int', name: 'Intelligence', abbr: 'INT' },
  { id: 'wis', name: 'Wisdom', abbr: 'WIS' },
  { id: 'cha', name: 'Charisma', abbr: 'CHA' },
]

export const SKILLS: { id: string; name: string; ability: Ability }[] = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
]

/** How a class casts spells: full casters, half casters (Paladin, Ranger) or Pact Magic. */
export type Caster = 'full' | 'half' | 'pact'

export interface DndClass {
  id: string
  name: string
  hitDie: number
  saves: [Ability, Ability]
  /** Its spellcasting ability, for classes that cast. */
  casting?: Ability
  caster?: Caster
  blurb: string
  icon: string
}

export const CLASSES: DndClass[] = [
  { id: 'barbarian', name: 'Barbarian', hitDie: 12, saves: ['str', 'con'], blurb: 'A fierce warrior fuelled by primal Rage.', icon: 'barbarian' },
  { id: 'bard', name: 'Bard', hitDie: 8, saves: ['dex', 'cha'], casting: 'cha', caster: 'full', blurb: 'A performer whose words and music carry magic.', icon: 'bard' },
  { id: 'cleric', name: 'Cleric', hitDie: 8, saves: ['wis', 'cha'], casting: 'wis', caster: 'full', blurb: 'A priest who channels the power of a god.', icon: 'cleric' },
  { id: 'druid', name: 'Druid', hitDie: 8, saves: ['int', 'wis'], casting: 'wis', caster: 'full', blurb: 'A keeper of the old faith who takes the shapes of beasts.', icon: 'druid' },
  { id: 'fighter', name: 'Fighter', hitDie: 10, saves: ['str', 'con'], blurb: 'A master of weapons, armour and tactics.', icon: 'fighter' },
  { id: 'monk', name: 'Monk', hitDie: 8, saves: ['str', 'dex'], blurb: 'A martial artist who channels Focus through body and mind.', icon: 'monk' },
  { id: 'paladin', name: 'Paladin', hitDie: 10, saves: ['wis', 'cha'], casting: 'cha', caster: 'half', blurb: 'A holy warrior bound by a sacred oath.', icon: 'paladin' },
  { id: 'ranger', name: 'Ranger', hitDie: 10, saves: ['str', 'dex'], casting: 'wis', caster: 'half', blurb: 'A wanderer of the wilds who hunts with blade, bow and spell.', icon: 'ranger' },
  { id: 'rogue', name: 'Rogue', hitDie: 8, saves: ['dex', 'int'], blurb: 'A scoundrel who strikes where it hurts with Sneak Attack.', icon: 'thief' },
  { id: 'sorcerer', name: 'Sorcerer', hitDie: 6, saves: ['con', 'cha'], casting: 'cha', caster: 'full', blurb: 'A spellcaster with magic in the blood, shaped with Sorcery Points.', icon: 'sorcerer' },
  { id: 'warlock', name: 'Warlock', hitDie: 8, saves: ['wis', 'cha'], casting: 'cha', caster: 'pact', blurb: 'A seeker of hidden lore, granted magic by an otherworldly patron.', icon: 'warlock' },
  { id: 'wizard', name: 'Wizard', hitDie: 6, saves: ['int', 'wis'], casting: 'int', caster: 'full', blurb: 'A scholar of the arcane who learns spells from a spellbook.', icon: 'wizard' },
]

/** Spell slots by full-caster level (index 0 is level 1), each a list by spell level. */
export const FULL_CASTER_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

/** Experience points needed for each level (index 0 is level 1). */
export const XP_FOR_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
  305000, 355000,
]

/* Actions anyone can take in combat (Rules Glossary). */

export interface TextAction {
  id: string
  name: string
  trigger: string
  text: string
}

export const ACTIONS: TextAction[] = [
  { id: 'dash', name: 'Dash', trigger: 'Action', text: 'For the rest of the turn, gain extra movement equal to your Speed.' },
  { id: 'disengage', name: 'Disengage', trigger: 'Action', text: 'Your movement doesn’t provoke Opportunity Attacks for the rest of the turn.' },
  { id: 'dodge', name: 'Dodge', trigger: 'Action', text: 'Until the start of your next turn, attack rolls against you have Disadvantage if you can see the attacker, and you make Dexterity saving throws with Advantage. You lose this if you’re Incapacitated or your Speed is 0.' },
  { id: 'help', name: 'Help', trigger: 'Action', text: 'Help an ally with an ability check (you must be proficient in the skill or tool), giving their next check Advantage, or distract an enemy within 5 feet so the next attack roll an ally makes against it has Advantage.' },
  { id: 'hide', name: 'Hide', trigger: 'Action', text: 'While heavily obscured or behind cover, out of any enemy’s line of sight, make a DC 15 Dexterity (Stealth) check. On a success you have the Invisible condition until you make noise, attack, cast a spell with a Verbal component, or an enemy finds you.' },
  { id: 'influence', name: 'Influence', trigger: 'Action', text: 'Urge a creature to do something with a Charisma (Deception, Intimidation, Performance or Persuasion) or Wisdom (Animal Handling) check. The DM sets the DC from the creature’s attitude: usually 15, or the creature’s Intelligence score if higher.' },
  { id: 'magic', name: 'Magic', trigger: 'Action', text: 'Cast a spell with a casting time of an action, use a magic item, or use a magical feature.' },
  { id: 'ready', name: 'Ready', trigger: 'Action', text: 'Choose a trigger and an action (or your movement) to take in response, using your Reaction when the trigger happens before the start of your next turn. A readied spell needs Concentration until it’s released.' },
  { id: 'search', name: 'Search', trigger: 'Action', text: 'Make a Wisdom check to notice something: Insight to read a creature, Medicine to diagnose, Perception to spot something hidden, or Survival to follow tracks.' },
  { id: 'study', name: 'Study', trigger: 'Action', text: 'Make an Intelligence check to recall or work something out: Arcana, History, Investigation, Nature or Religion.' },
  { id: 'utilize', name: 'Utilize', trigger: 'Action', text: 'Use a nonmagical object, such as opening a door or lighting a torch.' },
]

/* Class features, by the level each class gains them. */

export interface Feature {
  id: string
  name: string
  /** Which classes have it, and from what level. */
  classes: Record<string, number>
  trigger: string
  text: string
  /** A follow-up to roll, by id (see FEATURE_ROLLS in index.ts). */
  roll?: string
  target?: TargetSpec
}

export const FEATURES: Feature[] = [
  { id: 'rage', name: 'Rage', classes: { barbarian: 1 }, trigger: 'Bonus Action, while not wearing Heavy armour', text: 'Enter a Rage for up to 10 minutes. While raging you have Resistance to Bludgeoning, Piercing and Slashing damage; you add your Rage Damage bonus to Strength-based weapon damage; and you have Advantage on Strength checks and saving throws. You can’t cast or concentrate on spells. It ends early if you don Heavy armour or are Incapacitated, and you extend it each turn by attacking, forcing a save, or taking a Bonus Action. Uses: Rage, regaining one on a Short Rest and all on a Long Rest.' },
  { id: 'reckless-attack', name: 'Reckless Attack', classes: { barbarian: 2 }, trigger: 'When you make your first attack roll on your turn', text: 'You gain Advantage on attack rolls using Strength until the start of your next turn, but attack rolls against you have Advantage too.' },
  { id: 'danger-sense', name: 'Danger Sense', classes: { barbarian: 2 }, trigger: 'Passive', text: 'You have Advantage on Dexterity saving throws unless you’re Incapacitated.' },
  { id: 'bardic-inspiration', name: 'Bardic Inspiration', classes: { bard: 1 }, trigger: 'Bonus Action, a creature within 60 feet who can see or hear you', text: 'Give a creature a Bardic Inspiration die. Once within the next hour, when it fails a d20 test, it can roll the die and add it, which might turn the failure into a success. Uses equal your Charisma modifier (at least one), regained on a Long Rest (and on a Short Rest from level 5).', roll: 'bardic' },
  { id: 'jack-of-all-trades', name: 'Jack of All Trades', classes: { bard: 2 }, trigger: 'Passive', text: 'You add half your Proficiency Bonus, rounded down, to any ability check that uses a skill you aren’t proficient in.' },
  { id: 'divine-spark', name: 'Channel Divinity: Divine Spark', classes: { cleric: 2 }, trigger: 'Magic action, a creature within 30 feet', text: 'Point your Holy Symbol at a creature and roll 1d8, adding your Wisdom modifier. Either restore that many Hit Points to it, or it makes a Constitution saving throw and takes that much Necrotic or Radiant damage on a failure (half on a success). The die grows to 2d8 at level 7, 3d8 at 13 and 4d8 at 18.', roll: 'divine-spark', target: { prompt: 'Target a creature within 30 feet', min: 1, max: 1, range: { normal: 30 } } },
  { id: 'turn-undead', name: 'Channel Divinity: Turn Undead', classes: { cleric: 2 }, trigger: 'Magic action', text: 'Each Undead of your choice within 30 feet makes a Wisdom saving throw. On a failure it has the Frightened and Incapacitated conditions for 1 minute, trying to move as far from you as it can. It ends if the creature takes damage.' },
  { id: 'wild-shape', name: 'Wild Shape', classes: { druid: 2 }, trigger: 'Bonus Action', text: 'Shape-shift into a Beast form you have learned, for a number of hours equal to half your Druid level. You keep your personality, memories and mental scores, gain Temporary Hit Points equal to your Druid level, and can’t cast spells. Uses: Wild Shape, regaining one on a Short Rest and all on a Long Rest.' },
  { id: 'second-wind', name: 'Second Wind', classes: { fighter: 1 }, trigger: 'Bonus Action', text: 'Draw on a reserve of stamina to regain Hit Points equal to 1d10 plus your Fighter level. Uses: Second Wind, regaining one on a Short Rest and all on a Long Rest.', roll: 'second-wind' },
  { id: 'action-surge', name: 'Action Surge', classes: { fighter: 2 }, trigger: 'On your turn', text: 'Take one additional action, except the Magic action. Once per Short or Long Rest (twice from level 17, but only once on the same turn).' },
  { id: 'extra-attack', name: 'Extra Attack', classes: { barbarian: 5, fighter: 5, monk: 5, paladin: 5, ranger: 5 }, trigger: 'When you take the Attack action', text: 'You can attack twice instead of once. (Fighters attack three times from level 11 and four times from level 20.)' },
  { id: 'martial-arts', name: 'Martial Arts', classes: { monk: 1 }, trigger: 'While unarmed or wielding only Monk weapons, and unarmoured with no Shield', text: 'You can make an Unarmed Strike as a Bonus Action; you can use Dexterity instead of Strength for attack and damage rolls with Unarmed Strikes and Monk weapons; and you can roll your Martial Arts die in place of their normal damage.', roll: 'martial-arts' },
  { id: 'flurry-of-blows', name: 'Flurry of Blows', classes: { monk: 2 }, trigger: 'Bonus Action, spending 1 Focus Point', text: 'Make two Unarmed Strikes.' },
  { id: 'patient-defense', name: 'Patient Defense', classes: { monk: 2 }, trigger: 'Bonus Action', text: 'Take the Disengage action; or spend 1 Focus Point to take both the Disengage and Dodge actions.' },
  { id: 'step-of-the-wind', name: 'Step of the Wind', classes: { monk: 2 }, trigger: 'Bonus Action', text: 'Take the Dash action; or spend 1 Focus Point to take both the Disengage and Dash actions, with your jump distance doubled.' },
  { id: 'stunning-strike', name: 'Stunning Strike', classes: { monk: 5 }, trigger: 'Once per turn, when you hit with a Monk weapon or Unarmed Strike', text: 'Spend 1 Focus Point. The target makes a Constitution saving throw against your Focus save DC (8 + Wisdom modifier + Proficiency Bonus). On a failure it has the Stunned condition until the start of your next turn; on a success its Speed is halved and the next attack roll against it has Advantage.' },
  { id: 'lay-on-hands', name: 'Lay on Hands', classes: { paladin: 1 }, trigger: 'Bonus Action, touching a creature', text: 'Draw from your pool of healing (five times your Paladin level, refilled on a Long Rest) to restore that many Hit Points, or spend 5 from the pool to remove the Poisoned condition.' },
  { id: 'favored-enemy', name: 'Favored Enemy', classes: { ranger: 1 }, trigger: 'Passive', text: 'You always have Hunter’s Mark prepared, and can cast it twice without a spell slot, regaining these uses on a Long Rest.' },
  { id: 'sneak-attack', name: 'Sneak Attack', classes: { rogue: 1 }, trigger: 'Once per turn, when you hit with a Finesse or Ranged weapon', text: 'Deal extra damage when you have Advantage on the attack roll, or when an ally of the target is within 5 feet of it and you don’t have Disadvantage. The extra damage is 1d6 per two Rogue levels, rounded up.', roll: 'sneak-attack' },
  { id: 'cunning-action', name: 'Cunning Action', classes: { rogue: 2 }, trigger: 'Bonus Action', text: 'Take the Dash, Disengage or Hide action.' },
  { id: 'uncanny-dodge', name: 'Uncanny Dodge', classes: { rogue: 5 }, trigger: 'Reaction, when an attacker you can see hits you', text: 'Halve the attack’s damage against you.' },
  { id: 'innate-sorcery', name: 'Innate Sorcery', classes: { sorcerer: 1 }, trigger: 'Bonus Action', text: 'For 1 minute, your sorcerer spells’ save DC rises by 1 and you have Advantage on their attack rolls. Twice per Long Rest.' },
  { id: 'font-of-magic', name: 'Font of Magic', classes: { sorcerer: 2 }, trigger: 'Bonus Action', text: 'Turn an expended spell slot into Sorcery Points equal to its level, or spend Sorcery Points to make a slot: 2 for level 1, 3 for level 2, 5 for level 3, 6 for level 4, 7 for level 5.' },
  { id: 'metamagic', name: 'Metamagic', classes: { sorcerer: 2 }, trigger: 'When you cast a spell', text: 'Spend Sorcery Points to twist the spell with one of your Metamagic options, such as Quickened Spell (2 points: cast it as a Bonus Action) or Twinned Spell (1 point: raise its effective level to add another target).' },
  { id: 'eldritch-invocations', name: 'Eldritch Invocations', classes: { warlock: 1 }, trigger: 'Passive', text: 'You know fragments of forbidden knowledge, such as Agonizing Blast (add your Charisma modifier to a cantrip’s damage) or Pact of the Blade.' },
  { id: 'magical-cunning', name: 'Magical Cunning', classes: { warlock: 2 }, trigger: '1 minute, once per Long Rest', text: 'Perform an esoteric rite to regain expended Pact Magic slots, up to half your maximum (rounded up).' },
  { id: 'arcane-recovery', name: 'Arcane Recovery', classes: { wizard: 1 }, trigger: 'When you finish a Short Rest, once per Long Rest', text: 'Recover expended spell slots whose combined level is up to half your Wizard level (rounded up), none of them level 6 or higher.' },
]

/* Spells. */

export interface Spell {
  id: string
  name: string
  /** 0 for cantrips. */
  level: number
  classes: string[]
  /** Casting time, range and duration, in a line. */
  trigger: string
  text: string
  /** A spell attack, rolled against the target's AC. */
  attack?: boolean
  /** Damage or healing dice: count per die (scaled for cantrips), and whether the spellcasting modifier adds. */
  roll?: { label: 'damage' | 'healing'; type?: string; count: number; die: number; plus?: number; mod?: boolean; scales?: boolean }
  /** The saving throw each target makes against the caster's spell save DC. */
  save?: Ability
  target?: TargetSpec
}

const one = (prompt: string, range: number): TargetSpec => ({ prompt, min: 1, max: 1, range: { normal: range } })

export const SPELLS: Spell[] = [
  // Cantrips
  { id: 'fire-bolt', name: 'Fire Bolt', level: 0, classes: ['sorcerer', 'wizard'], trigger: 'Action · 120 feet · Instantaneous', text: 'Hurl a mote of fire at a creature or object. Make a ranged spell attack; on a hit it takes 1d10 Fire damage, and a flammable object that isn’t worn or carried starts burning. The damage grows by 1d10 at levels 5, 11 and 17.', attack: true, roll: { label: 'damage', type: 'fire', count: 1, die: 10, scales: true }, target: one('Target a creature within 120 feet', 120) },
  { id: 'ray-of-frost', name: 'Ray of Frost', level: 0, classes: ['sorcerer', 'wizard'], trigger: 'Action · 60 feet · Instantaneous', text: 'A frigid beam streaks toward a creature. Make a ranged spell attack; on a hit it takes 1d8 Cold damage and its Speed drops by 10 feet until the start of your next turn. The damage grows by 1d8 at levels 5, 11 and 17.', attack: true, roll: { label: 'damage', type: 'cold', count: 1, die: 8, scales: true }, target: one('Target a creature within 60 feet', 60) },
  { id: 'chill-touch', name: 'Chill Touch', level: 0, classes: ['sorcerer', 'warlock', 'wizard'], trigger: 'Action · Touch · Instantaneous', text: 'Make a melee spell attack against a creature. On a hit it takes 1d10 Necrotic damage and can’t regain Hit Points until the end of your next turn. The damage grows by 1d10 at levels 5, 11 and 17.', attack: true, roll: { label: 'damage', type: 'necrotic', count: 1, die: 10, scales: true }, target: one('Target the creature you touch', 5) },
  { id: 'eldritch-blast', name: 'Eldritch Blast', level: 0, classes: ['warlock'], trigger: 'Action · 120 feet · Instantaneous', text: 'A beam of crackling energy. Make a ranged spell attack; on a hit the target takes 1d10 Force damage. You make two beams at level 5, three at 11 and four at 17, aimed at one target or several, with a separate attack roll for each.', attack: true, roll: { label: 'damage', type: 'force', count: 1, die: 10 }, target: one('Target a creature within 120 feet', 120) },
  { id: 'produce-flame', name: 'Produce Flame', level: 0, classes: ['druid'], trigger: 'Bonus Action · Self · 10 minutes', text: 'A flame in your hand sheds Bright Light in a 20-foot radius. Until the spell ends, you can take a Magic action to hurl it at a creature within 60 feet: make a ranged spell attack, dealing 1d8 Fire damage on a hit. The damage grows by 1d8 at levels 5, 11 and 17.', attack: true, roll: { label: 'damage', type: 'fire', count: 1, die: 8, scales: true }, target: one('Target a creature within 60 feet', 60) },
  { id: 'sacred-flame', name: 'Sacred Flame', level: 0, classes: ['cleric'], trigger: 'Action · 60 feet · Instantaneous', text: 'Flame-like radiance descends on a creature you can see. It makes a Dexterity saving throw against your spell save DC, taking 1d8 Radiant damage on a failure; it gains no benefit from Half Cover or Three-Quarters Cover for this save. The damage grows by 1d8 at levels 5, 11 and 17.', roll: { label: 'damage', type: 'radiant', count: 1, die: 8, scales: true }, target: one('Target a creature within 60 feet', 60), save: 'dex' },
  { id: 'vicious-mockery', name: 'Vicious Mockery', level: 0, classes: ['bard'], trigger: 'Action · 60 feet · Instantaneous', text: 'Unleash a string of insults laced with enchantment. The creature makes a Wisdom saving throw; on a failure it takes 1d6 Psychic damage and has Disadvantage on its next attack roll before the end of its next turn. The damage grows by 1d6 at levels 5, 11 and 17.', roll: { label: 'damage', type: 'psychic', count: 1, die: 6, scales: true }, target: one('Target a creature within 60 feet', 60), save: 'wis' },
  { id: 'guidance', name: 'Guidance', level: 0, classes: ['cleric', 'druid'], trigger: 'Action · Touch · Concentration, up to 1 minute', text: 'Touch a willing creature and choose a skill. Until the spell ends, it adds 1d4 to any ability check using that skill.' },
  { id: 'light', name: 'Light', level: 0, classes: ['bard', 'cleric', 'sorcerer', 'wizard'], trigger: 'Action · Touch · 1 hour', text: 'An object you touch sheds Bright Light in a 20-foot radius and Dim Light for 20 feet beyond, in a colour you choose. Covering it blocks the light. Casting it again ends the earlier spell.' },
  { id: 'mage-hand', name: 'Mage Hand', level: 0, classes: ['bard', 'sorcerer', 'warlock', 'wizard'], trigger: 'Action · 30 feet · 1 minute', text: 'A spectral hand appears within range. As a Magic action you can move it up to 30 feet and use it to manipulate an object, open an unlocked door or container, or stow or retrieve an item. It can’t attack, activate magic items or carry more than 10 pounds.' },
  // Level 1
  { id: 'bless', name: 'Bless', level: 1, classes: ['cleric', 'paladin'], trigger: 'Action · 30 feet · Concentration, up to 1 minute', text: 'Bless up to three creatures. Whenever one of them makes an attack roll or a saving throw before the spell ends, it adds 1d4. With a higher-level slot, bless one more creature per slot level above 1.', target: { prompt: 'Target up to three creatures within 30 feet', min: 1, max: 3, range: { normal: 30 } } },
  { id: 'burning-hands', name: 'Burning Hands', level: 1, classes: ['sorcerer', 'wizard'], trigger: 'Action · Self (15-foot cone) · Instantaneous', text: 'Flames shoot from your fingertips. Each creature in a 15-foot cone makes a Dexterity saving throw, taking 3d6 Fire damage on a failure or half on a success. Flammable objects in the cone start burning. +1d6 per slot level above 1.', roll: { label: 'damage', type: 'fire', count: 3, die: 6 }, save: 'dex' },
  { id: 'cure-wounds', name: 'Cure Wounds', level: 1, classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'], trigger: 'Action · Touch · Instantaneous', text: 'A creature you touch regains Hit Points equal to 2d8 plus your spellcasting ability modifier. +2d8 per slot level above 1.', roll: { label: 'healing', type: 'healing', count: 2, die: 8, mod: true }, target: one('Target the creature you touch', 5) },
  { id: 'detect-magic', name: 'Detect Magic', level: 1, classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'wizard'], trigger: 'Action or Ritual · Self · Concentration, up to 10 minutes', text: 'You sense magic within 30 feet. While it lasts you can take a Magic action to see a faint aura around any visible creature or object there that bears magic, and learn its school of magic if any.' },
  { id: 'divine-smite', name: 'Divine Smite', level: 1, classes: ['paladin'], trigger: 'Bonus Action, right after you hit with a melee weapon or Unarmed Strike', text: 'The target takes an extra 2d8 Radiant damage, plus 1d8 if it’s a Fiend or Undead. +1d8 per slot level above 1.', roll: { label: 'damage', type: 'radiant', count: 2, die: 8 } },
  { id: 'guiding-bolt', name: 'Guiding Bolt', level: 1, classes: ['cleric'], trigger: 'Action · 120 feet · 1 round', text: 'A flash of light streaks toward a creature. Make a ranged spell attack; on a hit it takes 4d6 Radiant damage, and the next attack roll against it before the end of your next turn has Advantage. +1d6 per slot level above 1.', attack: true, roll: { label: 'damage', type: 'radiant', count: 4, die: 6 }, target: one('Target a creature within 120 feet', 120) },
  { id: 'healing-word', name: 'Healing Word', level: 1, classes: ['bard', 'cleric', 'druid'], trigger: 'Bonus Action · 60 feet · Instantaneous', text: 'A creature you can see regains Hit Points equal to 2d4 plus your spellcasting ability modifier. +2d4 per slot level above 1.', roll: { label: 'healing', type: 'healing', count: 2, die: 4, mod: true }, target: one('Target a creature within 60 feet', 60) },
  { id: 'hunters-mark', name: 'Hunter’s Mark', level: 1, classes: ['ranger'], trigger: 'Bonus Action · 90 feet · Concentration, up to 1 hour', text: 'Magically mark a creature as your quarry. Until the spell ends, you deal an extra 1d6 Force damage whenever you hit it with an attack roll, and you have Advantage on Wisdom (Perception or Survival) checks to find it. If it drops to 0 Hit Points, you can move the mark to a new creature as a Bonus Action.', roll: { label: 'damage', type: 'force', count: 1, die: 6 }, target: one('Target a creature within 90 feet', 90) },
  { id: 'magic-missile', name: 'Magic Missile', level: 1, classes: ['sorcerer', 'wizard'], trigger: 'Action · 120 feet · Instantaneous', text: 'Three glowing darts each hit a creature of your choice that you can see, for 1d4 + 1 Force damage each. The darts strike at once, at one creature or several. One more dart per slot level above 1.', roll: { label: 'damage', type: 'force', count: 3, die: 4, plus: 3 }, target: { prompt: 'Target up to three creatures within 120 feet', min: 1, max: 3, range: { normal: 120 } } },
  { id: 'shield', name: 'Shield', level: 1, classes: ['sorcerer', 'wizard'], trigger: 'Reaction, when you are hit by an attack or targeted by Magic Missile', text: 'An invisible barrier appears: until the start of your next turn you have +5 to AC, including against the triggering attack, and take no damage from Magic Missile.' },
  { id: 'thunderwave', name: 'Thunderwave', level: 1, classes: ['bard', 'druid', 'sorcerer', 'wizard'], trigger: 'Action · Self (15-foot cube) · Instantaneous', text: 'A wave of thunderous force. Each creature in a 15-foot cube from you makes a Constitution saving throw: on a failure it takes 2d8 Thunder damage and is pushed 10 feet away; on a success, half damage and no push. The boom is audible 300 feet away. +1d8 per slot level above 1.', roll: { label: 'damage', type: 'thunder', count: 2, die: 8 }, save: 'con' },
  // Level 2
  { id: 'hold-person', name: 'Hold Person', level: 2, classes: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'], trigger: 'Action · 60 feet · Concentration, up to 1 minute', text: 'A Humanoid you can see makes a Wisdom saving throw or has the Paralyzed condition until the spell ends. It repeats the save at the end of each of its turns, ending the spell on a success. One more Humanoid per slot level above 2.', target: one('Target a Humanoid within 60 feet', 60), save: 'wis' },
  { id: 'misty-step', name: 'Misty Step', level: 2, classes: ['sorcerer', 'warlock', 'wizard'], trigger: 'Bonus Action · Self · Instantaneous', text: 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.' },
  { id: 'scorching-ray', name: 'Scorching Ray', level: 2, classes: ['sorcerer', 'wizard'], trigger: 'Action · 120 feet · Instantaneous', text: 'Hurl three fiery rays at one target or several. Make a ranged spell attack for each; each ray that hits deals 2d6 Fire damage. One more ray per slot level above 2.', attack: true, roll: { label: 'damage', type: 'fire', count: 2, die: 6 }, target: one('Target a creature within 120 feet', 120) },
  { id: 'spiritual-weapon', name: 'Spiritual Weapon', level: 2, classes: ['cleric'], trigger: 'Bonus Action · 60 feet · Concentration, up to 1 minute', text: 'A floating spectral weapon appears within range. When you cast it, and as a Bonus Action on later turns, you can move it up to 20 feet and make a melee spell attack against a creature within 5 feet of it, dealing Force damage equal to 1d8 plus your spellcasting ability modifier. +1d8 per slot level above 2.', attack: true, roll: { label: 'damage', type: 'force', count: 1, die: 8, mod: true }, target: one('Target a creature near your weapon', 60) },
  // Level 3
  { id: 'counterspell', name: 'Counterspell', level: 3, classes: ['sorcerer', 'warlock', 'wizard'], trigger: 'Reaction, when you see a creature within 60 feet casting a spell', text: 'The caster makes a Constitution saving throw. On a failure the spell dissipates with no effect, and the action and slot it would have used aren’t spent.' },
  { id: 'fireball', name: 'Fireball', level: 3, classes: ['sorcerer', 'wizard'], trigger: 'Action · 150 feet · Instantaneous', text: 'A bead of fire blossoms into a 20-foot-radius sphere of flame. Each creature in it makes a Dexterity saving throw, taking 8d6 Fire damage on a failure or half on a success. Flammable objects in the area that aren’t worn or carried start burning. +1d6 per slot level above 3.', roll: { label: 'damage', type: 'fire', count: 8, die: 6 }, save: 'dex' },
  { id: 'lightning-bolt', name: 'Lightning Bolt', level: 3, classes: ['sorcerer', 'wizard'], trigger: 'Action · Self (100-foot line) · Instantaneous', text: 'A stroke of lightning 100 feet long and 5 feet wide blasts out from you. Each creature in the line makes a Dexterity saving throw, taking 8d6 Lightning damage on a failure or half on a success. +1d6 per slot level above 3.', roll: { label: 'damage', type: 'lightning', count: 8, die: 6 }, save: 'dex' },
  { id: 'revivify', name: 'Revivify', level: 3, classes: ['cleric', 'druid', 'paladin', 'ranger'], trigger: 'Action · Touch · Instantaneous (a diamond worth 300+ GP, consumed)', text: 'Touch a creature that has died within the last minute. It returns to life with 1 Hit Point. This can’t revive a creature that died of old age, nor restore missing body parts.' },
]

/* Gear. Weapons set the damage die of the weapon in hand; armour sets the AC calculation. */

const weapon = (
  id: string,
  name: string,
  count: number,
  die: number,
  type: string,
  weight: number,
  tags: string[],
  icon: string,
): ItemDef => ({
  id,
  name,
  description: `${count}d${die} ${type}`,
  weight,
  tags,
  equippable: true,
  active: 'equipped',
  effects: [
    { type: 'modify', path: 'weaponDice', op: 'set', value: count },
    { type: 'modify', path: 'weaponDie', op: 'set', value: die },
  ],
  icon,
})

const armour = (
  id: string,
  name: string,
  base: number,
  dexCap: number | null,
  weight: number,
  tags: string[],
  icon: string,
): ItemDef => ({
  id,
  name,
  description: `AC ${base}${dexCap === null ? ' + Dexterity modifier' : dexCap > 0 ? ` + Dexterity modifier (max ${dexCap})` : ''}, while worn.`,
  weight,
  tags,
  equippable: true,
  active: 'equipped',
  effects: [
    { type: 'modify', path: 'armorBase', op: 'set', value: base },
    { type: 'modify', path: 'armorWorn', op: 'set', value: 1 },
    ...(dexCap === null ? [] : [{ type: 'modify' as const, path: 'dexCap', op: 'set' as const, value: dexCap }]),
  ],
  icon,
})

const SAVE_ACTIONS = ABILITIES.map((a) => `save-${a.id}`)

export const ITEMS: ItemDef[] = [
  // Simple weapons
  weapon('club', 'Club', 1, 4, 'Bludgeoning', 2, ['light', 'slow'], 'mace'),
  weapon('dagger', 'Dagger', 1, 4, 'Piercing', 1, ['finesse', 'light', 'thrown', 'nick'], 'dagger'),
  weapon('handaxe', 'Handaxe', 1, 6, 'Slashing', 2, ['light', 'thrown', 'vex'], 'axe'),
  weapon('javelin', 'Javelin', 1, 6, 'Piercing', 2, ['thrown', 'slow'], 'spear'),
  weapon('mace', 'Mace', 1, 6, 'Bludgeoning', 4, ['sap'], 'mace'),
  weapon('quarterstaff', 'Quarterstaff', 1, 6, 'Bludgeoning', 4, ['versatile', 'topple'], 'staff'),
  weapon('spear', 'Spear', 1, 6, 'Piercing', 3, ['thrown', 'versatile', 'sap'], 'spear'),
  weapon('light-crossbow', 'Light Crossbow', 1, 8, 'Piercing', 5, ['ammunition', 'loading', 'two-handed', 'slow'], 'crossbow'),
  weapon('shortbow', 'Shortbow', 1, 6, 'Piercing', 2, ['ammunition', 'two-handed', 'vex'], 'bow'),
  // Martial weapons
  weapon('battleaxe', 'Battleaxe', 1, 8, 'Slashing', 4, ['versatile', 'topple'], 'axe'),
  weapon('flail', 'Flail', 1, 8, 'Bludgeoning', 2, ['sap'], 'flail'),
  weapon('glaive', 'Glaive', 1, 10, 'Slashing', 6, ['heavy', 'reach', 'two-handed', 'graze'], 'polearm'),
  weapon('greataxe', 'Greataxe', 1, 12, 'Slashing', 7, ['heavy', 'two-handed', 'cleave'], 'axe'),
  weapon('greatsword', 'Greatsword', 2, 6, 'Slashing', 6, ['heavy', 'two-handed', 'graze'], 'longsword'),
  weapon('halberd', 'Halberd', 1, 10, 'Slashing', 6, ['heavy', 'reach', 'two-handed', 'cleave'], 'polearm'),
  weapon('longsword', 'Longsword', 1, 8, 'Slashing', 3, ['versatile', 'sap'], 'longsword'),
  weapon('maul', 'Maul', 2, 6, 'Bludgeoning', 10, ['heavy', 'two-handed', 'topple'], 'hammer'),
  weapon('rapier', 'Rapier', 1, 8, 'Piercing', 2, ['finesse', 'vex'], 'rapier'),
  weapon('scimitar', 'Scimitar', 1, 6, 'Slashing', 3, ['finesse', 'light', 'nick'], 'sword'),
  weapon('shortsword', 'Shortsword', 1, 6, 'Piercing', 2, ['finesse', 'light', 'vex'], 'sword'),
  weapon('warhammer', 'Warhammer', 1, 8, 'Bludgeoning', 5, ['versatile', 'push'], 'hammer'),
  weapon('hand-crossbow', 'Hand Crossbow', 1, 6, 'Piercing', 3, ['ammunition', 'light', 'loading', 'vex'], 'crossbow'),
  weapon('heavy-crossbow', 'Heavy Crossbow', 1, 10, 'Piercing', 18, ['ammunition', 'heavy', 'loading', 'two-handed', 'push'], 'crossbow'),
  weapon('longbow', 'Longbow', 1, 8, 'Piercing', 2, ['ammunition', 'heavy', 'two-handed', 'slow'], 'bow'),
  // Armour
  armour('padded-armor', 'Padded Armor', 11, null, 8, ['light-armor', 'stealth-disadvantage'], 'leather-armor'),
  armour('leather-armor', 'Leather Armor', 11, null, 10, ['light-armor'], 'leather-armor'),
  armour('studded-leather', 'Studded Leather Armor', 12, null, 13, ['light-armor'], 'leather-armor'),
  armour('hide-armor', 'Hide Armor', 12, 2, 12, ['medium-armor'], 'leather-armor'),
  armour('chain-shirt', 'Chain Shirt', 13, 2, 20, ['medium-armor'], 'chainmail'),
  armour('scale-mail', 'Scale Mail', 14, 2, 45, ['medium-armor', 'stealth-disadvantage'], 'scale-armor'),
  armour('breastplate', 'Breastplate', 14, 2, 20, ['medium-armor'], 'breastplate'),
  armour('half-plate', 'Half Plate Armor', 15, 2, 40, ['medium-armor', 'stealth-disadvantage'], 'breastplate'),
  armour('ring-mail', 'Ring Mail', 14, 0, 40, ['heavy-armor', 'stealth-disadvantage'], 'chainmail'),
  armour('chain-mail', 'Chain Mail', 16, 0, 55, ['heavy-armor', 'stealth-disadvantage'], 'chainmail'),
  armour('splint-armor', 'Splint Armor', 17, 0, 60, ['heavy-armor', 'stealth-disadvantage'], 'scale-armor'),
  armour('plate-armor', 'Plate Armor', 18, 0, 65, ['heavy-armor', 'stealth-disadvantage'], 'breastplate'),
  {
    id: 'shield',
    name: 'Shield',
    description: '+2 AC while carried in one hand.',
    weight: 6,
    tags: ['shield'],
    equippable: true,
    active: 'equipped',
    effects: [
      { type: 'modify', path: 'acBonus', op: 'add', value: 2 },
      { type: 'modify', path: 'shieldWorn', op: 'set', value: 1 },
    ],
    icon: 'shield',
  },
  // Adventuring gear
  { id: 'arrows', name: 'Arrows (20)', description: 'Ammunition for a bow. Recover half the spent ones after a fight.', weight: 1, uses: 20, tags: [], icon: 'arrows' },
  { id: 'bolts', name: 'Bolts (20)', description: 'Ammunition for a crossbow.', weight: 1.5, uses: 20, tags: [], icon: 'arrows' },
  { id: 'backpack', name: 'Backpack', description: 'Holds up to 30 pounds of gear.', weight: 5, tags: [], icon: 'bag' },
  { id: 'bedroll', name: 'Bedroll', description: 'Sleep in it outdoors.', weight: 7, tags: [], icon: 'bag' },
  { id: 'rations', name: 'Rations (5 days)', description: 'Travel food; each use is a day’s worth.', weight: 10, uses: 5, tags: [], icon: 'rations' },
  { id: 'rope', name: 'Rope (50 feet)', description: 'Hemp rope. Bursting it takes a DC 20 Strength (Athletics) check.', weight: 5, tags: [], icon: 'gear' },
  { id: 'torch', name: 'Torch', description: 'Burns for 1 hour, shedding Bright Light in a 20-foot radius.', weight: 1, uses: 1, tags: [], icon: 'torch' },
  { id: 'healers-kit', name: 'Healer’s Kit', description: 'Spend a use to stabilise a creature at 0 Hit Points without a Wisdom (Medicine) check.', weight: 3, uses: 10, tags: [], icon: 'herbs' },
  { id: 'thieves-tools', name: 'Thieves’ Tools', description: 'Pick locks and disarm traps (Dexterity).', weight: 1, tags: [], icon: 'tools' },
  { id: 'arcane-focus', name: 'Arcane Focus', description: 'A crystal, orb, rod, staff or wand: a Sorcerer’s, Warlock’s or Wizard’s spellcasting focus.', weight: 1, tags: ['focus'], icon: 'wand' },
  { id: 'holy-symbol', name: 'Holy Symbol', description: 'A Cleric’s or Paladin’s spellcasting focus.', weight: 1, tags: ['focus'], icon: 'holy-symbol' },
  { id: 'druidic-focus', name: 'Druidic Focus', description: 'A sprig of mistletoe, a wooden staff or a yew wand: a Druid’s or Ranger’s spellcasting focus.', weight: 0, tags: ['focus'], icon: 'staff' },
  { id: 'spellbook', name: 'Spellbook', description: 'A Wizard’s book of spells.', weight: 3, tags: [], icon: 'spellbook' },
  // Magic items
  { id: 'potion-of-healing', name: 'Potion of Healing', description: 'Drink it (a Bonus Action) to regain 2d4 + 2 Hit Points.', weight: 0.5, uses: 1, tags: ['potion', 'magic'], icon: 'potion' },
  {
    id: 'ring-of-protection',
    name: 'Ring of Protection',
    description: '+1 to AC and saving throws while worn (needs attunement).',
    weight: 0,
    tags: ['magic', 'attunement'],
    equippable: true,
    active: 'equipped',
    effects: [
      { type: 'modify', path: 'acBonus', op: 'add', value: 1 },
      { type: 'rollBonus', moves: SAVE_ACTIONS, value: 1 },
    ],
    icon: 'ring',
  },
  {
    id: 'cloak-of-protection',
    name: 'Cloak of Protection',
    description: '+1 to AC and saving throws while worn (needs attunement).',
    weight: 1,
    tags: ['magic', 'attunement'],
    equippable: true,
    active: 'equipped',
    effects: [
      { type: 'modify', path: 'acBonus', op: 'add', value: 1 },
      { type: 'rollBonus', moves: SAVE_ACTIONS, value: 1 },
    ],
    icon: 'cloak',
  },
  {
    id: 'gauntlets-of-ogre-power',
    name: 'Gauntlets of Ogre Power',
    description: 'Your Strength score is 19 while you wear them, unless it’s already higher (needs attunement).',
    weight: 2,
    tags: ['magic', 'attunement'],
    equippable: true,
    active: 'equipped',
    effects: [{ type: 'modify', path: 'str', op: 'min', value: 19 }],
    icon: 'gauntlet',
  },
  {
    id: 'longsword-plus-1',
    name: 'Longsword +1',
    description: '1d8 Slashing. +1 to attack and damage rolls made with this magic weapon.',
    weight: 3,
    tags: ['versatile', 'sap', 'magic'],
    equippable: true,
    active: 'equipped',
    effects: [
      { type: 'modify', path: 'weaponDice', op: 'set', value: 1 },
      { type: 'modify', path: 'weaponDie', op: 'set', value: 8 },
      { type: 'modify', path: 'weaponBonus', op: 'add', value: 1 },
      { type: 'rollBonus', moves: ['melee-attack', 'finesse-attack'], value: 1 },
    ],
    icon: 'longsword',
  },
  { id: 'wand-of-magic-missiles', name: 'Wand of Magic Missiles', description: 'Spend 1 to 3 charges to cast Magic Missile, its level rising by one per charge after the first. Regains 1d6 + 1 charges at dawn.', weight: 1, uses: 7, tags: ['magic'], icon: 'wand' },
]

export const TAGS: TagDef[] = [
  { id: 'finesse', name: 'Finesse', text: 'Use Strength or Dexterity for the attack and damage rolls (the same one for both).' },
  { id: 'light', name: 'Light', text: 'When you attack with it, you can make one extra attack as a Bonus Action with a different Light weapon, without adding your ability modifier to its damage unless it’s negative.' },
  { id: 'heavy', name: 'Heavy', text: 'Disadvantage on attack rolls with it if your Strength (melee) or Dexterity (ranged) is under 13.' },
  { id: 'two-handed', name: 'Two-Handed', text: 'Needs two hands when you attack with it.' },
  { id: 'versatile', name: 'Versatile', text: 'Can be used with one or two hands; used with two, its damage die is one size bigger.' },
  { id: 'thrown', name: 'Thrown', text: 'Can be thrown to make a ranged attack, using the same ability as for melee attacks with it.' },
  { id: 'ammunition', name: 'Ammunition', text: 'Each attack expends a piece of ammunition; after a fight you can recover half of what you used.' },
  { id: 'loading', name: 'Loading', text: 'You can fire only one piece of ammunition per action, Bonus Action or Reaction.' },
  { id: 'reach', name: 'Reach', text: 'Adds 5 feet to your reach when you attack with it, and for Opportunity Attacks.' },
  { id: 'cleave', name: 'Cleave (mastery)', text: 'When you hit, you can make another attack against a second creature within 5 feet of the first. Once per turn; its damage doesn’t add your ability modifier.' },
  { id: 'graze', name: 'Graze (mastery)', text: 'When you miss, the target still takes damage equal to your ability modifier.' },
  { id: 'nick', name: 'Nick (mastery)', text: 'The extra attack from the Light property can be part of the Attack action instead of a Bonus Action. Once per turn.' },
  { id: 'push', name: 'Push (mastery)', text: 'When you hit, you can push a Large or smaller creature up to 10 feet straight away from you.' },
  { id: 'sap', name: 'Sap (mastery)', text: 'When you hit, the creature has Disadvantage on its next attack roll before the start of your next turn.' },
  { id: 'slow', name: 'Slow (mastery)', text: 'When you hit and deal damage, the creature’s Speed drops by 10 feet until the start of your next turn.' },
  { id: 'topple', name: 'Topple (mastery)', text: 'When you hit, the creature makes a Constitution saving throw (DC 8 + the attack’s ability modifier + your Proficiency Bonus) or has the Prone condition.' },
  { id: 'vex', name: 'Vex (mastery)', text: 'When you hit and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn.' },
  { id: 'light-armor', name: 'Light Armor', text: 'AC adds your full Dexterity modifier. Takes 1 minute to don or doff.' },
  { id: 'medium-armor', name: 'Medium Armor', text: 'AC adds your Dexterity modifier, up to 2. Takes 5 minutes to don, 1 to doff.' },
  { id: 'heavy-armor', name: 'Heavy Armor', text: 'AC doesn’t add Dexterity. Some need a Strength score to avoid a 10-foot Speed penalty. Takes 10 minutes to don, 5 to doff.' },
  { id: 'stealth-disadvantage', name: 'Stealth Disadvantage', text: 'Disadvantage on Dexterity (Stealth) checks while you wear it.' },
  { id: 'shield', name: 'Shield', text: '+2 AC. Takes a Utilize action to don or doff.' },
  { id: 'focus', name: 'Spellcasting Focus', text: 'Can stand in for a spell’s Material components that have no cost.' },
  { id: 'potion', name: 'Potion', text: 'Drinking it, or giving it to another creature, takes a Bonus Action.' },
  { id: 'magic', name: 'Magic', text: 'A magic item.' },
  { id: 'attunement', name: 'Attunement', text: 'Needs a Short Rest spent focused on it to attune; a creature can be attuned to at most three items.' },
]

/** Conditions (Rules Glossary). Most work by Advantage and Disadvantage, so the table applies them from the text. */
export const CONDITIONS: ConditionDef[] = [
  { id: 'blinded', name: 'Blinded', text: 'You can’t see and automatically fail checks that need sight. Attack rolls against you have Advantage; yours have Disadvantage.', effects: [] },
  { id: 'charmed', name: 'Charmed', text: 'You can’t attack the charmer or target it with damaging abilities or effects, and it has Advantage on checks to interact with you socially.', effects: [] },
  { id: 'deafened', name: 'Deafened', text: 'You can’t hear and automatically fail checks that need hearing.', effects: [] },
  { id: 'frightened', name: 'Frightened', text: 'Disadvantage on ability checks and attack rolls while the source of your fear is in sight, and you can’t willingly move closer to it.', effects: [] },
  { id: 'grappled', name: 'Grappled', text: 'Your Speed is 0. Disadvantage on attack rolls against anyone but the grappler. The grappler can drag you along at extra movement cost.', effects: [{ type: 'modify', path: 'speed', op: 'set', value: 0 }] },
  { id: 'incapacitated', name: 'Incapacitated', text: 'You can’t take any action, Bonus Action or Reaction, your Concentration is broken, you can’t speak, and you roll Initiative with Disadvantage.', effects: [] },
  { id: 'invisible', name: 'Invisible', text: 'You can’t be seen, so you aren’t affected by effects that need sight. You roll Initiative with Advantage; attack rolls against you have Disadvantage, and yours have Advantage.', effects: [] },
  { id: 'paralyzed', name: 'Paralyzed', text: 'Incapacitated, and your Speed is 0. You fail Strength and Dexterity saving throws. Attack rolls against you have Advantage, and any hit from within 5 feet is a Critical Hit.', effects: [{ type: 'modify', path: 'speed', op: 'set', value: 0 }] },
  { id: 'petrified', name: 'Petrified', text: 'Turned to stone: Incapacitated, Speed 0, Resistance to all damage, immune to Poisoned. You fail Strength and Dexterity saving throws, and attack rolls against you have Advantage.', effects: [{ type: 'modify', path: 'speed', op: 'set', value: 0 }] },
  { id: 'poisoned', name: 'Poisoned', text: 'Disadvantage on attack rolls and ability checks.', effects: [] },
  { id: 'prone', name: 'Prone', text: 'You can only crawl, or spend half your Speed to stand. Your attack rolls have Disadvantage. Attack rolls against you have Advantage from within 5 feet, Disadvantage from further away.', effects: [] },
  { id: 'restrained', name: 'Restrained', text: 'Your Speed is 0. Attack rolls against you have Advantage; yours have Disadvantage, and so do your Dexterity saving throws.', effects: [{ type: 'modify', path: 'speed', op: 'set', value: 0 }] },
  { id: 'stunned', name: 'Stunned', text: 'Incapacitated. You fail Strength and Dexterity saving throws, and attack rolls against you have Advantage.', effects: [] },
  { id: 'unconscious', name: 'Unconscious', text: 'Incapacitated and Prone, Speed 0, and you drop what you’re holding. You fail Strength and Dexterity saving throws; attack rolls against you have Advantage, and any hit from within 5 feet is a Critical Hit.', effects: [{ type: 'modify', path: 'speed', op: 'set', value: 0 }] },
]
