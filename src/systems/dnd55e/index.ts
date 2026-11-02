import type { CharacterView } from '../../characters/store'
import { formatCommaList, parseCommaList } from '../../lib/list'

import { resolveEffects, type EffectSource } from '../effects'
import type { ActionDef, AreaSpec, CheckStep, DamageTypeDef, Derived, FollowUpDef, GameSystem, ResourceDef, RollContext, SaveStep, TargetSpec } from '../types'
import {
  ABILITIES,
  ACTIONS,
  CLASSES,
  CONDITIONS,
  FEATURES,
  FULL_CASTER_SLOTS,
  ITEMS,
  PREPARATION_COUNTS,
  SKILLS,
  SPELLS,
  TAGS,
  XP_FOR_LEVEL,
  type Ability,
  type DndClass,
  type Spell,
} from './data'
import { BACKGROUNDS, FEATS, IMPROVEMENT_LEVELS, SPECIES, SPECIES_ACTIONS, SUBCLASSES, SUBCLASS_LEVEL } from './origins'
import { SRD_SPELLS } from './srdSpells'
import { SRD_MONSTERS } from './srdMonsters'
import { SRD_MAGIC_ITEMS } from './srdMagicItems'
import { SRD_CLASS_FEATURES } from './srdClasses'

/*
 * D&D 5th edition, 2024 rules ("5.5e"), from the SRD 5.2: the formulas, and
 * the tables in data.ts turned into the core's actions. Every check is a d20
 * test: 1d20 plus an ability modifier, plus proficiency where it applies, read
 * against a DC or AC the table knows. The card names a natural 20 or 1.
 */

export const modifierOf = (score: number) => Math.floor((score - 10) / 2)

/** Proficiency Bonus by character level. */
export const proficiencyAt = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)

/** Cantrip dice by character level: one more at 5, 11 and 17. */
const cantripDice = (level: number) => 1 + (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0)

/** By level, from a table of (from-level, value) steps: `stepped(7, [[1, 2], [3, 3], [6, 4]])` is 4. */
const stepped = (level: number, steps: [number, number][]) => steps.reduce((v, [from, n]) => (level >= from ? n : v), 0)

const classOf = (c: CharacterView): DndClass =>
  CLASSES.find((k) => k.id === c.data.classId) ?? (CLASSES)[0]!;

const SPELLS_ALL: Spell[] = [...new Map([...SRD_SPELLS, ...SPELLS.map((spell) => ({ ...SRD_SPELLS.find((entry) => entry.id === spell.id), ...spell }))].map((spell) => [spell.id, spell])).values()]
const FEATURES_ALL = [...FEATURES, ...SRD_CLASS_FEATURES.filter((feature) => !FEATURES.some((existing) => existing.name === feature.name && Object.entries(feature.classes).some(([id, level]) => existing.classes[id] === level)))]

const clampLevel = (level: number) => Math.min(20, Math.max(1, level))
const levelOf = (c: CharacterView) => clampLevel(Number(c.data.level ?? 1));

/** Spell slots by spell level (1–9) for a class at a level; Pact Magic is apart. */
export function spellSlots(cls: DndClass, level: number): number[] {
  const casterLevel = cls.caster === 'full' ? level : cls.caster === 'half' ? Math.ceil(level / 2) : 0
  return casterLevel ? (FULL_CASTER_SLOTS[clampLevel(casterLevel) - 1] ?? []) : []
}

/** A Warlock's Pact Magic: how many slots, and their level. */
export function pactMagic(level: number): { slots: number; level: number } {
  return {
    slots: stepped(level, [[1, 1], [2, 2], [11, 3], [17, 4]]),
    level: Math.min(5, Math.ceil(level / 2)),
  }
}

/** The highest spell level a character can cast, or 0. */
function highestSlot(cls: DndClass, level: number): number {
  if (cls.caster === 'pact') return pactMagic(level).level
  return spellSlots(cls, level).length
}

function spellList(character: CharacterView) {
  const cls = classOf(character)
  const level = levelOf(character)
  const lists = cls.id === 'bard' && level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : [cls.id]
  return character.kind === 'pc' && cls.casting ? SPELLS_ALL.filter((spell) => spell.classes.some((id) => lists.includes(id)) && spell.level <= highestSlot(cls, level)) : []
}

const spellOptions = SPELLS_ALL.map((spell) => ({ id: spell.id, name: spell.name, text: `${spell.level ? `Level ${spell.level}` : 'Cantrip'} · ${spell.trigger}\n${spell.text}` }))
const selectedIds = (character: CharacterView, field: string, max = Infinity) => parseCommaList(String(character.data[field] ?? '')).filter(Boolean).slice(0, max)

const criticalThreshold = (context?: RollContext) => context?.action.category === 'attack' && context.character?.data.subclass === 'champion' && levelOf(context.character) >= 3 ? levelOf(context.character) >= 15 ? 18 : 19 : 20

