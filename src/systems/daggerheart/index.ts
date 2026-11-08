import { md } from "../../macros/markdown.macro" with { type: "macro" };
import { resolveEffects } from "../effects";
import type { ActionDef, CheckStep, Derived, GameSystem, ItemDef, OptionDef } from "../types";
import type { CharacterView } from "../../features/characters/types";
import { commaListOf } from "../../lib/list";
import { plainText, richTextFromPlain, type RichText } from "../../core/richText";

import { ANCESTRIES, ARMOR, CLASSES, COMMUNITIES, DOMAIN_CARDS, SUBCLASSES, WEAPONS } from "./data";
import { slug } from "./slug";
import { hpTokenStat } from "../tokenStats";

const TRAITS = [
  { id: "agility", name: "Agility", abbr: "AGI" },
  { id: "strength", name: "Strength", abbr: "STR" },
  { id: "finesse", name: "Finesse", abbr: "FIN" },
  { id: "instinct", name: "Instinct", abbr: "INS" },
  { id: "presence", name: "Presence", abbr: "PRE" },
  { id: "knowledge", name: "Knowledge", abbr: "KNO" },
];

const RESULTS = [
  { id: "critical", label: "Critical Success", tone: "good" as const },
  { id: "success-hope", label: "Success with Hope", tone: "good" as const },
  { id: "success-fear", label: "Success with Fear", tone: "mixed" as const },
  { id: "failure-hope", label: "Failure with Hope", tone: "mixed" as const },
  { id: "failure-fear", label: "Failure with Fear", tone: "bad" as const },
];

const OUTCOMES: Record<string, RichText> = {
  critical: md("You succeed with a bonus. Gain Hope and clear 1 Stress."),
  "success-hope": md("You succeed and gain Hope."),
  "success-fear": md("You succeed with a cost or complication; the GM gains Fear."),
  "failure-hope": md("You fail with a minor consequence and gain Hope."),
  "failure-fear": md("You fail with a major consequence; the GM gains Fear."),
};

const idOf = (prefix: string, value: string) => `${prefix}-${slug(value)}`;
const traitsByName = new Map(TRAITS.map((trait) => [trait.name.toLowerCase(), trait.id]));
const EXPERIENCE_BONUSES = Array.from({ length: 5 }, (_, index) => ({
  id: `experience-${index + 1}`,
  label: "Experience",
  nameField: `experience${index + 1}Name`,
  valueField: `experience${index + 1}Bonus`,
  cost: { resource: "hope", by: 1 },
}));
const ROLL_CATEGORIES = [
  "trait",
  "class",
  "subclass",
  "heritage",
  "weapon",
  ...new Set(DOMAIN_CARDS.map((card) => `domain-${slug(card.domain)}`)),
];
const resultsFor = (
  successHope: string[] = [],
  successFear: string[] = [],
  failureHope: string[] = [],
  failureFear: string[] = [],
  critical: string[] = [],
) => ({
  critical,
  "success-hope": successHope,
  "success-fear": successFear,
  "failure-hope": failureHope,
  "failure-fear": failureFear,
});

function rollStep(
  rules: RichText,
  options: { target?: boolean; prompt?: string } = {},
): CheckStep | undefined {
  const text = plainText(rules);
  const spellcast = /spellcast roll/i.test(text);
  const traitMatch = /\b(Agility|Strength|Finesse|Instinct|Presence|Knowledge) Roll/i.exec(text);
  if (!spellcast && !traitMatch) return undefined;
  const traitName = traitMatch?.[1];
  if (!spellcast && !traitName) return undefined;
  const fixedDifficulty =
    /(?:Spellcast|Trait|Agility|Strength|Finesse|Instinct|Presence|Knowledge) Roll\s*\((\d+)\)/i.exec(
      text,
    )?.[1];
  const stat = !spellcast && traitName ? traitsByName.get(traitName.toLowerCase()) : undefined;
  const difficulty = options.target
    ? { kind: "target" as const, value: "difficulty" }
    : fixedDifficulty
      ? { kind: "fixed" as const, value: Number(fixedDifficulty) }
      : {
          kind: "prompt" as const,
          prompt: options.prompt ?? "Difficulty",
          initial: 10,
        };
  return {
    kind: "check",
    ...(stat ? { stat } : {}),
    ...(spellcast ? { add: [{ value: "spellcast", label: "Spellcast" }] } : {}),
    difficulty,
    outcomes: OUTCOMES,
    rollBonuses: EXPERIENCE_BONUSES,
    followUps: resultsFor(
      ["gain-hope"],
      ["gain-fear"],
      ["gain-hope"],
      ["gain-fear"],
      ["gain-hope", "clear-stress"],
    ),
  };
}

