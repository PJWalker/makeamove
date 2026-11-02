import { parse } from "../../dice/notation";
import { parseCommaList } from "../../lib/list";
import { resolveEffects } from "../effects";
import type { ActionDef, CheckStep, GameSystem } from "../types";
import { abilityRules, CREW_ABILITIES as CREW_RULES } from "./content";

const ACTIONS = [
  ["hunt", "Hunt", "Track a target or attack at range."],
  ["study", "Study", "Examine details and interpret evidence."],
  ["survey", "Survey", "Observe a situation and anticipate trouble."],
  ["tinker", "Tinker", "Build, repair, or tamper with devices."],
  ["finesse", "Finesse", "Use dexterity or subtle misdirection."],
  ["prowl", "Prowl", "Move quietly, climb, or attack from concealment."],
  ["skirmish", "Skirmish", "Fight in close combat."],
  ["wreck", "Wreck", "Destroy or sabotage through force."],
  ["attune", "Attune", "Open your mind to supernatural forces."],
  ["command", "Command", "Demand obedience or lead with authority."],
  ["consort", "Consort", "Socialize and connect with others."],
  ["sway", "Sway", "Influence through charm, deception, or argument."],
] as const;

export const ATTRIBUTES = [
  {
    id: "insight",
    name: "Insight",
    actions: ["hunt", "study", "survey", "tinker"],
  },
  {
    id: "prowess",
    name: "Prowess",
    actions: ["finesse", "prowl", "skirmish", "wreck"],
  },
  {
    id: "resolve",
    name: "Resolve",
    actions: ["attune", "command", "consort", "sway"],
  },
];

const RESULTS = [
  { id: "critical", label: "Critical", tone: "good" as const },
  { id: "strong", label: "6", tone: "good" as const },
  { id: "weak-controlled", label: "4/5: controlled", tone: "mixed" as const },
  { id: "weak", label: "4/5: risky", tone: "mixed" as const },
  { id: "weak-desperate", label: "4/5: desperate", tone: "mixed" as const },
  { id: "miss-controlled", label: "1-3: controlled", tone: "bad" as const },
  { id: "miss", label: "1-3: risky", tone: "bad" as const },
  { id: "miss-desperate", label: "1-3: desperate", tone: "bad" as const },
];

const outcomes = (
  critical: string,
  strong: string,
  weak: string,
  miss: string,
) =>
  Object.fromEntries(
    RESULTS.map(({ id }) => [
      id,
      id === "critical"
        ? critical
        : id === "strong"
          ? strong
          : id.startsWith("weak")
            ? weak
            : miss,
    ]),
  );

const actionOutcomes = {
  ...outcomes(
    "You achieve your goal with increased effect.",
    "You achieve your goal.",
    "You achieve your goal, but suffer a consequence such as harm, reduced effect, or a complication.",
    "Things go badly: harm, a complication, a desperate position, or a lost opportunity.",
  ),
  "weak-controlled":
    "Withdraw and change approach, or succeed with a minor complication, reduced effect, lesser harm, or risky position.",
  "miss-controlled":
    "Withdraw and change approach, or seize a risky opportunity.",
  "weak-desperate":
    "You achieve your goal but suffer severe harm, a serious complication, or reduced effect. Mark attribute XP.",
  "miss-desperate":
    "Suffer severe harm, a serious complication, or lose the opportunity. Mark attribute XP.",
};

const check = (
  outcomes: Record<string, string>,
  extra: Partial<CheckStep> = {},
): CheckStep => ({ kind: "check", outcomes, ...extra });
const defineAction = (
  id: string,
  name: string,
  category: string,
  trigger: string,
  text: string,
  step?: CheckStep,
): ActionDef => ({
  id,
  name,
  category,
  trigger,
  text,
  steps: step ? [step] : [],
});