function startingSpells(classId: string) {
  const recommendations: Record<string, string[]> = {
    bard: ['charm-person', 'color-spray', 'faerie-fire', 'healing-word'], cleric: ['bless', 'cure-wounds', 'guiding-bolt', 'shield-of-faith'],
    druid: ['animal-friendship', 'cure-wounds', 'faerie-fire', 'thunderwave'], paladin: ['bless', 'cure-wounds'], ranger: ['cure-wounds', 'ensnaring-strike'],
    sorcerer: ['burning-hands', 'shield'], warlock: ['charm-person', 'hex'], wizard: ['detect-magic', 'mage-armor', 'magic-missile', 'shield'],
  }
  const allowed = SPELLS_ALL.filter((spell) => spell.classes.includes(classId) && spell.level === 1)
  const initial = recommendations[classId]?.filter((id) => allowed.some((spell) => spell.id === id)) ?? []
  const count = PREPARATION_COUNTS[classId]?.[0] ?? 0
  const prepared = [...new Set([...initial, ...allowed.map((spell) => spell.id)])].slice(0, count)
  return { preparedSpells: formatCommaList(prepared), spellbook: classId === 'wizard' ? formatCommaList([...new Set([...prepared, 'feather-fall', 'sleep'])]) : '', knownCantrips: formatCommaList(SPELLS_ALL.filter((spell) => spell.classes.includes(classId) && !spell.level).slice(0, ['cleric', 'wizard'].includes(classId) ? 3 : classId === 'sorcerer' ? 4 : ['paladin', 'ranger'].includes(classId) ? 0 : 2).map((spell) => spell.id)) }
}

const signed = (n: number, label: string) => (n ? `${n < 0 ? '-' : '+'}${Math.abs(n)}[${label}]` : '')
const valueOf = (values: Record<string, number>, key: string) => values[key] ?? 0

/* Checks: one d20 test step each. */

const results = [
  { id: 'crit', label: 'Natural 20', tone: 'good' as const },
  { id: 'rolled', label: '' },
  { id: 'fumble', label: 'Natural 1', tone: 'bad' as const },
]

const CHECK_OUTCOMES = {
  crit: 'Compare the total with the DC. (A natural 20 isn’t an automatic success on an ability check or saving throw.)',
  rolled: 'Compare the total with the DC: equal or higher succeeds.',
  fumble: 'Compare the total with the DC. (A natural 1 isn’t an automatic failure on an ability check or saving throw.)',
}

const ATTACK_OUTCOMES = {
  crit: 'Critical Hit: it hits whatever the target’s AC, and the damage dice are rolled twice.',
  rolled: 'Hits if the total equals or beats the target’s AC.',
  fumble: 'A natural 1 always misses.',
}

const check = (step: Omit<CheckStep, 'kind' | 'outcomes'>, outcomes = CHECK_OUTCOMES): CheckStep => ({ kind: 'check', outcomes, ...step })

const abilityName = (a: Ability) => ABILITIES.find((x) => x.id === a)!.name

const ABILITY_CHECKS: ActionDef[] = ABILITIES.map((a) => ({
  id: `check-${a.id}`,
  name: `${a.name} Check`,
  category: 'check',
  trigger: `When the DM calls for a ${a.name} check that no skill covers`,
  text: `Roll 1d20 + your ${a.name} modifier against the DC.`,
  steps: [check({ stat: a.id, add: [{ value: 'jack', label: 'Jack of All Trades' }] })],
}))

const SAVES: ActionDef[] = ABILITIES.map((a) => ({
  id: `save-${a.id}`,
  name: `${a.name} Save`,
  category: 'save',
  trigger: `When an effect calls for a ${a.name} saving throw`,
  text: `Roll 1d20 + your ${a.name} modifier, plus your Proficiency Bonus if you’re proficient in ${a.name} saving throws, against the DC.`,
  steps: [check({ stat: a.id, add: [{ value: `save:${a.id}`, label: 'Prof' }] })],
}))

const SKILL_CHECKS: ActionDef[] = SKILLS.map((s) => ({
  id: `skill-${s.id}`,
  name: s.name,
  category: 'skill',
  trigger: `${abilityName(s.ability)} (${s.name}) check`,
  text: `Roll 1d20 + your ${abilityName(s.ability)} modifier, plus your Proficiency Bonus if you’re proficient in ${s.name} (twice it with Expertise), against the DC.`,
  steps: [check({ stat: s.ability, add: [{ value: `skill:${s.id}`, label: 'Prof' }] })],
}))

const COMBAT: ActionDef[] = [
  {
    id: 'initiative',
    name: 'Initiative',
    category: 'combat',
    trigger: 'When combat starts',
    text: 'Roll a Dexterity check; everyone acts in order from the highest total down.',
    steps: [check({ stat: 'dex', add: [{ value: 'initiativeBonus', label: 'Initiative' }] }, {
      crit: 'Your place in the turn order.',
      rolled: 'Your place in the turn order.',
      fumble: 'Your place in the turn order.',
    })],
  },
  {
    id: 'death-save',
    name: 'Death Saving Throw',
    category: 'combat',
    trigger: 'At the start of your turn while you have 0 Hit Points',
    text: 'Roll 1d20: 10 or higher is a success, lower a failure. Three successes and you’re Stable; three failures and you die. A natural 20 brings you back with 1 Hit Point; a natural 1 counts as two failures. Taking damage at 0 Hit Points is a failure (two for a Critical Hit).',
    steps: [
      check(
        {
          followUps: { rolled: ['death-success', 'death-failure'], fumble: ['death-failure-2'] },
        },
        {
          crit: 'You regain 1 Hit Point and wake.',
          rolled: '10 or higher is a success; lower is a failure.',
          fumble: 'Two failures.',
        },
      ),
    ],
  },
]