function action(
  id: string,
  name: string,
  category: string,
  trigger: string,
  text: RichText,
  step?: CheckStep,
  target?: ActionDef["target"],
): ActionDef {
  return {
    id,
    name,
    category,
    trigger,
    text,
    ...(target ? { target } : {}),
    steps: step ? [step] : [],
    ...(step?.add?.some((entry) => entry.value === "spellcast")
      ? {
          variants: (character: CharacterView, derived: Derived) => {
            const primary = {
              id: "primary-spellcast",
              label: "Primary Spellcast trait",
              costs: [],
              values: { spellcast: derived.values.spellcast ?? 0 },
            };
            const multiclassTrait = String(character.data.multiclassSpellcastTrait ?? "");
            return multiclassTrait && multiclassTrait !== character.data.spellcastTrait
              ? [
                  primary,
                  {
                    id: "multiclass-spellcast",
                    label: `Multiclass Spellcast: ${multiclassTrait}`,
                    costs: [],
                    values: { spellcast: derived.mods[multiclassTrait] ?? 0 },
                  },
                ]
              : [primary];
          },
        }
      : {}),
  };
}

const classActions: ActionDef[] = CLASSES.flatMap((entry) => [
  {
    ...action(
      idOf("hope", `${entry.id}-${entry.hopeFeature.name}`),
      entry.hopeFeature.name,
      "class",
      "Hope feature",
      entry.hopeFeature.text,
    ),
    costs: [{ resource: "hope", by: -3 }],
  },
  ...entry.features.map((feature) =>
    action(
      idOf("class", `${entry.id}-${feature.name}`),
      feature.name,
      "class",
      `${entry.name} feature`,
      feature.text,
      rollStep(feature.text),
    ),
  ),
]);

const subclassActions = SUBCLASSES.flatMap((entry) =>
  entry.features.map((feature) => {
    const isTargeted = /against (?:a|the) target|against all targets/i.test(
      plainText(feature.text),
    );
    const target = isTargeted ? { prompt: "Target the creature or adversary", min: 1 } : undefined;
    return {
      action: action(
        idOf("subclass", `${entry.id}-${feature.name}`),
        feature.name,
        "subclass",
        `${entry.name} · ${feature.tier}`,
        feature.text,
        rollStep(feature.text, { target: isTargeted }),
        target,
      ),
      classId: entry.classId,
      subclassId: entry.id,
      level: feature.tier === "Mastery" ? 8 : feature.tier === "Specialization" ? 5 : 1,
    };
  }),
);

const ancestryActions = ANCESTRIES.flatMap((entry) =>
  entry.features.map((feature) => ({
    action: action(
      idOf("ancestry", `${entry.id}-${feature.name}`),
      feature.name,
      "heritage",
      `${entry.name} feature`,
      feature.text,
      rollStep(feature.text),
    ),
    ancestryId: entry.id,
  })),
);
const communityActions = COMMUNITIES.map((entry) => ({
  action: action(
    idOf("community", `${entry.id}-${entry.feature.name}`),
    entry.feature.name,
    "heritage",
    `${entry.name} feature`,
    entry.feature.text,
    rollStep(entry.feature.text),
  ),
  communityId: entry.id,
}));

const domainActions = DOMAIN_CARDS.map((card) => {
  const targeted = /against (?:a|the) target|against all targets|against each target/i.test(
    plainText(card.text),
  );
  const target = targeted ? { prompt: "Target the creature or adversary", min: 1 } : undefined;
  const step = rollStep(card.text, {
    target: targeted,
    prompt: "Difficulty Class",
  });
  return {
    action: action(
      idOf(`domain-${slug(card.domain)}`, card.name),
      card.name,
      `domain-${slug(card.domain)}`,
      `${card.domain} · Level ${card.level}`,
      card.text,
      step,
      target,
    ),
    cardId: card.id,
    domain: card.domain,
  };
});

const parseDamage = (damage: string, proficiency: number, critical = false) => {
  const match = /(?:(\d+))?d(\d+)(?:\s*([+-])\s*(\d+))?/i.exec(damage);
  if (!match) return damage.replace(/\s+(?:phy|mag)$/i, "");
  const dice = proficiency;
  const sides = Number(match[2]);
  const flat = Number(match[4] ?? 0) * (match[3] === "-" ? -1 : 1);
  const bonus = critical ? dice * sides : 0;
  return `${dice}d${sides}${flat + bonus ? `${flat + bonus > 0 ? "+" : ""}${flat + bonus}` : ""}`;
};