const RESISTANCE = outcomes(
  "Resistance works; clear 1 stress.",
  "Resistance works without stress.",
  "Resistance works; take stress equal to 6 minus the kept die.",
  "Resistance works; take stress equal to 6 minus the kept die.",
);
const CLOCK = outcomes(
  "Mark 5 segments.",
  "Mark 3 segments.",
  "Mark 2 segments.",
  "Mark 1 segment.",
);
const CLOCK_FOLLOWUPS = {
  critical: ["clock-5"],
  strong: ["clock-3"],
  "weak-controlled": ["clock-2"],
  weak: ["clock-2"],
  "weak-desperate": ["clock-2"],
  "miss-controlled": ["clock-1"],
  miss: ["clock-1"],
  "miss-desperate": ["clock-1"],
};
const DICE = {
  kind: "number" as const,
  label: "Dice",
  prompt: "Dice pool",
  min: 0,
  max: 20,
};
const sumFlats = (formula: string) =>
  parse(formula).reduce(
    (sum, term) => sum + (term.kind === "flat" ? term.sign * term.value : 0),
    0,
  );

const moveActions = ACTIONS.map(([id, name, description]) =>
  defineAction(
    id,
    name,
    "action",
    `When you ${name.toLowerCase()} to overcome trouble`,
    `${description} Establish position and effect with the GM. Assistance, pushing yourself, or a devil's bargain can add dice.`,
    check(actionOutcomes, {
      stat: id,
      followUpsFor: (roll) =>
        roll.terms[0]?.label?.toLowerCase() === "desperate"
          ? [
              `xp-${ATTRIBUTES.find((attribute) => attribute.actions.includes(id))!.id}`,
            ]
          : [],
    }),
  ),
);

const resistanceActions = ATTRIBUTES.map(({ id, name }) =>
  defineAction(
    `resist-${id}`,
    `Resist with ${name}`,
    "resistance",
    `When you resist a consequence using ${name}`,
    "Resistance succeeds; the GM decides whether the consequence is reduced or avoided. Roll one die for each action in this attribute with at least one dot. Stress cost is 6 minus the highest die; a critical clears 1 stress.",
    check(RESISTANCE, {
      add: [{ value: id, label: "Resistance" }],
      followUps: { critical: ["clear-stress"] },
      followUpsFor: (roll) => {
        const first = roll.terms[0];
        const notation = parse(roll.formula)[0];
        const critical =
          first?.kind === "dice" &&
          notation?.kind === "dice" &&
          notation.keep?.which !== "low" &&
          first.dice.filter((die) => !die.disabled && die.value === 6).length >
            1;
        return critical || roll.total === 6
          ? []
          : [`resist-stress-${6 - roll.total}`];
      },
    }),
  ),
);

const VICE_ROLL = outcomes(
  "Clear stress equal to the highest die; check for overindulgence.",
  "Clear stress equal to the highest die; check for overindulgence.",
  "Clear stress equal to the highest die; check for overindulgence.",
  "Clear stress equal to the highest die; check for overindulgence.",
);

const PLAYBOOKS = [
  {
    id: "cutter",
    name: "Cutter",
    text: "A dangerous fighter. XP trigger: address a challenge with violence or coercion.",
    primary: "skirmish",
    secondary: "command",
    abilities: [
      "Battleborn",
      "Bodyguard",
      "Leader",
      "Mule",
      "Not to be trifled with",
      "Savage",
      "Vigorous",
    ],
  },
  {
    id: "hound",
    name: "Hound",
    text: "A relentless tracker. XP trigger: address a challenge with tracking or violence.",
    primary: "hunt",
    secondary: "survey",
    abilities: [
      "Sharpshooter",
      "Focused",
      "Scout",
      "Vengeful",
      "Tough as nails",
    ],
  },
  {
    id: "leech",
    name: "Leech",
    text: "A technical expert. XP trigger: address a challenge with technical skill or mayhem.",
    primary: "tinker",
    secondary: "wreck",
    abilities: [
      "Alchemist",
      "Analyst",
      "Artificer",
      "Saboteur",
      "Strange methods",
    ],
  },
  {
    id: "lurk",
    name: "Lurk",
    text: "An elusive infiltrator. XP trigger: address a challenge with stealth or evasion.",
    primary: "prowl",
    secondary: "finesse",
    abilities: [
      "Ambush",
      "Daredevil",
      "The devil's footsteps",
      "Expertise",
      "Reflexes",
      "Shadow",
    ],
  },
  {
    id: "slide",
    name: "Slide",
    text: "A persuasive manipulator. XP trigger: address a challenge with deception or influence.",
    primary: "sway",
    secondary: "consort",
    abilities: [
      "Rook's gambit",
      "Like looking into a mirror",
      "A little something on the side",
      "Mesmerism",
      "Subterfuge",
      "Trust in me",
    ],
  },
  {
    id: "spider",
    name: "Spider",
    text: "A calculating mastermind. XP trigger: address a challenge with calculation or conspiracy.",
    primary: "consort",
    secondary: "study",
    abilities: [
      "Foresight",
      "Calculating",
      "Connected",
      "Mastermind",
      "Weaving the web",
    ],
  },
  {
    id: "whisper",
    name: "Whisper",
    text: "An occult practitioner. XP trigger: address a challenge with knowledge or arcane power.",
    primary: "attune",
    secondary: "study",
    abilities: [
      "Arcane mind",
      "Iron will",
      "Ritual",
      "Strange methods",
      "Warded",
    ],
  },
];