const ATTACKS: ActionDef[] = [
  {
    id: 'melee-attack',
    name: 'Melee Attack',
    category: 'attack',
    trigger: 'Attack action, with a melee weapon or an Unarmed Strike',
    text: 'Roll 1d20 + your Strength modifier + your Proficiency Bonus against the target’s AC. On a hit, roll the weapon’s damage plus your Strength modifier; an Unarmed Strike deals 1 + your Strength modifier.',
    target: { prompt: 'Target the creature you’re attacking', min: 1, max: 1 },
    steps: [check({ stat: 'str', add: [{ value: 'prof', label: 'Prof' }], difficulty: { kind: 'target', value: 'ac' }, followUps: { crit: ['crit-str'], rolled: ['damage-str'] } }, ATTACK_OUTCOMES)],
  },
  {
    id: 'finesse-attack',
    name: 'Finesse or Ranged Attack',
    category: 'attack',
    trigger: 'Attack action, with a Finesse or ranged weapon',
    text: 'Roll 1d20 + your Dexterity modifier + your Proficiency Bonus against the target’s AC. On a hit, roll the weapon’s damage plus your Dexterity modifier. Attacking at long range, or with a ranged weapon while an enemy is within 5 feet, has Disadvantage.',
    target: { prompt: 'Target the creature you’re attacking', min: 1, max: 1 },
    steps: [check({ stat: 'dex', add: [{ value: 'prof', label: 'Prof' }], difficulty: { kind: 'target', value: 'ac' }, followUps: { crit: ['crit-dex'], rolled: ['damage-dex'] } }, ATTACK_OUTCOMES)],
  },
]

const BASIC: ActionDef[] = ACTIONS.map((a) => ({ ...a, category: 'action', steps: [] }))

/** Rolls a feature offers, by the feature's `roll`. */
const FEATURE_ROLLS: FollowUpDef[] = [
  {
    id: "second-wind",
    kind: "roll",
    label: "Roll healing",
    comment: "Second Wind",
    formula: (c) => `1d10+${levelOf(c)}[Fighter level]`,
  },
  {
    id: "bardic",
    kind: "roll",
    label: "Roll the die",
    comment: "Bardic Inspiration",
    formula: (_c, d) => `1d${d.values.bardicDie}`,
  },
  {
    id: "divine-spark",
    kind: "roll",
    label: "Roll",
    comment: "Divine Spark",
    formula: (c, d) =>
      `${stepped(levelOf(c), [
        [1, 1],
        [7, 2],
        [13, 3],
        [18, 4],
      ])}d8${signed(valueOf(d.mods, "wis"), "WIS")}`,
  },
  {
    id: "martial-arts",
    kind: "roll",
    label: "Roll damage",
    comment: "Martial Arts",
    formula: (_c, d) => `1d${valueOf(d.values, "martialDie")}${signed(valueOf(d.mods, "dex"), "DEX")}`,
  },
  {
    id: "sneak-attack",
    kind: "roll",
    label: "Roll damage",
    comment: "Sneak Attack",
    formula: (c) => `${Math.ceil(levelOf(c) / 2)}d6`,
  },
];

const FEATURE_COSTS: Record<string, string> = { rage: 'rage', 'bardic-inspiration': 'bardic', 'divine-spark': 'channel', 'turn-undead': 'channel', 'wild-shape': 'wildShape', 'second-wind': 'secondWind', 'action-surge': 'actionSurge', 'flurry-of-blows': 'focus', 'stunning-strike': 'focus', 'innate-sorcery': 'innateSorcery' }
const FEATURE_ACTIONS: ActionDef[] = FEATURES_ALL.map((f) => {
  const resource = FEATURE_COSTS[f.id];
  return {
    id: f.id,
    name: f.name,
    category: 'class',
    trigger: f.trigger,
    text: f.text,
    ...(f.target ? { target: f.target } : {}),
    steps: [],
    ...(resource ? { costs: [{ resource, by: -1 }] } : {}),
    ...(f.roll ? { followUps: [f.roll] } : {}),
  };
});

/* Spells: a spell attack is a check; other spells are read out, with their dice as a follow-up. */

const spellRoll = (s: Spell, crit: boolean): FollowUpDef => {
  const r = s.roll!
  return {
    id: `spell-${s.id}${crit ? '-crit' : ''}`,
    kind: 'roll',
    damage: r.label === 'healing' ? 'healing' : (r.type ?? 'damage'),
    label: crit ? 'Roll critical damage' : r.label === 'healing' ? 'Roll healing' : 'Roll damage',
    comment: s.name,
    formula: (c, d) => {
      const extraLevels = Math.max(0, (d.values.spellSlot ?? s.level) - s.level)
      const extraDice = s.upcastDice ?? Number(s.text.match(/\+(\d+)d\d+ per slot level above/i)?.[1] ?? 0)
      const n = (r.count * (r.scales ? cantripDice(levelOf(c)) : 1) + extraLevels * extraDice) * (crit ? 2 : 1);
      return `${n}d${r.die}${r.plus ? `+${r.plus}` : ''}${r.mod ? signed(valueOf(d.values, 'castingMod'), 'Spellcasting') : ''}`
    },
  }
}