const weaponItems: ItemDef[] = WEAPONS.map((weapon) => ({
  id: `weapon-${weapon.id}`,
  name: weapon.name,
  description: [
    weapon.kind,
    `Tier ${weapon.tier}`,
    weapon.magical ? "Magical" : "Physical",
    `${weapon.trait} · ${weapon.range}`,
    weapon.damage,
    weapon.burden,
    weapon.featureText,
  ]
    .filter(Boolean)
    .join(" · "),
  weight: 0,
  tags: [weapon.kind.toLowerCase(), weapon.range.toLowerCase(), weapon.burden.toLowerCase()].filter(
    Boolean,
  ),
  equippable: true,
  active: "equipped",
}));

const armorItems: ItemDef[] = ARMOR.map((armor) => ({
  id: `armor-${armor.id}`,
  name: armor.name,
  description: `Tier ${armor.tier} · Thresholds ${armor.major}/${armor.severe} · Armor Score ${armor.score}${armor.featureText ? ` · ${armor.featureText}` : ""}`,
  weight: 0,
  tags: ["armor"],
  equippable: true,
  active: "equipped",
  effects: [
    { type: "modify", path: "armorScore", op: "set", value: armor.score },
    {
      type: "modify",
      path: "baseMajorThreshold",
      op: "set",
      value: armor.major,
    },
    {
      type: "modify",
      path: "baseSevereThreshold",
      op: "set",
      value: armor.severe,
    },
  ],
}));

const weaponActions: ActionDef[] = WEAPONS.map((weapon) => {
  const normalDamageId = `weapon-damage-${weapon.id}`;
  const criticalDamageId = `weapon-critical-damage-${weapon.id}`;
  const stat = traitsByName.get(weapon.trait.toLowerCase());
  const check: CheckStep = {
    kind: "check",
    ...(stat ? { stat } : {}),
    difficulty: { kind: "target", value: "difficulty" },
    outcomes: OUTCOMES,
    rollBonuses: EXPERIENCE_BONUSES,
    followUps: {
      critical: [criticalDamageId, "gain-hope", "clear-stress"],
      "success-hope": [normalDamageId, "gain-hope"],
      "success-fear": [normalDamageId, "gain-fear"],
      "failure-hope": ["gain-hope"],
      "failure-fear": ["gain-fear"],
    },
  };
  return action(
    `attack-${weapon.id}`,
    `Attack · ${weapon.name}`,
    "weapon",
    `${weapon.trait} · ${weapon.range}`,
    richTextFromPlain(
      `Make an attack roll against the target's Difficulty. On a hit, roll ${weapon.damage} damage using your Proficiency.`,
    ),
    check,
    { prompt: "Target the adversary you attack", min: 1, max: 1 },
  );
});

const CONDITIONS = [
  {
    id: "hidden",
    name: "Hidden",
    text: "Not visible or known to foes until the fiction breaks concealment.",
  },
  {
    id: "restrained",
    name: "Restrained",
    text: "Movement and actions are constrained by the effect.",
  },
  {
    id: "vulnerable",
    name: "Vulnerable",
    text: "Attacks against this character gain advantage.",
  },
];

const DOMAIN_OPTIONS = DOMAIN_CARDS.map((card): OptionDef => ({
  id: card.id,
  name: card.name,
  text: `Level ${card.level} ${card.type} · Recall ${card.recall}. ${plainText(card.text)}`,
  requiresAny: [{ domain1: card.domain }, { domain2: card.domain }],
  notIncludes: [{ field: "domainCards", value: card.id }],
  grants: { activeDomainCards: card.id },
}));

const domainOptionsAt = (level: number) =>
  DOMAIN_CARDS.filter((card) => card.level <= level).map((card) => {
    const option = DOMAIN_OPTIONS.find((entry) => entry.id === card.id)!;
    return {
      ...option,
      requiresAny: [
        ...option.requiresAny!,
        ...(card.level <= Math.ceil(level / 2) ? [{ multiclassDomain: card.domain }] : []),
      ],
    };
  });

const CLASS_OPTIONS: OptionDef[] = CLASSES.map((entry) => ({
  id: entry.id,
  name: entry.name,
  text: `${entry.description}\nDomains: ${entry.domains.join(" and ")} · Starting Evasion ${entry.evasion} · Starting HP ${entry.hp}.`,
  grants: { domain1: entry.domains[0], domain2: entry.domains[1] },
}));

const ADVANCEMENT_OPTIONS: OptionDef[] = [
  {
    id: "increase-traits",
    name: "Increase two Traits",
    text: "Raise two unmarked Traits by 1.",
    boost: { stats: TRAITS.map((trait) => trait.id), amounts: [[1, 1]] },
  },
  {
    id: "hp-slot",
    name: "Add an HP slot",
    text: "Increase your maximum Hit Points by 1.",
  },
  {
    id: "stress-slot",
    name: "Add a Stress slot",
    text: "Increase your maximum Stress by 1.",
  },
  { id: "evasion", name: "Increase Evasion", text: "Increase Evasion by 1." },
  {
    id: "proficiency",
    name: "Increase Proficiency",
    text: "Increase Proficiency and the number of weapon damage dice by 1.",
    cost: 2,
  },
];