const CREW_TYPES = [
  "assassins",
  "bravos",
  "cult",
  "hawkers",
  "shadows",
  "smugglers",
];
const CREW_REPUTATIONS = [
  "ambitious",
  "brutal",
  "daring",
  "honorable",
  "professional",
  "savvy",
  "subtle",
  "strange",
];
const CREW_ABILITIES = CREW_RULES.map((ability) => ability.name);
const CREW_UPGRADES = [
  "Boat house",
  "Carriage house",
  "Cohort",
  "Hidden lair",
  "Mastery",
  "Quality: gear",
  "Quality: weapons",
  "Quarters",
  "Secure lair",
  "Training: Insight",
  "Training: Prowess",
  "Training: Resolve",
  "Training: Playbook",
  "Vault",
  "Workshop",
];

const ABILITIES_BY_PLAYBOOK: Record<string, { name: string; text: string }[]> =
  {
    cutter: [
      {
        name: "Battleborn",
        text: "Use special armor to reduce combat harm or push yourself in a fight.",
      },
      {
        name: "Bodyguard",
        text: "Gain a die when resisting a consequence taken while protecting a teammate; gain effect when surveying threats.",
      },
      {
        name: "Arcane fighter",
        text: "Imbue your hands, melee weapons, or tools with spirit energy for potency against supernatural foes.",
      },
      {
        name: "Leader",
        text: "Your commanded cohorts fight harder, gain effect, and have armor.",
      },
      {
        name: "Mule",
        text: "Increase the amount of load you can carry at each load level.",
      },
      {
        name: "Not to be trifled with",
        text: "Push yourself for a feat of superhuman force or to face a small gang on equal footing.",
      },
      {
        name: "Savage",
        text: "Your violent reputation makes your threats and attacks more frightening.",
      },
      {
        name: "Vigorous",
        text: "Gain an extra healing-clock segment and a bonus die when recovering.",
      },
    ],
    hound: [
      {
        name: "Sharpshooter",
        text: "Push yourself to make an otherwise impossible long-range shot or suppress a small gang with sustained fire.",
      },
      {
        name: "Focused",
        text: "Spend special armor to negate surprise or mental harm, or push yourself for ranged combat or tracking without stress.",
      },
      {
        name: "Scout",
        text: "Gain increased effect when locating a target, and a bonus die to avoid detection from a prepared position or camouflage.",
      },
      {
        name: "Vengeful",
        text: "Gain an additional XP trigger for getting payback against someone who harmed you or someone you care about.",
      },
      {
        name: "Tough as nails",
        text: "Harm penalties affect you as if they were one level less severe; level 4 harm remains fatal.",
      },
    ],
    leech: [
      {
        name: "Alchemist",
        text: "Gain improved results when inventing or crafting alchemical creations and begin with a known formula.",
      },
      {
        name: "Analyst",
        text: "During downtime, mark two segments across investigation or formula/design long-term projects.",
      },
      {
        name: "Artificer",
        text: "Gain improved results when inventing or crafting spark-craft creations and begin with a known design.",
      },
      {
        name: "Fortitude",
        text: "Spend special armor to resist fatigue, weakness, or chemical consequences, or push yourself for technical work.",
      },
      {
        name: "Saboteur",
        text: "Make Wreck work quieter and conceal the resulting damage from casual inspection.",
      },
      {
        name: "Infiltrator",
        text: "Ignore enemy quality or Tier penalties when bypassing security.",
      },
      {
        name: "Strange methods",
        text: "Gain improved results when inventing or crafting arcane creations and begin with a known design.",
      },
      {
        name: "Supernatural ward",
        text: "Make an area hostile or alluring to supernatural entities through arcane sabotage.",
      },
    ],
    lurk: [
      {
        name: "Ambush",
        text: "Gain a bonus die when attacking from hiding or springing a trap.",
      },
      {
        name: "Daredevil",
        text: "On a desperate action, trade a die from consequence resistance for a bonus action die.",
      },
      {
        name: "The devil's footsteps",
        text: "Push yourself for an extreme athletic feat or briefly turn enemies against one another.",
      },
      {
        name: "Expertise",
        text: "When leading a group action with one chosen action, cap your resulting stress at 1.",
      },
      {
        name: "Reflexes",
        text: "When timing determines who acts first, you do.",
      },
      {
        name: "Shadow",
        text: "Spend special armor to resist detection/security consequences or push yourself for athletics or stealth.",
      },
    ],
    slide: [
      {
        name: "Rook's gambit",
        text: "Take 2 stress to roll your best action rating while performing another action.",
      },
      {
        name: "Like looking into a mirror",
        text: "You can always tell when someone is lying to you.",
      },
      {
        name: "A little something on the side",
        text: "Gain 2 stash at the end of each downtime phase.",
      },
      {
        name: "Mesmerism",
        text: "When you Sway someone, you can make them forget the interaction until you meet again.",
      },
      {
        name: "Subterfuge",
        text: "Spend special armor to resist suspicion/persuasion consequences or push yourself for subterfuge.",
      },
      {
        name: "Trust in me",
        text: "Gain a bonus die against someone with whom you have an intimate relationship.",
      },
    ],
    spider: [
      {
        name: "Foresight",
        text: "Assist a teammate twice per score without paying stress by describing prior preparation.",
      },
      {
        name: "Calculating",
        text: "Give yourself or another crew member one additional downtime activity.",
      },
      {
        name: "Connected",
        text: "Improve the result level of downtime asset acquisition or heat reduction.",
      },
      {
        name: "Mastermind",
        text: "Spend special armor to protect a teammate remotely or push yourself for information or a long-term project.",
      },
      {
        name: "Weaving the web",
        text: "Gain a bonus die to Consort for score information and to that operation’s engagement roll.",
      },
    ],
    whisper: [
      {
        name: "Arcane mind",
        text: "Sense nearby supernatural entities and gain a bonus die when gathering information about them.",
      },
      {
        name: "Iron will",
        text: "Resist supernatural terror and gain a bonus die to Resolve resistance rolls.",
      },
      {
        name: "Ritual",
        text: "Learn and perform occult rituals; begin with one ritual already learned.",
      },
      {
        name: "Strange methods",
        text: "Gain improved results when inventing or crafting arcane creations and begin with a known design.",
      },
      {
        name: "Warded",
        text: "Spend special armor to resist supernatural consequences or push yourself while working with arcane forces.",
      },
    ],
  };