const SPELL_ROLLS: FollowUpDef[] = SPELLS_ALL.flatMap((s) => (!s.roll ? [] : s.attack ? [spellRoll(s, false), spellRoll(s, true)] : [spellRoll(s, false)]))

/** Spells with a save and no single target hit everyone in an area. */
const inArea = (area?: AreaSpec): TargetSpec => ({ prompt: 'Target each creature in the area', min: 1, ...(area ? { area } : {}) })

const saveStep = (s: Spell): SaveStep => ({
  kind: 'save',
  action: `save-${s.save}`,
  difficulty: { kind: 'derived', value: 'spellDc' },
  success: s.roll ? 'Half damage, or none for a cantrip.' : 'No effect.',
  failure: s.roll ? 'Full damage, and any other effect.' : 'The spell takes effect.',
})

function spellVariants(spell: Spell, character: CharacterView, derived: Derived) {
  const slots = Array.from({ length: 9 }, (_, index) => index + 1).filter((level) => level >= spell.level && (character.resources[`slot${level}`] ?? 0) > 0).map((level) => ({
    id: `slot-${level}`, label: `Level ${level} spell slot`, costs: [{ resource: `slot${level}`, by: -1 }], values: { spellSlot: level },
  }))
  const pactLevel = valueOf(derived.values, 'pactLevel');
  if (pactLevel >= spell.level && (character.resources.pact ?? 0) > 0)
    slots.push({ id: 'pact', label: `Level ${pactLevel} Pact Magic slot`, costs: [{ resource: 'pact', by: -1 }], values: { spellSlot: pactLevel } })
  if (spell.ritual) slots.push({ id: 'ritual', label: 'Ritual (+10 minutes)', costs: [], values: { spellSlot: spell.level } })
  return slots
}

const SPELL_ACTIONS: ActionDef[] = SPELLS_ALL.map((s) => ({
  id: s.id,
  name: s.name,
  category: 'spell',
  trigger: `${s.level ? `Level ${s.level}` : 'Cantrip'} · ${s.trigger}`,
  text: s.text,
  ...(s.level ? { variants: (character: CharacterView, derived: Derived) => spellVariants(s, character, derived) } : {}),
  tags: [s.level ? `level ${s.level}` : 'cantrip'],
  ...(s.target ? { target: s.target } : s.save || s.area ? { target: inArea(s.area) } : {}),
  ...(s.trigger.includes('Concentration') ? { concentration: true } : {}),
  steps: s.attack
    ? [
        check(
          {
            add: [{ value: 'spellAttack', label: 'Spell attack' }],
            difficulty: { kind: 'target', value: 'ac' },
            ...(s.roll ? { followUps: { crit: [`spell-${s.id}-crit`], rolled: [`spell-${s.id}`] } } : {}),
          },
          ATTACK_OUTCOMES,
        ),
      ]
    : s.save
      ? [saveStep(s)]
      : [],
  ...(!s.attack && s.roll ? { followUps: [`spell-${s.id}`] } : {}),
}))

/* Weapon damage: the equipped weapon's dice (or an Unarmed Strike's 1), the ability, and any magic bonus. */

function weaponDamage(d: Derived, ability: Ability, crit: boolean): string {
  const v = d.values
  const die = valueOf(v, 'weaponDie');
  const dice = die ? `${valueOf(v, 'weaponDice') * (crit ? 2 : 1)}d${die}` : '1[Unarmed]'
  return `${dice}${signed(valueOf(d.mods, ability), ability.toUpperCase())}${signed(valueOf(v, 'weaponBonus'), 'Magic')}`
}

const WEAPON_ROLLS: FollowUpDef[] = (['str', 'dex'] as const).flatMap((a): FollowUpDef[] => [
  { id: `damage-${a}`, kind: 'roll', label: 'Roll damage', comment: 'Damage', damage: 'damage', formula: (_c, d) => weaponDamage(d, a, false) },
  { id: `crit-${a}`, kind: 'roll', label: 'Roll critical damage', comment: 'Critical damage', damage: 'damage', formula: (_c, d) => weaponDamage(d, a, true) },
])

/* Subclasses: one action each, read out, from level 3. Species traits that are actions. */

const SUBCLASS_ACTIONS: ActionDef[] = SUBCLASSES.map((k) => ({
  id: `subclass-${k.id}`,
  name: k.name,
  category: "class",
  trigger: `Level ${SUBCLASS_LEVEL} subclass`,
  text: k.text,
  steps: [],
}));

const breathDice = (level: number) => stepped(level, [[1, 1], [5, 2], [11, 3], [17, 4]])

const SPECIES_ACTION_DEFS: ActionDef[] = SPECIES_ACTIONS.map((a) => ({
  id: a.id,
  name: a.name,
  category: 'species',
  trigger: a.trigger,
  text: a.text,
  ...(a.target ? { target: a.target } : {}),
  steps: a.save
    ? [{ kind: 'save', action: `save-${a.save}`, difficulty: { kind: 'derived', value: 'speciesDc' }, success: 'Half damage.', failure: 'Full damage.' }]
    : [],
  ...(a.id === 'breath-weapon' ? { followUps: ['breath-weapon'] } : {}),
}))