function advancementOptionsAt(level: number): OptionDef[] {
  const tier = level >= 8 ? 4 : level >= 5 ? 3 : 2;
  const options = ADVANCEMENT_OPTIONS.slice();
  for (let first = 1; first <= 5; first++)
    for (let second = first + 1; second <= 5; second++)
      options.push({
        id: `improve-experiences-${first}-${second}`,
        name: `Improve Experiences ${first} and ${second}`,
        text: "Increase both Experience modifiers by 1.",
        requiresFilled: [`experience${first}Name`, `experience${second}Name`],
        dataBoost: [
          { field: `experience${first}Bonus`, by: 1 },
          { field: `experience${second}Bonus`, by: 1 },
        ],
      });
  if (level >= 5)
    options.push(
      ...SUBCLASSES.filter((entry) => entry.classId).map((entry) => ({
        id: "subclass-specialization",
        name: "Take a Specialization card",
        text: `${entry.name}: ${entry.features
          .filter((feature) => feature.tier === "Specialization")
          .map((feature) => `${feature.name}: ${plainText(feature.text)}`)
          .join(" ")}`,
        requires: { subclassId: entry.id },
        grants: {
          subclassSpecialization: true,
          [`subclassUpgradeTier${tier}`]: true,
        },
        notRequires: {
          subclassSpecialization: true,
          [`multiclassTier${tier}`]: true,
        },
      })),
    );
  if (level >= 8)
    options.push(
      ...SUBCLASSES.filter((entry) => entry.classId).map((entry) => ({
        id: "subclass-mastery",
        name: "Take a Mastery card",
        text: `${entry.name}: ${entry.features
          .filter((feature) => feature.tier === "Mastery")
          .map((feature) => `${feature.name}: ${plainText(feature.text)}`)
          .join(" ")}`,
        requires: { subclassId: entry.id, subclassSpecialization: true },
        grants: { subclassMastery: true, [`subclassUpgradeTier${tier}`]: true },
        notRequires: { subclassMastery: true, [`multiclassTier${tier}`]: true },
      })),
    );
  if (level >= 5)
    for (const cls of CLASSES)
      for (const domain of cls.domains)
        for (const subclass of SUBCLASSES.filter((entry) => entry.classId === cls.id))
          options.push({
            id: `multiclass-${cls.id}-${slug(domain)}-${subclass.id}`,
            name: `Multiclass: ${cls.name} · ${domain} · ${subclass.name}`,
            text: `Gain ${cls.name}'s class features, access to ${domain} cards at half your level (rounded up), and ${subclass.name}'s foundation.`,
            cost: 2,
            notRequires: {
              classId: cls.id,
              multiclassed: true,
              [`subclassUpgradeTier${tier}`]: true,
            },
            grants: {
              multiclassed: true,
              multiclassClass: cls.id,
              multiclassDomain: domain,
              multiclassSubclass: subclass.id,
              multiclassSpellcastTrait: slug(subclass.spellcastTrait),
              [`multiclassTier${tier}`]: true,
            },
          });
  return options;
}

const SUBCLASS_OPTIONS: OptionDef[] = SUBCLASSES.map((entry) => ({
  id: entry.id,
  name: entry.name,
  text: entry.description,
  requires: { classId: entry.classId },
  ...(entry.spellcastTrait ? { grants: { spellcastTrait: slug(entry.spellcastTrait) } } : {}),
}));