const PLAYBOOK_ABILITIES = PLAYBOOKS.flatMap((playbook) =>
  (ABILITIES_BY_PLAYBOOK[playbook.id] ?? []).map((ability) => ({
    id: `ability-${playbook.id}-${ability.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    playbook: playbook.id,
    ...ability,
    text: abilityRules(ability.name) ?? ability.text,
  })),
);
const PLAYBOOK_ACTIONS: ActionDef[] = PLAYBOOK_ABILITIES.map((ability) => ({
  id: ability.id,
  name: ability.name,
  category: "ability",
  trigger: `${ability.playbook} playbook ability`,
  text: ability.text,
  steps: [],
}));

export const TRAUMAS = [
  ["cold", "Cold"],
  ["haunted", "Haunted"],
  ["obsessed", "Obsessed"],
  ["paranoid", "Paranoid"],
  ["reckless", "Reckless"],
  ["soft", "Soft"],
  ["unstable", "Unstable"],
  ["vicious", "Vicious"],
] as const;

const ITEMS = ([
  ["blade", "Blade", 1],
  ["pistols", "Pistols", 1],
  ["large-weapon", "Large weapon", 2],
  ["armor", "Armor", 2],
  ["heavy-armor", "Heavy armor", 3],
  ["burglary-kit", "Burglary kit", 1],
  ["climbing-kit", "Climbing kit", 2],
  ["occult-tools", "Occult tools", 1],
  ["papers", "Documents", 0],
] as const).map(([id, name, weight]) => ({
  id: String(id),
  name: String(name),
  weight: Number(weight),
  description: "Declare use during the score; count its load when selected.",
  tags: [],
  equippable: true,
}));

export const bladesInTheDark: GameSystem = {
  id: "blades-in-the-dark",
  name: "Blades in the Dark",
  version: "0.1.0",
  campaignLabel: "Crew",
  campaignFields: [
    {
      id: "crewType",
      label: "Crew type",
      type: "select",
      default: "smugglers",
      options: CREW_TYPES.map((value) => ({ id: value, label: value })),
    },
    {
      id: "crewTier",
      label: "Tier",
      type: "number",
      default: 0,
      min: 0,
      max: 4,
    },
    {
      id: "crewHold",
      label: "Hold",
      type: "select",
      default: "strong",
      options: [
        { id: "strong", label: "Strong" },
        { id: "weak", label: "Weak" },
      ],
    },
    {
      id: "crewRep",
      label: "Rep",
      type: "number",
      default: 0,
      min: 0,
      max: 12,
    },
    {
      id: "crewCoin",
      label: "Coin",
      type: "number",
      default: 2,
      min: 0,
      max: 100,
    },
    {
      id: "crewHeat",
      label: "Heat",
      type: "number",
      default: 0,
      min: 0,
      max: 100,
    },
    {
      id: "crewWanted",
      label: "Wanted",
      type: "number",
      default: 0,
      min: 0,
      max: 4,
    },
    {
      id: "crewReputation",
      label: "Reputation",
      type: "select",
      default: "professional",
      options: CREW_REPUTATIONS.map((value) => ({ id: value, label: value })),
    },
    { id: "crewLair", label: "Lair", type: "text", default: "" },
    {
      id: "huntingGrounds",
      label: "Hunting grounds",
      type: "text",
      default: "",
    },
    {
      id: "preferredOperation",
      label: "Preferred operation",
      type: "text",
      default: "",
    },
    { id: "crewContact", label: "Favorite contact", type: "text", default: "" },
    {
      id: "crewTurf",
      label: "Turf",
      type: "number",
      default: 0,
      min: 0,
      max: 6,
    },
    {
      id: "crewUpgradePoints",
      label: "Unspent upgrades",
      type: "number",
      default: 0,
      min: 0,
      max: 100,
    },
    {
      id: "factions",
      label: "Factions and statuses",
      type: "text",
      default: "",
    },
    { id: "claims", label: "Claims", type: "text", default: "" },
    {
      id: "cohorts",
      label: "Cohorts, types, edges, flaws, and harm",
      type: "text",
      default: "",
    },
    {
      id: "crewAbilities",
      label: "Crew abilities",
      type: "multiselect",
      default: "",
      options: CREW_ABILITIES.map((value) => ({
        id: value.toLowerCase().replaceAll(" ", "-"),
        label: value,
      })),
    },
    {
      id: "crewUpgrades",
      label: "Crew upgrades",
      type: "multiselect",
      default: "",
      options: CREW_UPGRADES.map((value) => ({
        id: value.toLowerCase().replaceAll(" ", "-").replaceAll(":", ""),
        label: value,
      })),
    },
  ],
  counters: [{ id: "crew-xp", label: "Crew XP", start: 0, max: 10 }],
  stats: ACTIONS.map(([id, name]) => ({
    id,
    name,
    abbr: name,
    default: 0,
    min: 0,
    max: 4,
  })),
  modifier: (value) => Math.max(0, Math.min(4, Math.floor(value))),
  baseRoll: "d6[Risky]",
  defaultRollLabel: "Risky",
  rollModes: [
    {
      id: "controlled",
      label: "Controlled",
      roll: "d6[Controlled]",
      categories: ["action"],
    },
    {
      id: "desperate",
      label: "Desperate",
      roll: "d6[Desperate]",
      categories: ["action"],
    },
  ],
  checkRoll(formula, _stat, _character, selected) {
    let count = sumFlats(formula);
    if (selected?.id === "engagement") count += 1;
    const label =
      selected?.category === "resistance"
        ? "Resistance"
        : selected?.id === "indulge-vice"
          ? "Vice"
          : selected?.id === "fortune" ||
              selected?.id === "recover" ||
              selected?.id === "acquire-asset"
            ? "Fortune"
            : (parse(formula)[0]?.label ?? "Pool");
    const dice = count > 0 ? `${count}d6kh1` : "2d6kl1";
    return `${dice}[${label}]`;
  },
  results: RESULTS,
  result(total, natural, rolled) {
    const first = rolled?.terms[0];
    const dice =
      first?.kind === "dice" ? first.dice.filter((die) => !die.disabled) : [];
    const specification = rolled ? parse(rolled.formula)[0] : undefined;
    const zeroDice =
      specification?.kind === "dice" && specification.keep?.which === "low";
    const values = dice.length ? dice.map((die) => die.value) : natural;
    if (!zeroDice && values.filter((value) => value === 6).length > 1)
      return "critical";
    const highest = zeroDice
      ? total
      : values.length
        ? Math.max(...values)
        : total;
    const band = highest === 6 ? "strong" : highest >= 4 ? "weak" : "miss";
    const position = first?.label?.toLowerCase();
    return band !== "strong" &&
      (position === "controlled" || position === "desperate")
      ? `${band}-${position}`
      : band;
  },
  actions: [
    ...moveActions,
    ...resistanceActions,
    defineAction(
      "fortune",
      "Fortune Roll",
      "special",
      "When uncertainty needs resolving without an action roll",
      "Choose an appropriate pool and interpret the highest die.",
      check(
        outcomes(
          "Exceptional result.",
          "Good result.",
          "Limited result.",
          "Poor result.",
        ),
        { ask: DICE },
      ),
    ),
    defineAction(
      "engagement",
      "Engagement Roll",
      "special",
      "When a score begins",
      "Begin with one die and adjust for major advantages and disadvantages. The result establishes the crew’s starting position.",
      check(
        outcomes(
          "The first obstacle is overcome; begin controlled.",
          "Begin controlled.",
          "Begin risky.",
          "Begin desperate.",
        ),
        { ask: { ...DICE, prompt: "Net advantage dice", min: -10, max: 10 } },
      ),
    ),
    defineAction(
      "acquire-asset",
      "Acquire Asset",
      "downtime",
      "When you obtain temporary use of an asset",
      "Roll crew tier; the result sets quality. Coin can improve the quality.",
      check(
        outcomes(
          "Quality: tier +2.",
          "Quality: tier +1.",
          "Quality: tier.",
          "Quality: tier -1.",
        ),
        { ask: { ...DICE, prompt: "Crew tier" } },
      ),
    ),
    defineAction(
      "long-term-project",
      "Long-term Project",
      "downtime",
      "When you work toward a long-term goal",
      "Describe your approach, choose a fitting action, and advance the project clock.",
      check(CLOCK, {
        ask: { kind: "stat" },
        counter: { prompt: "Project clock" },
        followUps: CLOCK_FOLLOWUPS,
      }),
    ),
    defineAction(
      "recover",
      "Recover",
      "downtime",
      "When you receive treatment for harm",
      "Roll healer quality (or Tinker for a PC with Physicker). A full healing clock reduces each harm by one level; excess segments carry over. New harm clears the healing clock.",
      check(CLOCK, {
        ask: { ...DICE, prompt: "Healer quality" },
        counter: { prompt: "Healing clock" },
        followUps: CLOCK_FOLLOWUPS,
      }),
    ),
    defineAction(
      "reduce-heat",
      "Reduce Heat",
      "downtime",
      "When you conceal evidence or deflect attention",
      "Describe your method and roll a fitting action.",
      check(
        outcomes(
          "Reduce heat by 5.",
          "Reduce heat by 3.",
          "Reduce heat by 2.",
          "Reduce heat by 1.",
        ),
        { ask: { kind: "stat" } },
      ),
    ),
    defineAction(
      "indulge-vice",
      "Indulge Vice",
      "downtime",
      "When you visit your vice purveyor",
      "Roll your lowest attribute and clear stress equal to the highest die. Clearing more stress than marked causes overindulgence; skipping vice costs stress equal to trauma.",
      check(VICE_ROLL, {
        add: [{ value: "vice", label: "Vice" }],
        followUpsFor: (roll) => [`vice-clear-${roll.total}`],
      }),
    ),
    defineAction(
      "train",
      "Train",
      "downtime",
      "When you practice during downtime",
      "Mark 1 XP on one attribute or playbook track. Crew training can add another XP; each track is trained once per downtime.",
    ),
    defineAction(
      "push-yourself",
      "Push Yourself",
      "special",
      "When you push beyond your limits",
      "Take 2 stress to add a die, increase effect, or act while incapacitated. Each benefit may be chosen once.",
    ),
    defineAction(
      "assist",
      "Assist",
      "special",
      "When you help another scoundrel",
      "Take 1 stress to grant +1 die. You may share the consequences. Only one assistant grants a die.",
    ),
    defineAction(
      "flashback",
      "Flashback",
      "special",
      "When preparation from the past matters during a score",
      "The GM sets stress cost: zero for ordinary preparation, one for a complex opportunity, or two or more for an elaborate plan.",
    ),
    defineAction(
      "end-session",
      "End of Session",
      "special",
      "When the session ends",
      "Mark playbook XP for its trigger and for expressing beliefs, drives, heritage, or background; mark attribute XP for desperate actions. A trigger that happened repeatedly may be worth 2 XP.",
    ),
    ...PLAYBOOK_ACTIONS,
  ],
  actionCategories: [
    { id: "action", label: "Actions" },
    { id: "resistance", label: "Resistance", onHotbar: false },
    { id: "downtime", label: "Downtime", onHotbar: false },
    { id: "special", label: "Special", onHotbar: false },
    { id: "ability", label: "Playbook abilities", onHotbar: false },
  ],
  followUps: [
    ...ATTRIBUTES.map((attribute) => ({
      id: `xp-${attribute.id}`,
      kind: "bump" as const,
      label: `Mark ${attribute.name} XP`,
      field: `${attribute.id}Xp`,
      by: 1,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `resist-stress-${index + 1}`,
      kind: "bump" as const,
      label: `Take ${index + 1} Stress`,
      field: "stress",
      by: index + 1,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `vice-clear-${index + 1}`,
      kind: "bump" as const,
      label: `Clear ${index + 1} Stress`,
      field: "stress",
      by: -index - 1,
    })),
    {
      id: "clear-stress",
      kind: "bump",
      label: "Clear 1 stress",
      field: "stress",
      by: -1,
    },
    { id: "clock-1", kind: "counter", label: "Mark 1 segment", by: 1 },
    { id: "clock-2", kind: "counter", label: "Mark 2 segments", by: 2 },
    { id: "clock-3", kind: "counter", label: "Mark 3 segments", by: 3 },
    { id: "clock-5", kind: "counter", label: "Mark 5 segments", by: 5 },
  ],
  items: ITEMS,
  tags: [],
  conditions: [
    ...TRAUMAS.map(([id, name]) => ({ id, name, effects: [] })),
    {
      id: "harm-1",
      name: "Level 1 harm",
      text: "Impedes relevant actions.",
      effects: [],
    },
    {
      id: "harm-2",
      name: "Level 2 harm",
      text: "One fewer die when the injury impedes an action.",
      effects: [],
    },
    {
      id: "harm-3",
      name: "Level 3 harm",
      text: "Requires help or pushing yourself to act.",
      effects: [],
    },
  ],
  modifiers: [{ id: "bonus-dice", label: "Bonus dice", until: "next-roll" }],
  resources: [],
  characterData: [
    { id: "playbook", default: "cutter", for: "pc" },
    { id: "vice", default: "pleasure", for: "pc" },
    ...[
      "stress",
      "coin",
      "stash",
      "playbookXp",
      "insightXp",
      "prowessXp",
      "resolveXp",
      "healing",
      "armorUsed",
      "heavyArmorUsed",
      "specialArmorUsed",
    ].map((id) => ({ id, default: 0, for: "pc" as const })),
    { id: "load", default: 5, for: "pc" },
    { id: "specialAbilities", default: "", for: "pc" },
    { id: "advancementCount", default: 0, for: "pc" },
  ],
  sizes: [
    { id: "person", name: "Person", cells: 1 },
    { id: "large", name: "Large", cells: 2 },
  ],
  scene: { unit: 1, unitName: "m", diagonal: "euclid" },
  npcFields: [
    { id: "quality", label: "Quality", type: "number" },
    { id: "faction", label: "Faction", type: "text" },
    { id: "drive", label: "Drive", type: "text" },
    { id: "abilities", label: "Abilities", type: "longtext" },
  ],
  derive(character, sources) {
    const mods = Object.fromEntries(
      ACTIONS.map(([id]) => [
        id,
        Math.max(0, Math.min(4, Math.floor(character.scores[id] ?? 0))),
      ]),
    );
    const attributes = Object.fromEntries(
      ATTRIBUTES.map(({ id, actions }) => [
        id,
        actions.filter((actionId) => (mods[actionId] ?? 0) > 0).length,
      ]),
    );
    const abilities = parseCommaList(
      String(character.data.specialAbilities ?? ""),
    );
    const resolved = resolveEffects(
      {
        ...attributes,
        vice: Math.min(...Object.values(attributes)),
        maxStress: 9,
        maxHealing: abilities.includes("ability-cutter-vigorous") ? 3 : 4,
        maxArmor: 1,
        maxAttributeXp: 6,
        maxPlaybookXp: 8,
      },
      sources,
    );
    const trauma = TRAUMAS.filter(([id]) =>
      character.conditions.includes(id),
    ).length;
    return {
      mods,
      resolved,
      values: {
        ...resolved.values,
        trauma,
        load: character.inventory.reduce((sum, item) => sum + item.weight, 0),
        maxLoad:
          Number(character.data.load ?? 5) +
          (abilities.includes("ability-cutter-mule") ? 2 : 0),
      },
    };
  },
  actionsFor(character) {
    if (character.kind === "npc") return [];
    const abilities = parseCommaList(
      String(character.data.specialAbilities ?? ""),
    ).filter(Boolean);
    return [
      ...bladesInTheDark.actions.filter(
        (action) => action.category !== "ability",
      ),
      ...PLAYBOOK_ACTIONS.filter((action) => abilities.includes(action.id)),
    ];
  },
  tokenStats: (character, derived) =>
    character.kind === "npc"
      ? []
      : [
          {
            id: "stress",
            label: "Stress",
            value: Number(character.data.stress ?? 0),
            max: derived.values.maxStress ?? 0,
            colour: "#b84b42",
          },
        ],
  creation: {
    advancementField: "advancementCount",
    advancementCounterField: "playbookXp",
    listFields: ["specialAbilities"],
    choices: [
      {
        id: "playbook",
        label: "Playbook",
        field: "playbook",
        at: "create",
        options: PLAYBOOKS.map((playbook) => ({
          id: playbook.id,
          name: playbook.name,
          text: playbook.text,
          boost: {
            stats: [playbook.primary, playbook.secondary],
            amounts: [[2, 1]],
          },
        })),
      },
      {
        id: "vice",
        label: "Vice",
        field: "vice",
        at: "create",
        options: [
          "Faith",
          "Gambling",
          "Luxury",
          "Obligation",
          "Pleasure",
          "Stupor",
          "Weird",
        ].map((name) => ({
          id: name.toLowerCase(),
          name,
          text: `Describe how ${name.toLowerCase()} draws your character and name a purveyor.`,
        })),
      },
      {
        id: "specialAbility",
        label: "Starting special ability",
        field: "specialAbilities",
        at: "create",
        options: PLAYBOOK_ABILITIES.map((ability) => ({
          id: ability.id,
          name: ability.name,
          text: ability.text,
          requires: { playbook: ability.playbook },
        })),
      },
      {
        id: "playbook-advancement",
        label: "Playbook advancement",
        field: "specialAbilities",
        at: "advance",
        options: PLAYBOOK_ABILITIES.map((ability) => ({
          id: ability.id,
          name: ability.name,
          text: ability.text,
          notIncludes: [{ field: "specialAbilities", value: ability.id }],
        })),
      },
    ],
    scores: { pointBuy: { budget: 4, costs: { 0: 0, 1: 1, 2: 2 } } },
  },
  attribution:
    "Blades in the Dark by John Harper. Game rules summaries are original concise paraphrases of the Blades in the Dark SRD, CC BY 3.0. https://bladesinthedark.com/",
};