const SPECIES_ROLLS: FollowUpDef[] = [
  {
    id: "breath-weapon",
    kind: "roll",
    label: "Roll damage",
    comment: "Breath Weapon",
    damage: "damage",
    formula: (c) => `${breathDice(levelOf(c))}d10`,
  },
];

/** The character's feats, from the comma-separated data field. */
const featsOf = (c: CharacterView) =>
  parseCommaList(String(c.data.feats ?? ''))
    .filter(Boolean)
    .map((id) => FEATS.find((f) => f.id === id))
    .filter((f) => !!f)

const ACTIONS_ALL: ActionDef[] = [...SUBCLASS_ACTIONS, ...SPECIES_ACTION_DEFS, ...ATTACKS, ...SPELL_ACTIONS, ...FEATURE_ACTIONS, ...BASIC, ...COMBAT, ...SAVES, ...SKILL_CHECKS, ...ABILITY_CHECKS]

/* Resources: hit points, Hit Dice, spell slots and class pools. Those a character doesn't have have a maximum of 0. */

const DAMAGE_TYPES: DamageTypeDef[] = [
  ...['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'].map((name) => ({
    id: name.toLowerCase(),
    name,
  })),
  { id: 'damage', name: 'Damage' },
  { id: 'healing', name: 'Healing' },
]

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

const RESOURCES: ResourceDef[] = [
  { id: 'hp', name: 'HP', max: 'maxHp', resets: ['long-rest'] },
  { id: 'reaction', name: 'Reaction', max: 'reactionMax', resets: ['turn', 'short-rest', 'long-rest'] },
  { id: 'hitDice', name: 'Hit Dice', max: 'hitDiceMax', resets: ['long-rest'] },
  ...SLOT_LEVELS.map((n): ResourceDef => ({ id: `slot${n}`, name: `${ORDINAL[n - 1]}-level slots`, max: `slots${n}`, resets: ['long-rest'] })),
  { id: 'pact', name: 'Pact slots', max: 'pactSlots', resets: ['short-rest', 'long-rest'] },
  { id: 'rage', name: 'Rage', max: 'rageMax', resets: ['long-rest'] },
  { id: 'bardic', name: 'Bardic Inspiration', max: 'bardicMax', resets: ['long-rest'] },
  { id: 'channel', name: 'Channel Divinity', max: 'channelMax', resets: ['long-rest'] },
  { id: 'wildShape', name: 'Wild Shape', max: 'wildShapeMax', resets: ['long-rest'] },
  { id: 'secondWind', name: 'Second Wind', max: 'secondWindMax', resets: ['long-rest'] },
  { id: 'focus', name: 'Focus Points', max: 'focusMax', resets: ['short-rest', 'long-rest'] },
  { id: 'layOnHands', name: 'Lay on Hands', max: 'layOnHandsMax', resets: ['long-rest'] },
  { id: 'sorcery', name: 'Sorcery Points', max: 'sorceryMax', resets: ['long-rest'] },
  { id: 'actionSurge', name: 'Action Surge', max: 'actionSurgeMax', resets: ['short-rest', 'long-rest'] },
  { id: 'innateSorcery', name: 'Innate Sorcery', max: 'innateSorceryMax', resets: ['long-rest'] },
]

/** A new NPC's maximum hit points. */
const NPC_HP = 10