export const daggerheart: GameSystem = {
  id: "daggerheart",
  name: "Daggerheart",
  version: "1.0.0",
  stats: TRAITS.map((trait) => ({ ...trait, default: 0, min: -1, max: 3 })),
  modifier: (value) => Math.trunc(value),
  baseRoll: "1d12[Hope]+1d12[Fear]",
  defaultRollLabel: "Duality Dice",
  rollModes: [
    {
      id: "disadvantage",
      label: "Disadvantage",
      roll: "1d12[Hope]+1d12[Fear]-1d6[Disadvantage]",
      categories: ROLL_CATEGORIES,
    },
    {
      id: "advantage",
      label: "Advantage",
      roll: "1d12[Hope]+1d12[Fear]+1d6[Advantage]",
      categories: ROLL_CATEGORIES,
    },
  ],
  results: RESULTS,
  result(total, _natural, roll, context) {
    const hope = roll?.terms.find((term) => term.kind === "dice" && term.label === "Hope");
    const fear = roll?.terms.find((term) => term.kind === "dice" && term.label === "Fear");
    if (hope?.kind !== "dice" || fear?.kind !== "dice") return "failure-fear";
    const hopeFace = hope.dice[0]?.value ?? 0;
    const fearFace = fear.dice[0]?.value ?? 0;
    if (hopeFace === fearFace) return "critical";
    const success = total >= (context?.difficulty ?? 10);
    return success
      ? hopeFace > fearFace
        ? "success-hope"
        : "success-fear"
      : hopeFace > fearFace
        ? "failure-hope"
        : "failure-fear";
  },
  hits(total, _natural, difficulty, roll) {
    const hope = roll?.terms.find((term) => term.kind === "dice" && term.label === "Hope");
    const fear = roll?.terms.find((term) => term.kind === "dice" && term.label === "Fear");
    return (
      !!(
        hope?.kind === "dice" &&
        fear?.kind === "dice" &&
        hope.dice[0]?.value === fear.dice[0]?.value
      ) || total >= difficulty
    );
  },
  damageTypes: [
    { id: "physical", name: "Physical" },
    { id: "magic", name: "Magic" },
  ],
  damageArmor: { resource: "armor", label: "Use an Armor Slot" },
  resolveDamage(character, derived, amount, options) {
    if (amount <= 0) return { hp: 0 };
    const severity =
      amount >= (derived.values.severeThreshold ?? 0)
        ? 3
        : amount >= (derived.values.majorThreshold ?? 0)
          ? 2
          : 1;
    const useArmor =
      options.armor && character.kind === "pc" && (character.resources.armor ?? 0) > 0;
    return {
      hp: severity - (useArmor ? 1 : 0),
      ...(useArmor ? { resources: [{ id: "armor", by: -1 }] } : {}),
    };
  },
  counters: [{ id: "fear", label: "Fear", start: 0, max: 12 }],
  actions: [
    ...TRAITS.map((trait) =>
      action(
        `trait-${trait.id}`,
        `${trait.name} Roll`,
        "trait",
        `When you act using ${trait.name}`,
        richTextFromPlain(
          `Roll the Duality Dice, add ${trait.name}, and compare the total against the GM's Difficulty.`,
        ),
        {
          kind: "check",
          stat: trait.id,
          difficulty: {
            kind: "prompt",
            prompt: "Difficulty Class",
            initial: 10,
          },
          rollBonuses: EXPERIENCE_BONUSES,
          outcomes: OUTCOMES,
          followUps: resultsFor(
            ["gain-hope"],
            ["gain-fear"],
            ["gain-hope"],
            ["gain-fear"],
            ["gain-hope", "clear-stress"],
          ),
        },
      ),
    ),
    ...classActions,
    ...subclassActions.map((entry) => entry.action),
    ...ancestryActions.map((entry) => entry.action),
    ...communityActions.map((entry) => entry.action),
    ...domainActions.map((entry) => entry.action),
    ...weaponActions,
    action(
      "level-up",
      "Level Up",
      "special",
      "When the GM reaches a narrative milestone",
      md(
        "Gain a level with the group. Choose the next domain card and apply the advancement for the new tier.",
      ),
    ),
  ],
  loadouts: [
    {
      id: "domain",
      label: "Domain Loadout",
      ownedField: "domainCards",
      activeField: "activeDomainCards",
      max: 5,
      options: DOMAIN_OPTIONS,
      costs: Object.fromEntries(
        DOMAIN_CARDS.map((card) => [card.id, { resource: "stress", by: card.recall }]),
      ),
      freeSwapLabel: "Rest or level-up",
    },
  ],
  actionCategories: [
    { id: "class", label: "Class" },
    { id: "subclass", label: "Subclass" },
    { id: "heritage", label: "Heritage" },
    ...[...new Set(DOMAIN_CARDS.map((card) => card.domain))].map((domain) => ({
      id: `domain-${slug(domain)}`,
      label: domain,
    })),
    { id: "weapon", label: "Weapons" },
    { id: "trait", label: "Traits", onHotbar: false },
    { id: "special", label: "Special", onHotbar: false },
  ],
  followUps: [
    {
      id: "gain-hope",
      kind: "resource",
      label: "Gain 1 Hope",
      resource: "hope",
      by: 1,
    },
    {
      id: "clear-stress",
      kind: "resource",
      label: "Clear 1 Stress",
      resource: "stress",
      by: -1,
    },
    {
      id: "gain-fear",
      kind: "counter",
      label: "GM gains 1 Fear",
      systemCounter: "fear",
      by: 1,
    },
    ...WEAPONS.map((weapon) => ({
      id: `weapon-damage-${weapon.id}`,
      kind: "roll" as const,
      label: "Roll damage",
      comment: weapon.name,
      damage: weapon.magical ? "magic" : "physical",
      formula: (_character: CharacterView, derived: Derived) =>
        parseDamage(weapon.damage, derived.values.proficiency ?? 0),
    })),
    ...WEAPONS.map((weapon) => ({
      id: `weapon-critical-damage-${weapon.id}`,
      kind: "roll" as const,
      label: "Roll critical damage",
      comment: `${weapon.name} critical`,
      damage: weapon.magical ? "magic" : "physical",
      formula: (_character: CharacterView, derived: Derived) =>
        parseDamage(weapon.damage, derived.values.proficiency ?? 0, true),
    })),
  ],
  items: [...weaponItems, ...armorItems],
  tags: [],
  conditions: CONDITIONS.map((condition) => ({ ...condition, effects: [] })),
  modifiers: [],
  resources: [
    { id: "hp", name: "HP", max: "maxHp" },
    { id: "stress", name: "Stress", max: "maxStress", initial: 0 },
    { id: "hope", name: "Hope", max: "maxHope", initial: 2 },
    { id: "armor", name: "Armor Slots", max: "armorScore" },
  ],
  characterData: [
    { id: "classId", default: CLASSES[0]!.id, for: "pc" },
    { id: "subclassId", default: "", for: "pc" },
    { id: "ancestry", default: "", for: "pc" },
    { id: "community", default: "", for: "pc" },
    { id: "domain1", default: "", for: "pc" },
    { id: "domain2", default: "", for: "pc" },
    { id: "spellcastTrait", default: "", for: "pc" },
    { id: "level", default: 1, for: "pc" },
    { id: "hpBonus", default: 0, for: "pc" },
    { id: "stressBonus", default: 0, for: "pc" },
    { id: "hopeBonus", default: 0, for: "pc" },
    { id: "milestone", default: 0, for: "pc" },
    { id: "advancements", default: "", for: "pc" },
    { id: "markedTraits", default: "", for: "pc" },
    { id: "subclassSpecialization", default: false, for: "pc" },
    { id: "subclassMastery", default: false, for: "pc" },
    { id: "multiclassed", default: false, for: "pc" },
    { id: "multiclassClass", default: "", for: "pc" },
    { id: "multiclassDomain", default: "", for: "pc" },
    { id: "multiclassSubclass", default: "", for: "pc" },
    { id: "multiclassSpellcastTrait", default: "", for: "pc" },
    ...[3, 4].flatMap((tier) => [
      { id: `subclassUpgradeTier${tier}`, default: false, for: "pc" as const },
      { id: `multiclassTier${tier}`, default: false, for: "pc" as const },
    ]),
    ...Array.from({ length: 5 }, (_, index) => [
      { id: `experience${index + 1}Name`, default: "", for: "pc" as const },
      { id: `experience${index + 1}Bonus`, default: 2, for: "pc" as const },
    ]).flat(),
    { id: "domainCards", default: "", for: "pc" },
    { id: "activeDomainCards", default: "", for: "pc" },
    { id: "difficulty", default: 10, for: "npc" },
    { id: "maxHp", default: 6, for: "npc" },
    { id: "maxStress", default: 0, for: "npc" },
  ],
  sizes: [
    { id: "small", name: "Small", cells: 1 },
    { id: "medium", name: "Medium", cells: 1 },
    { id: "large", name: "Large", cells: 2 },
  ],
  scene: { unit: 5, unitName: "ft", diagonal: "euclid" },
  npcFields: [
    { id: "difficulty", label: "Difficulty", type: "number", default: 10 },
    {
      id: "majorThreshold",
      label: "Major Threshold",
      type: "number",
      default: 5,
    },
    {
      id: "severeThreshold",
      label: "Severe Threshold",
      type: "number",
      default: 10,
    },
    { id: "stress", label: "Stress", type: "number" },
    { id: "damage", label: "Damage", type: "text", rollable: true },
    { id: "features", label: "Features", type: "longtext" },
  ],
  derive(character, sources) {
    const classData = CLASSES.find((entry) => entry.id === character.data.classId) ?? CLASSES[0]!;
    const subclass = SUBCLASSES.find((entry) => entry.id === character.data.subclassId);
    const level = Math.max(1, Number(character.data.level ?? 1));
    const advancements = commaListOf(character.data.advancements);
    const countAdvancement = (id: string) => advancements.filter((entry) => entry === id).length;
    const proficiency = 1 + (level >= 2 ? 1 : 0) + (level >= 5 ? 1 : 0) + (level >= 8 ? 1 : 0);
    const mods = Object.fromEntries(
      TRAITS.map(({ id }) => [
        id,
        Math.max(-1, Math.min(3, Math.trunc(character.scores[id] ?? 0))),
      ]),
    );
    const spellcastTrait = traitsByName.get(
      String(character.data.spellcastTrait || subclass?.spellcastTrait || "").toLowerCase(),
    );
    const resolved = resolveEffects(
      {
        armorScore: 0,
        baseMajorThreshold: 0,
        baseSevereThreshold: 0,
        maxHp:
          character.kind === "npc"
            ? Number(character.fields.hp ?? character.data.maxHp ?? 6)
            : classData.hp + Number(character.data.hpBonus ?? 0) + countAdvancement("hp-slot"),
        maxStress:
          character.kind === "npc"
            ? Number(character.fields.stress ?? character.data.maxStress ?? 0)
            : 6 + Number(character.data.stressBonus ?? 0) + countAdvancement("stress-slot"),
        maxHope: 6 + Number(character.data.hopeBonus ?? 0),
        evasion:
          character.kind === "npc"
            ? Number(character.fields.evasion ?? character.fields.difficulty ?? 10)
            : classData.evasion,
        proficiency: proficiency + countAdvancement("proficiency"),
        spellcast: spellcastTrait ? (mods[spellcastTrait] ?? 0) : 0,
        evasionBonus: countAdvancement("evasion"),
        thresholdBonus: countAdvancement("thresholds"),
        experienceSlots: 2 + (level >= 2 ? 1 : 0) + (level >= 5 ? 1 : 0) + (level >= 8 ? 1 : 0),
      },
      sources,
    );
    return {
      mods: { ...mods, spellcast: resolved.values.spellcast ?? 0 },
      resolved,
      values: {
        ...resolved.values,
        majorThreshold:
          character.kind === "npc"
            ? Number(character.fields.majorThreshold ?? 5)
            : (resolved.values.baseMajorThreshold ?? 0) +
              level +
              (resolved.values.thresholdBonus ?? 0),
        severeThreshold:
          character.kind === "npc"
            ? Number(character.fields.severeThreshold ?? 10)
            : (resolved.values.baseSevereThreshold ?? 0) +
              level +
              (resolved.values.thresholdBonus ?? 0),
        difficulty:
          character.kind === "npc"
            ? Number(character.fields.difficulty ?? character.data.difficulty ?? 10)
            : (resolved.values.evasion ?? 0) + (resolved.values.evasionBonus ?? 0),
        evasion:
          character.kind === "npc"
            ? Number(character.fields.evasion ?? character.fields.difficulty ?? 10)
            : (resolved.values.evasion ?? 0) + (resolved.values.evasionBonus ?? 0),
        experienceSlots: resolved.values.experienceSlots ?? 0,
        milestoneNeeded: level < 10 ? 1 : 2,
      },
    };
  },
  actionsFor(character) {
    if (character.kind === "npc") return [];
    const ownClassActions = classActions.filter(
      (entry) =>
        entry.id.startsWith(`class-${character.data.classId}-`) ||
        entry.id.startsWith(`hope-${character.data.classId}-`) ||
        (!!character.data.multiclassClass &&
          entry.id.startsWith(`class-${character.data.multiclassClass}-`)),
    );
    const ownSubclassActions = subclassActions
      .filter(
        (entry) =>
          (entry.subclassId === character.data.multiclassSubclass && entry.level === 1) ||
          (entry.classId === character.data.classId &&
            entry.subclassId === character.data.subclassId &&
            (entry.level === 1 ||
              (entry.level === 5 && character.data.subclassSpecialization) ||
              (entry.level === 8 && character.data.subclassMastery))),
      )
      .map((entry) => entry.action);
    const ownAncestry = ancestryActions
      .filter((entry) => entry.ancestryId === character.data.ancestry)
      .map((entry) => entry.action);
    const ownCommunity = communityActions
      .filter((entry) => entry.communityId === character.data.community)
      .map((entry) => entry.action);
    const selectedCards = new Set(commaListOf(character.data.activeDomainCards).slice(0, 5));
    const ownCards = domainActions
      .filter((entry) => selectedCards.has(entry.cardId))
      .map((entry) => entry.action);
    const weapons = WEAPONS.filter((weapon) =>
      character.inventory.some((item) => item.defId === `weapon-${weapon.id}` && item.equipped),
    )
      .map((weapon) => weaponActions.find((entry) => entry.id === `attack-${weapon.id}`)!)
      .filter(Boolean);
    return [
      ...ownClassActions,
      ...ownSubclassActions,
      ...ownAncestry,
      ...ownCommunity,
      ...ownCards,
      ...weapons,
      ...TRAITS.map((trait) =>
        daggerheart.actions.find((entry) => entry.id === `trait-${trait.id}`)!,
      ),
    ];
  },
  tokenStats: (character, derived) => [hpTokenStat(character, derived.values.maxHp ?? 0)],
  creation: {
    advancementField: "level",
    advancementCounterField: "milestone",
    choicesPerAdvancement: 2,
    listFields: ["advancements", "domainCards", "activeDomainCards"],
    markedStatsField: "markedTraits",
    resetMarkedStatsAt: [5, 8],
    choices: [
      {
        id: "class",
        label: "Class",
        plural: "Classes",
        field: "classId",
        at: "create",
        options: CLASS_OPTIONS,
      },
      {
        id: "subclass",
        label: "Subclass",
        field: "subclassId",
        at: "create",
        options: SUBCLASS_OPTIONS,
      },
      {
        id: "ancestry",
        label: "Ancestry",
        field: "ancestry",
        at: "create",
        options: ANCESTRIES.map((entry) => ({
          id: entry.id,
          name: entry.name,
          text: `${entry.description}\n${entry.features.map((feature) => `${feature.name}: ${plainText(feature.text)}`).join("\n")}`,
        })),
      },
      {
        id: "community",
        label: "Community",
        field: "community",
        at: "create",
        options: COMMUNITIES.map((entry) => ({
          id: entry.id,
          name: entry.name,
          text: `${entry.description}\n${entry.feature.name}: ${plainText(entry.feature.text)}`,
        })),
      },
      ...[1, 2].map((index) => ({
        id: `domain-card-${index}`,
        label: `Domain Card ${index}`,
        field: "domainCards",
        at: "create" as const,
        options: DOMAIN_OPTIONS.filter(
          (option) => DOMAIN_CARDS.find((card) => card.id === option.id)!.level === 1,
        ),
      })),
      ...Array.from({ length: 9 }, (_, index) => {
        const level = index + 2;
        return {
          id: `domain-card-${level}`,
          label: `Level ${level} Domain Card`,
          field: "domainCards",
          at: level,
          options: domainOptionsAt(level),
        };
      }),
      ...Array.from({ length: 9 }, (_, index) => {
        const level = index + 2;
        return [1, 2].map((slot) => ({
          id: `advancement-${level}-${slot}`,
          label: `Advancement ${slot}`,
          field: "advancements",
          at: level,
          optional: true,
          options: advancementOptionsAt(level),
        }));
      }).flat(),
    ],
    scores: { standardArray: [2, 1, 1, 0, 0, -1] },
  },
  sheet: {
    pc: [
      { kind: "header" },
      {
        kind: "choices",
        choices: ["subclass", "ancestry", "community"],
      },
      { kind: "loadout", loadout: "domain" },
      {
        kind: "counters",
        items: [
          { label: "HP", resource: "hp", max: "maxHp" },
          { label: "Stress", resource: "stress", max: "maxStress" },
          { label: "Hope", resource: "hope", max: "maxHope" },
          { label: "Armor Slots", resource: "armor", max: "armorScore" },
          { label: "Level", data: "level" },
          { label: "Milestone", data: "milestone", max: "milestoneNeeded" },
        ],
      },
      {
        kind: "advancement",
        xp: "milestone",
        needed: "milestoneNeeded",
        field: "level",
        label: "Milestone reached.",
        button: "Level Up",
      },
      {
        kind: "derived",
        items: [
          { label: "Evasion", value: "evasion" },
          { label: "Proficiency", value: "proficiency" },
          { label: "Major Threshold", value: "majorThreshold" },
          { label: "Severe Threshold", value: "severeThreshold" },
        ],
      },
      { kind: "stats", label: "Traits" },
      { kind: "actions", label: "Domain Cards & Features" },
      { kind: "inventory" },
      {
        kind: "fields",
        label: "Experiences",
        items: Array.from({ length: 5 }, (_, index) => [
          {
            field: `experience${index + 1}Name`,
            label: `Experience ${index + 1}`,
            type: "text" as const,
          },
          {
            field: `experience${index + 1}Bonus`,
            label: `Experience ${index + 1} bonus`,
            type: "number" as const,
            min: 0,
            max: 10,
          },
        ]).flat(),
      },
    ],
    npc: [
      { kind: "header" },
      {
        kind: "counters",
        items: [
          { label: "HP", resource: "hp", max: "maxHp" },
          { label: "Max HP", data: "maxHp", input: true },
          { label: "Stress", resource: "stress", max: "maxStress" },
        ],
      },
      { kind: "npcFields" },
      { kind: "inventory" },
      { kind: "text", fields: [{ field: "notes", label: "Notes" }] },
    ],
  },
  attribution:
    "Daggerheart System Reference Document 1.0 content used under the Darrington Press Community Gaming License (DPCGL). Daggerheart and related marks are trademarks of Critical Role, LLC. This project is unaffiliated with or endorsed by Critical Role or Darrington Press.",
};