export const dnd55e: GameSystem = {
  id: "dnd-5.5e",
  name: "D&D 5.5e",
  version: "0.1.0",
  stats: ABILITIES,
  modifier: modifierOf,
  baseRoll: "1d20",
  rollModes: [
    { id: "advantage", label: "Advantage", roll: "2d20kh1" },
    { id: "disadvantage", label: "Disadvantage", roll: "2d20kl1" },
  ],
  results,
  result: (_total, natural, _roll, context) =>
    (natural[0] ?? 0) >= criticalThreshold(context) ? "crit" : natural[0] === 1 ? "fumble" : "rolled",
  // A natural 20 always hits and a natural 1 always misses.
  hits: (total, natural, ac, _roll, context) =>
    (natural[0] ?? 0) >= criticalThreshold(context) || (natural[0] !== 1 && total >= ac),
  longRange: { mode: "disadvantage", cancels: "advantage" },
  damageTypes: DAMAGE_TYPES,
  tempHp: "tempHp",
  initiative: "initiative",
  // DC 10 or half the damage, whichever is higher, up to 30.
  concentrationSave: (damage) => ({
    action: "save-con",
    difficulty: { kind: 'fixed', value: Math.min(30, Math.max(10, Math.floor(damage / 2))) },
  }),
  actions: ACTIONS_ALL,
  loadouts: [
    { id: 'spellbook', label: 'Spellbook', ownedField: '', activeField: 'spellbook', max: 999, options: spellOptions, available: (character) => classOf(character).id === 'wizard' ? spellList(character).filter((spell) => spell.level > 0).map((spell) => spell.id) : [] },
    { id: 'cantrips', label: 'Known Cantrips', ownedField: '', activeField: 'knownCantrips', max: 'cantripsMax', options: spellOptions, available: (character) => spellList(character).filter((spell) => spell.level === 0).map((spell) => spell.id) },
    { id: 'prepared', label: 'Prepared Spells', ownedField: 'spellbook', activeField: 'preparedSpells', max: 'preparedMax', options: spellOptions, available: (character) => spellList(character).filter((spell) => spell.level > 0 && (classOf(character).id !== 'wizard' || selectedIds(character, 'spellbook').includes(spell.id))).map((spell) => spell.id) },
  ],
  learnedActionAllowed: (action, character, derived) => action.category !== 'spell' || selectedIds(character, 'preparedSpells', derived.values.preparedMax).includes(action.id) || selectedIds(character, 'knownCantrips', derived.values.cantripsMax).includes(action.id),
  actionCategories: [
    { id: "attack", label: "Attacks" },
    { id: "class", label: "Class" },
    { id: "species", label: "Species" },
    { id: "spell", label: "Spells" },
    { id: "action", label: "Actions", onHotbar: false },
    { id: "combat", label: "Combat", onHotbar: false },
    { id: "save", label: "Saves", onHotbar: false },
    { id: "skill", label: "Skills", onHotbar: false },
    { id: "check", label: "Ability checks", onHotbar: false },
  ],
  followUps: [
    ...WEAPON_ROLLS,
    ...SPELL_ROLLS,
    ...FEATURE_ROLLS,
    ...SPECIES_ROLLS,
    {
      id: "death-success",
      kind: "bump",
      label: "Mark a success",
      field: "deathSuccesses",
      by: 1,
    },
    {
      id: "death-failure",
      kind: "bump",
      label: "Mark a failure",
      field: "deathFailures",
      by: 1,
    },
    {
      id: "death-failure-2",
      kind: "bump",
      label: "Mark two failures",
      field: "deathFailures",
      by: 2,
    },
  ],
  items: [...new Map([...SRD_MAGIC_ITEMS, ...ITEMS].map((item) => [item.id, item])).values()],
  monsters: SRD_MONSTERS,
  tags: TAGS,
  conditions: CONDITIONS,
  modifiers: [],
  resources: RESOURCES,
  characterData: [
    { id: "classId", default: (CLASSES)[0]!.id, for: "pc" },
    { id: "level", default: 1, for: "pc" },
    { id: "species", default: "" },
    { id: "background", default: "" },
    { id: "subclass", default: "", for: "pc" },
    { id: 'preparedSpells', default: '', for: 'pc' }, { id: 'knownCantrips', default: '', for: 'pc' }, { id: 'spellbook', default: '', for: 'pc' },
    /** Feat ids, comma-separated. */
    { id: "feats", default: "", for: "pc" },
    { id: "alignment", default: "" },
    { id: "xp", default: 0, for: "pc" },
    { id: "gp", default: 0, for: "pc" },
    { id: "speed", default: 30, for: "pc" },
    { id: "tempHp", default: 0 },
    { id: "exhaustion", default: 0 },
    { id: "inspiration", default: false, for: "pc" },
    { id: "deathSuccesses", default: 0, for: "pc" },
    { id: "deathFailures", default: 0, for: "pc" },
    /** Added to the computed maximum HP, for feats like Tough or a homebrew change. */
    { id: "hpBonus", default: 0, for: "pc" },
    /** Skill proficiency: 0 none, 1 proficient, 2 Expertise. */
    ...SKILLS.map((s) => ({
      id: `skill:${s.id}`,
      default: 0,
      for: "pc" as const,
    })),
    /** An NPC's maximum HP, set by hand. */
    { id: "maxHp", default: NPC_HP, for: "npc" },
  ],
  sizes: [
    { id: "tiny", name: "Tiny", cells: 0.5 },
    { id: "small", name: "Small", cells: 1 },
    { id: "medium", name: "Medium", cells: 1 },
    { id: "large", name: "Large", cells: 2 },
    { id: "huge", name: "Huge", cells: 3 },
    { id: "gargantuan", name: "Gargantuan", cells: 4 },
  ],
  scene: { unit: 5, unitName: "ft", diagonal: "one" },
  npcFields: [
    { id: "ac", label: "AC", type: "number" },
    { id: "speed", label: "Speed", type: "text" },
    { id: "cr", label: "Challenge", type: "text" },
    { id: "senses", label: "Senses", type: "text" },
    { id: "languages", label: "Languages", type: "text" },
    { id: "savingThrows", label: "Saving Throws", type: "text" },
    { id: "skills", label: "Skills", type: "text" },
    { id: "traits", label: "Traits", type: "longtext" },
    { id: "actions", label: "Actions", type: "longtext" },
  ],
  derive(c, sources) {
    const npc = c.kind === "npc";
    const cls = classOf(c);
    const level = levelOf(c);
    const exhaustion = Math.min(6, Number(c.data.exhaustion ?? 0));
    // Exhaustion: −2 to every d20 test and −5 feet of Speed per level.
    const all: EffectSource[] = exhaustion
      ? [
          ...sources,
          {
            name: "Exhaustion",
            effects: [
              { type: "rollBonus", value: -2 * exhaustion },
              {
                type: "modify",
                path: "speed",
                op: "add",
                value: -5 * exhaustion,
              },
            ],
          },
        ]
      : sources;
    const resolved = resolveEffects(
      {
        // Scores go through the resolver so items can set them (Gauntlets of Ogre Power).
        ...Object.fromEntries(
          ABILITIES.map((a) => [a.id, c.scores[a.id] ?? 10]),
        ),
        armorBase: 10,
        armorWorn: 0,
        dexCap: 99,
        shieldWorn: 0,
        acBonus: 0,
        speed: npc ? 0 : Number(c.data.speed ?? 30),
        weaponDice: 1,
        weaponDie: 0,
        weaponBonus: 0,
        initiativeBonus: 0,
      },
      all,
    );
    const r = resolved.values;
    const mods: Record<string, number> = {};
    for (const a of ABILITIES) mods[a.id] = modifierOf(r[a.id] ?? 10);
    const mod = (id: string) => mods[id] ?? 0;
    const value = (id: string) => r[id] ?? 0;
    const prof = npc ? 0 : proficiencyAt(level);

    // Armour Class: worn armour, or a class's Unarmored Defense, or 10 + Dexterity.
    let ac: number;
    if (npc) ac = Number(c.fields.ac) || 10 + mod("dex");
    else if (value("armorWorn")) ac = value("armorBase") + Math.min(mod("dex"), value("dexCap"));
    else if (cls.id === "barbarian") ac = 10 + mod("dex") + mod("con");
    else if (cls.id === "monk" && !value("shieldWorn")) ac = 10 + mod("dex") + mod("wis");
    else ac = 10 + mod("dex");
    ac += value("acBonus");

    // Hit points: the full Hit Die at level 1, then its average (rounded up) per level, plus Constitution each level.
    // Some species, feats and subclasses add to it per level (Dwarven Toughness, Tough, Draconic Resilience).
    const perLevel = cls.hitDie / 2 + 1 + mod("con");
    const species = SPECIES.find((x) => x.id === c.data.species);
    const feats = npc ? [] : featsOf(c);
    const extraPerLevel =
      (species?.hpPerLevel ?? 0) +
      feats.reduce((n, f) => n + (f.hpPerLevel ?? 0), 0) +
      (c.data.subclass === "draconic" && level >= SUBCLASS_LEVEL ? 1 : 0);
    const maxHp = npc
      ? Number(c.data.maxHp ?? NPC_HP)
      : Math.max(
          1,
          cls.hitDie +
            mod("con") +
            (level - 1) * perLevel +
            extraPerLevel * level +
            Number(c.data.hpBonus ?? 0),
        );
    const alert = feats.some((f) => f.initiativeProf) ? prof : 0;
    // Defense: +1 AC in armour.
    if (r.armorWorn && feats.some((f) => f.id === "defense")) ac += 1;

    // Jack of All Trades: half proficiency on checks without it.
    const jack =
      !npc && cls.id === "bard" && level >= 2 ? Math.floor(prof / 2) : 0;
    const skills: Record<string, number> = {};
    for (const s of SKILLS) {
      const rank = npc ? 0 : Number(c.data[`skill:${s.id}`] ?? 0);
      skills[`skill:${s.id}`] = rank ? prof * rank : jack;
    }
    const saves: Record<string, number> = {};
    for (const a of ABILITIES)
      saves[`save:${a.id}`] = !npc && cls.saves.includes(a.id) ? prof : 0;

    const castingMod = cls.casting ? mod(cls.casting) : 0;
    const slots = npc ? [] : spellSlots(cls, level);
    const pact =
      !npc && cls.caster === "pact" ? pactMagic(level) : { slots: 0, level: 0 };
    const is = (id: string, from = 1) => !npc && cls.id === id && level >= from;

    return {
      mods,
      resolved,
      values: {
        ...r,
        ac,
        maxHp,
        prof,
        jack,
        hitDie: cls.hitDie,
        hitDiceMax: npc ? 0 : level,
        reactionMax: 1,
        speed: Math.max(0, value("speed")),
        initiativeBonus: value("initiativeBonus") + jack + alert,
        initiative: mod("dex") + value("initiativeBonus") + jack + alert,
        speciesDc: 8 + mod("con") + prof,
        passivePerception: 10 + mod("wis") + (skills["skill:perception"] ?? 0),
        ...skills,
        ...saves,
        castingMod,
        spellAttack: cls.casting && !npc ? prof + castingMod : 0,
        spellDc: cls.casting && !npc ? 8 + prof + castingMod : 0,
        preparedMax: npc ? 0 : PREPARATION_COUNTS[cls.id]?.[level - 1] ?? 0,
        actionSurgeMax: is('fighter', 2) ? level >= 17 ? 2 : 1 : 0,
        innateSorceryMax: is('sorcerer') ? 2 : 0,
        cantripsMax: !npc && cls.casting && !['paladin', 'ranger'].includes(cls.id) ? (['cleric', 'wizard'].includes(cls.id) ? 3 : cls.id === 'sorcerer' ? 4 : 2) + (level >= 4 ? 1 : 0) + (level >= 10 ? 1 : 0) : 0,
        ...Object.fromEntries(
          SLOT_LEVELS.map((n) => [`slots${n}`, slots[n - 1] ?? 0]),
        ),
        pactSlots: pact.slots,
        pactLevel: pact.level,
        rageMax: is("barbarian")
          ? stepped(level, [
              [1, 2],
              [3, 3],
              [6, 4],
              [12, 5],
              [17, 6],
            ])
          : 0,
        rageDamage: stepped(level, [
          [1, 2],
          [9, 3],
          [16, 4],
        ]),
        bardicMax: is("bard") ? Math.max(1, valueOf(mods, "cha")) : 0,
        bardicDie: stepped(level, [
          [1, 6],
          [5, 8],
          [10, 10],
          [15, 12],
        ]),
        channelMax: is("cleric", 2)
          ? stepped(level, [
              [2, 2],
              [6, 3],
              [18, 4],
            ])
          : is("paladin", 3)
            ? stepped(level, [
                [3, 2],
                [11, 3],
              ])
            : 0,
        wildShapeMax: is("druid", 2)
          ? stepped(level, [
              [2, 2],
              [6, 3],
              [17, 4],
            ])
          : 0,
        secondWindMax: is("fighter")
          ? stepped(level, [
              [1, 2],
              [4, 3],
              [10, 4],
            ])
          : 0,
        focusMax: is("monk", 2) ? level : 0,
        martialDie: stepped(level, [
          [1, 6],
          [5, 8],
          [11, 10],
          [17, 12],
        ]),
        layOnHandsMax: is("paladin") ? 5 * level : 0,
        sorceryMax: is("sorcerer", 2) ? level : 0,
        /** Carrying capacity, in pounds. */
        maxLoad: value("str") * 15,
        load: c.inventory.reduce((n, i) => n + i.weight, 0),
        exhaustion,
        xpNext: XP_FOR_LEVEL[Math.min(19, level)] ?? 0,
      },
    };
  },
  actionsFor(c, d) {
    // NPCs roll their abilities; their attacks and traits are on their sheet.
    if (c.kind === "npc")
      return ACTIONS_ALL.filter(
        (a) =>
          a.category === "check" ||
          a.category === "save" ||
          a.id === "initiative",
      );
    const cls = classOf(c);
    const level = levelOf(c);
    const granted = new Set(d.resolved.moves);
    const features = new Set(
      FEATURES_ALL.filter((f) => (f.classes[cls.id] ?? 99) <= level && (!f.subclassId || f.subclassId === c.data.subclass)).map(
        (f) => f.id,
      ),
    );
    const spells = new Set(
      spellList(c).filter((spell) => spell.level ? selectedIds(c, 'preparedSpells', d.values.preparedMax).includes(spell.id) : selectedIds(c, 'knownCantrips', d.values.cantripsMax).includes(spell.id)).map((spell) => spell.id),
    );
    if (cls.id === 'wizard') for (const spell of spellList(c)) if (spell.ritual && selectedIds(c, 'spellbook').includes(spell.id)) spells.add(spell.id)
    // Favored Enemy: Rangers always have Hunter's Mark.
    if (cls.id === "ranger") spells.add("hunters-mark");
    if (c.data.subclass && level >= SUBCLASS_LEVEL)
      features.add(`subclass-${c.data.subclass}`);
    const traits = new Set(
      SPECIES_ACTIONS.filter((a) => a.species === c.data.species).map(
        (a) => a.id,
      ),
    );
    const has = (a: ActionDef) =>
      a.category === "class"
        ? features.has(a.id)
        : a.category === "spell"
          ? spells.has(a.id)
          : a.category === "species"
            ? traits.has(a.id)
            : true;
    return ACTIONS_ALL.filter((a) => has(a) || granted.has(a.id));
  },
  tokenStats(c, d) {
    const hp = c.resources.hp ?? 0;
    const max = valueOf(d.values, "maxHp");
    return [
      {
        id: "hp",
        label: "HP",
        value: hp,
        max,
        colour:
          hp <= max / 4 ? "#d04a3a" : hp <= max / 2 ? "#d49a32" : "#4aa35a",
      },
    ];
  },
  creation: {
    advancementField: "level",
    choices: [
      {
        id: "class",
        label: "Class",
        plural: "Classes",
        field: "classId",
        at: "create",
        options: CLASSES.map(({ id, name, blurb, icon }) => ({
          id,
          name,
          text: blurb,
          icon,
          grants: startingSpells(id),
        })),
      },
      {
        id: "species",
        label: "Species",
        field: "species",
        at: "create",
        options: SPECIES.map(({ id, name, text, speed }) => ({
          id,
          name,
          text,
          grants: { speed },
        })),
      },
      {
        id: "background",
        label: "Background",
        plural: "Backgrounds",
        field: "background",
        at: "create",
        options: BACKGROUNDS.map(({ id, name, text, boost, grants, feat }) => ({
          id,
          name,
          text,
          ...(boost ? { boost } : {}),
          grants: { ...grants, feats: feat },
        })),
      },
      {
        id: "subclass",
        label: "Subclass",
        plural: "Subclasses",
        field: "subclass",
        at: SUBCLASS_LEVEL,
        options: SUBCLASSES,
      },
    ],
    scores: {
      standardArray: [15, 14, 13, 12, 10, 8],
      pointBuy: {
        budget: 27,
        costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
      },
      roll: "4d6kh3",
    },
    improvementsAt: IMPROVEMENT_LEVELS,
    feats: {
      id: "feat",
      label: "Feat",
      plural: "Feats",
      field: "feats",
      at: "create",
      options: FEATS.filter((f) => f.category !== "fighting-style"),
    },
  },
  attribution:
    "Condensed from the System Reference Document 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document, licensed under CC BY 4.0. Check the SRD for exact wording.",
};
