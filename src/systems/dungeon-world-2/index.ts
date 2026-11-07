import { parse } from "../../features/dice/notation";
import { parseCommaList } from "../../lib/list";

import { resolveEffects } from "../effects";
import type { ActionDef, ChoiceDef, GameSystem, OptionDef } from "../types";
import { PATHS, sourceGmReference, sourceMoveOutcomes, sourceMoveRichText } from "./paths";
import { STRUGGLES } from "./struggles";
import { INITIAL_TREASURE_BOXES, MAX_TREASURE_BOXES } from "./wealth";
import { DW2_CLASS_GEAR, DW2_GEAR, DW2_MAGIC_ITEMS } from "./gear";
import { DW2_CLASS_SCORE_ASSIGNMENTS } from "./stats";
import { CLASS_STARTING_CHOICES } from "./startingOptions";
import { dw2Library } from "./library";

type Band = "strong" | "weak" | "miss";
type MoveSpec = {
  id: string;
  name: string;
  category: "basic" | "special" | "campaign" | "class";
  trigger: string;
  text: string;
  stat?: string | "choose" | "none";
  outcomes?: Record<Band, string>;
  classId?: string;
  sessionUse?: "character" | "campaign";
};

const STATS = [
  { id: "str", name: "Strength", abbr: "STR", condition: "exhausted" },
  { id: "dex", name: "Dexterity", abbr: "DEX", condition: "frightened" },
  { id: "int", name: "Intelligence", abbr: "INT", condition: "angry" },
  { id: "wis", name: "Wisdom", abbr: "WIS", condition: "distracted" },
  { id: "cha", name: "Charisma", abbr: "CHA", condition: "insecure" },
];

const CLASSES = [
  {
    id: "barbarian",
    name: "The Barbarian",
    hp: 12,
    description: "A powerful outsider shaped by a distant homeland.",
  },
  {
    id: "bard",
    name: "The Bard",
    hp: 8,
    description: "An artist who moves an audience through performance.",
  },
  {
    id: "cleric",
    name: "The Cleric",
    hp: 8,
    description: "A devoted emissary of a deity and its ideals.",
  },
  {
    id: "druid",
    name: "The Druid",
    hp: 8,
    description: "A shapeshifter with a close bond to the natural world.",
  },
  {
    id: "fighter",
    name: "The Fighter",
    hp: 10,
    description: "A practiced warrior with a distinctive signature weapon.",
  },
  {
    id: "paladin",
    name: "The Paladin",
    hp: 10,
    description: "A champion bound to a set of demanding oaths.",
  },
  {
    id: "ranger",
    name: "The Ranger",
    hp: 10,
    description: "A wilderness adventurer accompanied by a loyal beast.",
  },
  {
    id: "rogue",
    name: "The Rogue",
    hp: 8,
    description: "A resourceful specialist with a set of practiced skills.",
  },
  {
    id: "wizard",
    name: "The Wizard",
    hp: 6,
    description: "A scholar who combines prepared schools of magic.",
  },
];

const bands = (
  strong: string,
  weak: string,
  miss: string,
): Record<Band, string> => ({ strong, weak, miss });
const marksXp = (outcomes?: Record<Band, string>) =>
  /\bmark(?:s)?\s+(?:1\s+)?XP\b/i.test(outcomes?.miss ?? "");

const MOVE_SOURCE_NAMES: Record<string, string> = {
  "aid-a-pc": "Aid a PC",
  "cast-a-spell": "Cast a Spell",
  "comfort-or-support": "Comfort or Support",
  "defy-danger": "Defy Danger",
  "pull-strings": "Pull Strings",
  "sense-motive": "Sense Motive",
  "sneak-past": "Sneak Past",
  "spout-lore": "Spout Lore",
  "trade-blows": "Trade Blows",
  "unearth-secrets": "Unearth Secrets",
  "end-the-session": "End the Session",
  "enjoy-downtime": "Enjoy Downtime",
  "forge-a-bond": "Forge a Bond",
  "reveal-your-struggle": "Reveal Your Struggle",
  "face-death": "Face Death",
  "level-up": "Level Up",
  "make-camp": "Make Camp",
  "perform-a-ritual": "Perform a Ritual",
  "reach-your-limit": "Reach Your Limit",
  "perilous-journey": "Undertake a Perilous Journey",
  "barbarian-rage": "Rage!",
  "bard-perform-art": "Perform Your Art",
  "cleric-invoke-divine": "Invoke the Divine",
  "druid-shapeshift": "Shapeshift",
  "fighter-signature-weapon": "Signature Weapon",
  "paladin-oaths": "Oaths of Conviction",
  "ranger-animal-companion": "Animal Companion",
  "rogue-tricks-trade": "Tricks of the Trade",
  "wizard-weave-arcane": "Weave the Arcane",
};

const MOVES: MoveSpec[] = ([
  {
    id: "aid-a-pc",
    name: "Aid a PC",
    category: "basic",
    trigger: "When you help another PC",
    text: "Before their roll, agree whether the help is risky, stressful, or emotionally difficult. They gain advantage; apply the agreed cost in the fiction.",
  },
  {
    id: "cast-a-spell",
    name: "Cast a Spell",
    category: "basic",
    trigger: "When you invoke magic available to you",
    text: "The GM sets magnitude. If it exceeds your casting stat, negotiate a lesser effect or use a ritual. Equal magnitude imposes disadvantage; lower magnitude is rolled normally. On a partial success, choose a source-specific cost, mark a Condition, or accept a twist.",
    stat: "choose",
    outcomes: bands(
      "The spell takes effect as intended.",
      "The spell takes effect; choose a cost or complication.",
      "The magic goes badly wrong. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "comfort-or-support",
    name: "Comfort or Support",
    category: "basic",
    trigger: "Once per session, when you comfort or support another PC",
    sessionUse: "character",
    text: "Ask whether a relationship changed, the person opened up, or a Struggle was revealed. For each yes, the comforted PC chooses to clear a marked Condition, gain relationship Depth, or let the supporter clear a marked Condition.",
  },
  {
    id: "defy-danger",
    name: "Defy Danger",
    category: "basic",
    trigger: "When you contend with a risk or obstacle and no other move fits",
    text: "Describe your approach and choose the matching stat. On a partial success, prevail at a cost: mark a Condition, attract attention, or sacrifice something. A miss marks XP and gives the GM a move.",
    stat: "choose",
    outcomes: bands(
      "You overcome the danger cleanly.",
      "You prevail, but choose a cost.",
      "Your effort is thwarted or goes badly wrong. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "pull-strings",
    name: "Pull Strings",
    category: "basic",
    trigger: "When you influence an NPC to do what you want",
    text: "Choose an approach such as deception, honest persuasion, or a threat, then roll Charisma. The GM uses that approach to shape the consequences.",
    stat: "cha",
    outcomes: bands(
      "They do it as best they can.",
      "They try, but the GM adds a fitting complication.",
      "They make matters worse. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "sense-motive",
    name: "Sense Motive",
    category: "basic",
    trigger: "When you scrutinize someone through a conversation",
    text: "On a strong hit, ask two questions about their thoughts, feelings, or motives; on a partial hit, ask one. Answers are truthful. On a miss, an NPC may notice you; a PC may question you instead.",
    stat: "wis",
    outcomes: bands(
      "Ask two questions.",
      "Ask one question.",
      "An NPC discovers or interrupts you; mark XP. A PC may ask you a question instead.",
    ),
  },
  {
    id: "sneak-past",
    name: "Sneak Past",
    category: "basic",
    trigger: "When you stealthily evade notice",
    text: "On a partial success, the GM chooses a suspicion, a marked Condition, or a closing opportunity. A miss means you are spotted or expected; mark XP.",
    stat: "dex",
    outcomes: bands(
      "You remain undetected.",
      "You succeed, but the GM chooses a complication.",
      "You are spotted or expected. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "spout-lore",
    name: "Spout Lore",
    category: "basic",
    trigger: "When you rack your brain about a specific subject",
    text: "Ask the GM one question. Add one for each yes: you can consult a record, the subject relates to your Origins, or it relates to your Struggle.",
    outcomes: bands(
      "The GM answers generously; the first ally acting on it gains advantage.",
      "The GM gives a generous answer.",
      "The GM reveals danger or an unwelcome truth. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "trade-blows",
    name: "Trade Blows",
    category: "basic",
    trigger: "When you engage a foe in battle",
    text: "Choose Strength for melee or Dexterity for ranged combat. On a strong hit, choose an ally’s opportunity, maximum damage, or minimum damage suffered. On a partial hit, choose a Condition, a foe’s opportunity, or lose something. On a miss, choose minimum damage dealt or maximum damage suffered; mark XP.",
    stat: "choose",
    outcomes: bands(
      "Choose one strong-hit benefit.",
      "Choose one partial-hit cost.",
      "Choose min damage dealt or max damage suffered. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "unearth-secrets",
    name: "Unearth Secrets",
    category: "basic",
    trigger:
      "When you investigate a mysterious situation and the GM confirms there is a secret",
    text: "You always discover something. On a partial hit, choose an unclear clue, personal risk, or a marked Condition. A miss makes the discovery dangerous; mark XP.",
    stat: "int",
    outcomes: bands(
      "The discovery is clear and significant.",
      "Choose a complication for the discovery.",
      "The discovery is dangerous. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "end-the-session",
    name: "End the Session",
    category: "special",
    trigger: "When the session ends",
    sessionUse: "campaign",
    text: "As a group, answer the beta’s end-of-session questions. Everyone marks XP for each agreed yes.",
  },
  {
    id: "enjoy-downtime",
    name: "Enjoy Downtime",
    category: "campaign",
    trigger: "When you spend a few days resting in a safe place",
    text: "Use the campaign move to recover, resupply, shop, or train.",
  },
  {
    id: "forge-a-bond",
    name: "Forge a Bond",
    category: "campaign",
    trigger: "When two PCs have 3 Depth with each other",
    text: "Clear both Relationship tracks and choose whether to establish a new Bond, reinforce an existing Bond, or ask each other how you really feel.",
  },
  {
    id: "reveal-your-struggle",
    name: "Reveal Your Struggle",
    category: "campaign",
    trigger: "When you Make Camp with a locked Condition, or when you Level Up",
    text: "Confess a terrible truth about your Struggle, reveal or deepen it, and clear a locked Condition if you have one.",
  },
  {
    id: "face-death",
    name: "Face Death",
    category: "special",
    trigger: "When you are at 0 HP and take decisive action",
    text: "While Helpless, choose to gamble with Death: roll without a stat. A strong hit restores half your maximum HP before the action; a partial hit costs you something or your life; a miss means death before the Scene ends. You may instead narrate a final deed and die.",
    stat: "none",
    outcomes: bands(
      "Recover half your maximum HP, then act.",
      "Accept a lasting loss and recover 1 HP, or die after acting.",
      "You cannot act and will die before the Scene ends.",
    ),
  },
  {
    id: "level-up",
    name: "Level Up",
    category: "special",
    trigger: "When you mark the fifth XP",
    text: "Clear XP, increase level and current and maximum HP by 1 (up to ten total increases), and take an advancement available at your new level or below.",
  },
  {
    id: "make-camp",
    name: "Make Camp",
    category: "special",
    trigger: "Once per session, when the party rests for a few hours",
    sessionUse: "campaign",
    text: "Describe the rest together. The world advances; each PC restores all HP and clears one marked Condition.",
  },
  {
    id: "perform-a-ritual",
    name: "Perform a Ritual",
    category: "special",
    trigger: "When you draw on a source of magical power for an effect",
    text: "Describe the effect. The GM sets requirements based on its magnitude; the effect occurs once the requirements are fulfilled.",
  },
  {
    id: "reach-your-limit",
    name: "Reach Your Limit",
    category: "special",
    trigger: "When you mark your last Condition",
    text: "Clear marked Conditions, act out an outburst associated with one, then lock that Condition.",
  },
  {
    id: "perilous-journey",
    name: "Undertake a Perilous Journey",
    category: "special",
    trigger: "When you travel through hostile territory to a known destination",
    text: "Choose a leader and pace. A quick pace gives -1 and marks a Condition for everyone; a regular pace gives +1 and marks one for the leader; a careful pace gives +2. A strong hit brings a boon, a partial hit offers a complication, and a miss lets danger surprise you; everyone marks XP.",
    stat: "choose",
    outcomes: bands(
      "Arrive with a boon.",
      "Arrive with a complication chosen from the move.",
      "A danger surprises the party. Everyone marks XP; the GM makes a move.",
    ),
  },
  {
    id: "barbarian-rage",
    name: "Rage!",
    category: "class",
    classId: "barbarian",
    trigger: "When you enter a rage",
    text: "Mark Angry. While raging, gain the move’s listed combat benefits and restrictions; calm down by accepting a different Condition to clear Angry.",
  },
  {
    id: "bard-perform-art",
    name: "Perform Your Art",
    category: "class",
    classId: "bard",
    trigger: "When you perform your art for an audience",
    text: "On a strong hit, choose three audience effects; on a partial hit choose two; on a miss choose one and mark a Condition. Options can clear a marked Condition, deepen a PC relationship, restore an artistic resource, or win an NPC’s attention.",
    stat: "cha",
    outcomes: bands(
      "Choose three effects.",
      "Choose two effects.",
      "Choose one effect and mark a Condition.",
    ),
  },
  {
    id: "cleric-invoke-divine",
    name: "Invoke the Divine",
    category: "class",
    classId: "cleric",
    trigger: "When you invoke your deity by name",
    text: "Define a deity, domains, worshippers, and enemies. You may cast spells within the deity’s domains using Wisdom; disapproval on a partial hit reduces your relationship Depth.",
  },
  {
    id: "druid-shapeshift",
    name: "Shapeshift",
    category: "class",
    classId: "druid",
    trigger: "When you transform into a previously encountered beast",
    text: "Choose a fitting adaptation and roll Wisdom. A partial hit introduces an instinct to follow or resist; a miss limits your control. You cannot speak except with other PCs while transformed.",
    stat: "wis",
    outcomes: bands(
      "Transform and gain the adaptation.",
      "Transform; the GM names an instinct.",
      "Transform, but lose control for now. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "fighter-signature-weapon",
    name: "Signature Weapon",
    category: "class",
    classId: "fighter",
    trigger: "When you define your signature weapon",
    text: "Choose a weapon base and two enhancements with the GM, then name it. Its range, tags, and damage are recorded in your inventory.",
  },
  {
    id: "paladin-oaths",
    name: "Oaths of Conviction",
    category: "class",
    classId: "paladin",
    trigger: "When you swear service to a liege",
    text: "Name a liege and take the listed oaths. Each oath grants its stated benefit while upheld; breaking one locks a Condition, and atonement can clear it.",
  },
  {
    id: "ranger-animal-companion",
    name: "Animal Companion",
    category: "class",
    classId: "ranger",
    trigger: "When your animal companion assists you",
    text: "Choose the beast’s qualities and drawback. For each relevant quality, choose a benefit such as combat support, an opportunity, or advantage. Harm makes it leave or marks a Condition.",
  },
  {
    id: "rogue-tricks-trade",
    name: "Tricks of the Trade",
    category: "class",
    classId: "rogue",
    trigger: "When you use one of your Roguish Skills for danger or stealth",
    text: "Use your trained skill to roll 1d8 + 1d6 instead of 2d6. Choose skills such as noticing sounds, handling traps, hiding, picking locks, or picking pockets.",
    stat: "dex",
    outcomes: bands(
      "Your specialized approach succeeds cleanly.",
      "You succeed with a complication.",
      "Your attempt goes badly. Mark XP; the GM makes a move.",
    ),
  },
  {
    id: "wizard-weave-arcane",
    name: "Weave the Arcane",
    category: "class",
    classId: "wizard",
    trigger: "When you prepare magical schools or combine their effects",
    text: "Prepare three schools after camp. With your focus and hands free, combine a prepared verb and substance to cast using Intelligence. On a partial hit, you may forget a prepared school until camp.",
  },
] satisfies MoveSpec[]).map((move) => {
  const sourceName = MOVE_SOURCE_NAMES[move.id];
  const sourceLevel =
    move.category === "class" || move.category === "campaign"
      ? 4
      : 3;
  return sourceName
    ? {
        ...move,
        text: sourceMoveRichText(sourceName, sourceLevel),
        ...(move.outcomes
          ? {
              outcomes: sourceMoveOutcomes(sourceName, sourceLevel) ?? move.outcomes,
            }
          : {}),
      }
    : move;
});

const ACTIONS: ActionDef[] = MOVES.map((move) => {
  const step = move.outcomes
    ? {
        kind: "check" as const,
        ...(move.stat === "choose"
          ? { ask: { kind: "stat" as const } }
          : move.stat === "none"
            ? {}
            : move.stat
              ? { stat: move.stat }
              : {}),
        ...(move.id === "spout-lore"
          ? {
              ask: {
                kind: "number" as const,
                label: "Yes",
                prompt: "Number of yes answers",
                min: 0,
                max: 3,
                initial: 0,
              },
            }
          : {}),
        outcomes: move.outcomes,
        ...(marksXp(move.outcomes) && move.id !== "sense-motive" && move.id !== "perilous-journey"
          ? { followUps: { miss: ["xp"] } }
          : {}),
      }
    : null;
  return {
    id: move.id,
    name: move.name,
    category: move.category,
    ...(move.sessionUse ? { sessionUse: move.sessionUse } : {}),
    trigger: move.trigger,
    text: move.text,
    steps: step ? [step] : [],
  };
});

const ARTIFACT_ACTIONS: ActionDef[] = DW2_MAGIC_ITEMS.flatMap((item) =>
  item.artifact?.unlocks.map((unlock) => ({
    id: `artifact:${item.id}:${unlock.id}`,
    name: unlock.name,
    category: "artifact",
    trigger: `When you use ${unlock.name}`,
    text: unlock.text ?? item.description,
    steps: [],
  })) ?? [],
);

const CLASS_ACTIONS = new Map(
  MOVES.filter((move) => move.classId).map((move) => [move.id, move.classId]),
);
const PATH_ACTIONS: ActionDef[] = PATHS.flatMap((path) =>
  path.rules.map((move, index) => ({
    id: `path-${path.id}-${index + 1}`,
    name: move.name,
    category: "path",
    trigger: move.trigger,
    text: move.rich,
    steps: move.outcomes
      ? [
          {
            kind: "check" as const,
            ...(move.stat ? { stat: move.stat } : {}),
            outcomes: move.outcomes,
            ...(marksXp(move.outcomes)
              ? { followUps: { miss: ["xp"] } }
              : {}),
          },
        ]
      : [],
  })),
);

const CLASS_NAME = Object.fromEntries(
  CLASSES.map(({ id, name }) => [id, name.replace(/^The /, "")]),
);

const pathOption = (path: (typeof PATHS)[number], multiclass = false): OptionDef => ({
  id: multiclass ? `multiclass-${path.id}` : path.id,
  name: path.name,
  text: `${multiclass ? "Multiclass into the" : "Gain the"} ${path.name} Path (${CLASS_NAME[path.classId]}) and its starting move.`,
  group: multiclass ? "Multiclass" : "Gain a Path",
  ...(multiclass
    ? { minLevel: 5, notRequires: { classId: path.classId } }
    : { requires: { classId: path.classId } }),
  notIncludes: [{ field: "ownedPaths", value: path.id }],
  limits: [
    multiclass
      ? { field: "multiclassPaths", max: { 5: 1, 10: 2 } }
      : { field: "ownedPaths", prefix: `${path.classId}-`, max: { 1: 1, 5: 2 } },
  ],
  grants: {
    ownedPaths: path.id,
    ...(multiclass ? { multiclassPaths: path.id } : {}),
  },
});

/** Every advancement, once; each says when it can be taken. */
const ADVANCEMENT: ChoiceDef = {
  id: "advancement",
  label: "Advancement",
  plural: "Advancements",
  field: "advancements",
  at: "advance",
  options: [
    ...STATS.map((stat) => ({
      id: `stat-${stat.id}`,
      name: `+1 ${stat.name}`,
      text: `Raise ${stat.name} by 1, to at most +2 (+3 from level 10).`,
      group: "Increase a Stat",
      requiresScoreBelow: { stat: stat.id, value: { 1: 2, 10: 3 } },
      limits: [{ field: "advancements", prefix: "stat-", max: { 1: 2, 5: 3, 10: 4 } }],
      boost: { stats: [stat.id], amounts: [[1]] },
    })),
    ...STRUGGLES.map((struggle) => ({
      id: `reveal-struggle-${struggle.id}`,
      name: struggle.name,
      text: struggle.text,
      group: "Reveal a Struggle",
      grants: {
        struggleRevealed: true,
        struggleId: struggle.id,
        struggleName: struggle.name,
        struggleTrack: struggle.track?.name ?? "",
        struggleProgress: struggle.track?.initial ?? 0,
        struggleMax: struggle.track?.max ?? 0,
      },
      notRequires: { struggleRevealed: true },
    })),
    ...PATHS.map((path) => pathOption(path)),
    ...PATHS.map((path) => pathOption(path, true)),
    ...PATHS.flatMap((path) =>
      path.moves.slice(1).map((name, index) => ({
        id: `path-move-${path.id}-${index + 2}`,
        name,
        text: `Gain ${name} from the ${path.name} Path.`,
        group: "Gain a Path Move",
        requiresIncludes: [{ field: "ownedPaths", value: path.id }],
        notIncludes: [{ field: "ownedPathMoves", value: `${path.id}:${index + 2}` }],
        limits: [{ field: "ownedPathMoves", max: { 1: 4, 5: 12, 10: 16 } }],
        grants: { ownedPathMoves: `${path.id}:${index + 2}` },
      })),
    ),
    {
      id: "magic-item",
      name: "Obtain a magic item",
      text: "Choose a magic item or create one with the GM, then record it in your inventory.",
      group: "Obtain treasure",
      minLevel: 5,
      grants: { magicItemAward: true },
      notRequires: { magicItemAward: true },
    },
    {
      id: "artifact",
      name: "Obtain an Artifact",
      text: "Choose an Artifact or create one with the GM, then record it in your inventory.",
      group: "Obtain treasure",
      minLevel: 10,
      grants: { artifactAward: true },
      notRequires: { artifactAward: true },
    },
  ],
};

const CONDITIONS = [
  ["angry", "Angry", "int"],
  ["distracted", "Distracted", "wis"],
  ["exhausted", "Exhausted", "str"],
  ["frightened", "Frightened", "dex"],
  ["insecure", "Insecure", "cha"],
] as const;

export const dungeonWorld2: GameSystem = {
  id: "dungeon-world-2",
  name: "Dungeon World 2",
  version: "0.1.0",
  stats: STATS.map(({ id, name, abbr }) => ({
    id,
    name,
    abbr,
    default: 0,
    min: -1,
    max: 3,
  })),
  modifier: (value) => Math.trunc(value),
  baseRoll: "2d6",
  defaultRollLabel: "Normal",
  rollModes: [
    { id: "advantage", label: "Advantage", roll: "3d6kh2" },
    { id: "disadvantage", label: "Disadvantage", roll: "3d6kl2" },
  ],
  checkRoll(formula, stat, character, action) {
    const first = parse(formula)[0];
    if (first?.kind !== "dice") return formula;
    const prefix =
      /^(?:\d+)?d\d+(?:k[hl]\d+)?!?\[[^\]]*\]|^(?:\d+)?d\d+(?:k[hl]\d+)?!?/i;
    const activeConditions = [
      ...character.conditions,
      ...(character.lockedConditions ?? []),
    ];
    const disadvantaged =
      !!stat &&
      activeConditions.some((condition) =>
        CONDITIONS.some(([id, , tied]) => id === condition && tied === stat),
      );
    if (action?.id === "rogue-tricks-trade") {
      const notation =
        first.keep?.which === "high"
          ? "d8+2d6kh1"
          : disadvantaged || first.keep?.which === "low"
            ? "d8+2d6kl1"
            : "d8+d6";
      return formula.replace(prefix, notation);
    }
    if (!disadvantaged) return formula;
    const chosenAdvantage = first.keep?.which === "high";
    const replacement = chosenAdvantage ? "2d6" : "3d6kl2";
    return formula.replace(
      prefix,
      `${replacement}${first.label ? `[${first.label}]` : ""}`,
    );
  },
  results: [
    { id: "strong", label: "10+", tone: "good" },
    { id: "weak", label: "7-9", tone: "mixed" },
    { id: "miss", label: "6 or less", tone: "bad" },
  ],
  result: (total) => (total >= 10 ? "strong" : total >= 7 ? "weak" : "miss"),
  actions: [...ACTIONS, ...PATH_ACTIONS, ...ARTIFACT_ACTIONS],
  actionCategories: [
    { id: "class", label: "Class" },
    { id: "path", label: "Path", onHotbar: false },
    { id: "basic", label: "Core" },
    { id: "special", label: "Extra", onHotbar: false },
    { id: "campaign", label: "Campaign", onHotbar: false },
    { id: "artifact", label: "Artifacts", onHotbar: false },
  ],
  followUps: [{ id: "xp", kind: "bump", label: "Mark XP", field: "xp", by: 1 }],
  items: [...DW2_GEAR, ...DW2_CLASS_GEAR, ...DW2_MAGIC_ITEMS],
  library: dw2Library({
    classes: CLASSES,
    classMoves: Object.fromEntries([...CLASS_ACTIONS].map(([moveId, classId]) => [classId, moveId])),
    actions: [...ACTIONS, ...PATH_ACTIONS, ...ARTIFACT_ACTIONS],
    gear: DW2_GEAR,
    classGear: DW2_CLASS_GEAR,
    magicItems: DW2_MAGIC_ITEMS,
  }),
  tags: [
    {
      id: "ammo",
      name: "Ammo",
      text: "It needs ammunition to work. By default you always have enough, but you might run out as a result of a GM Move.",
    },
    { id: "area", name: "Area", text: "Can affect multiple targets in close proximity." },
    {
      id: "close",
      name: "Close",
      text: "The target must be up to a few paces away, close enough to see their face expressions but not to touch.",
    },
    {
      id: "concealed",
      name: "Concealed",
      text: "Easy to hide from others unless they search you thoroughly.",
    },
    {
      id: "distinctive",
      name: "Distinctive",
      text: "Has an obvious sound or appearance that attracts attention.",
    },
    {
      id: "far",
      name: "Far",
      text: "You must be able to clearly see your target, or to hear them if they yell at the top of their lungs.",
    },
    {
      id: "forceful",
      name: "Forceful",
      text: "Inflicts powerful blows that knock targets back and down.",
    },
    { id: "hand", name: "Hand", text: "The target must be within grabbing distance." },
    {
      id: "holy",
      name: "Holy",
      text: "Blessed by a divine power, and thus especially effective against a deity’s enemies; advantage on damage rolls against them.",
    },
    {
      id: "light",
      name: "Light",
      text: "Easily dual-wielded with similar weapons (roll damage for both and keep highest).",
    },
    {
      id: "near",
      name: "Near",
      text: "The target must be up to speaking distance, even if you may have to raise your voice.",
    },
    {
      id: "piercing",
      name: "Piercing",
      text: "Cuts or bypasses thick armor and shielding. Damage of this type ignores armor and shield protection.",
    },
    {
      id: "precise",
      name: "Precise",
      text: "Requires quick and careful aim to use well; Trade Blows +DEX instead of +STR.",
    },
    {
      id: "reload",
      name: "Reload",
      text: "After you use it, you need to spend time reloading, rearming, or recharging it to use it again.",
    },
    {
      id: "thrown",
      name: "Thrown",
      text: "You can Trade Blows +STR instead of +DEX when using it as a ranged weapon.",
    },
    {
      id: "two-handed",
      name: "Two-handed",
      text: "Needs two hands to use properly, maybe for weight, balance, a second part of it, etc.",
    },
  ],
  conditions: CONDITIONS.map(([id, name, stat]) => ({
    id,
    name,
    stat,
    text: "When marked or locked, this Condition imposes disadvantage on rolls with its associated stat.",
    effects: [],
    lockable: true,
  })),
  modifiers: [],
  resources: [{ id: "hp", name: "HP", max: "maxHp" }],
  trackers: [
    { id: "hp", name: "HP", aliases: ["hit points"], resource: "hp", max: "maxHp" },
    { id: "xp", name: "XP", data: "xp", max: "xpNeeded" },
    { id: "treasure", name: "Treasure", aliases: ["treasure boxes"], data: "treasureBoxes", max: MAX_TREASURE_BOXES },
  ],
  characterData: [
    { id: "classId", default: "barbarian", for: "pc" },
    { id: "level", default: 1, for: "pc" },
    { id: "xp", default: 0, for: "pc" },
    { id: "treasureBoxes", default: INITIAL_TREASURE_BOXES, for: "pc" },
    { id: "startingItems", default: "", for: "pc" },
    { id: "pronouns", default: "", for: "pc" },
    { id: "ancestry", default: "", for: "pc" },
    { id: "community", default: "", for: "pc" },
    { id: "background", default: "", for: "pc" },
    { id: "appearance1", default: "", for: "pc" },
    { id: "appearance2", default: "", for: "pc" },
    { id: "advancements", default: "", for: "pc" },
    { id: "magicItemAward", default: false, for: "pc" },
    { id: "magicItemClaimed", default: false, for: "pc" },
    { id: "artifactAward", default: false, for: "pc" },
    { id: "artifactClaimed", default: false, for: "pc" },
    { id: "ownedPaths", default: "", for: "pc" },
    { id: "ownedPathMoves", default: "", for: "pc" },
    { id: "multiclassPaths", default: "", for: "pc" },
    { id: "struggleRevealed", default: false, for: "pc" },
    { id: "struggleId", default: "", for: "pc" },
    { id: "struggleName", default: "", for: "pc" },
    { id: "struggleTrack", default: "", for: "pc" },
    { id: "struggleProgress", default: 0, for: "pc" },
    { id: "struggleMax", default: 0, for: "pc" },
    { id: "armor", default: 0 },
    { id: "maxHp", default: 6, for: "npc" },
  ],
  sizes: [
    { id: "small", name: "Small", cells: 1 },
    { id: "medium", name: "Medium", cells: 1 },
    { id: "large", name: "Large", cells: 2 },
    { id: "huge", name: "Huge", cells: 3 },
  ],
  scene: { unit: 5, unitName: "ft", diagonal: "one" },
  npcFields: [
    { id: "description", label: "Description", type: "longtext" },
    { id: "drive", label: "Drive", type: "text" },
    { id: "resources", label: "Resources", type: "longtext" },
    { id: "resists", label: "Resists", type: "longtext" },
    { id: "damage", label: "Damage", type: "text" },
    { id: "tags", label: "Tags", type: "text" },
    { id: "conditions", label: "Conditions & Escalations", type: "longtext" },
  ],
  derive(character, sources) {
    const classData =
      CLASSES.find((entry) => entry.id === character.data.classId) ??
      (CLASSES)[0]!;
    const level = Math.max(1, Number(character.data.level ?? 1));
    const mods = Object.fromEntries(
      STATS.map(({ id }) => [
        id,
        Math.max(-1, Math.min(3, Math.trunc(character.scores[id] ?? 0))),
      ]),
    );
    const equippedArtifact = (name: string) => {
      const definition = DW2_MAGIC_ITEMS.find((item) => item.name === name);
      return definition && character.inventory.find((item) => item.defId === definition.id && item.equipped);
    };
    const soulstealer = equippedArtifact("Alveric’s Soulstealer Blade");
    if (soulstealer && (soulstealer.artifactUnlocked?.length ?? 0) > 0)
      mods.str = Math.max(1, Math.min(4, soulstealer.artifactUnlocked!.length));
    const caliburnus = equippedArtifact("Caliburnus, The Sword That Heals");
    if (caliburnus && (caliburnus.artifactUnlocked?.length ?? 0) > 0)
      mods.cha = Math.max(1, Math.min(4, caliburnus.artifactUnlocked!.length));
    const markDefinition = DW2_MAGIC_ITEMS.find((item) => item.name === "Indelible Mark of Drakon");
    const indelibleMark = character.inventory.find((item) => item.defId === markDefinition?.id);
    const artifactHp = indelibleMark
      ? Math.max(1, Math.min(4, indelibleMark.artifactUnlocked?.length ?? 0))
      : 0;
    const resolved = resolveEffects(
      {
        maxHp:
          character.kind === "npc"
            ? Number(character.data.maxHp ?? 6)
            : classData.hp + Math.min(level - 1, 10) + artifactHp,
        armor: Number(character.data.armor ?? 0),
        damage: 6,
        damageBonus: 0,
      },
      sources,
    );
    return {
      mods,
      resolved,
      values: {
        ...resolved.values,
        bloodiedAt: Math.floor((resolved.values.maxHp ?? 0) / 2),
        xpNeeded: 5,
      },
    };
  },
  resolveDamage(character, derived, amount, options) {
    if (amount <= 0) return { hp: 0 };
    const armor =
      options.type?.toLowerCase() === "piercing"
        ? 0
        : Math.max(0, Number(derived.values.armor ?? 0));
    const armorUsable = (character.scores.str ?? 0) >= armor;
    return {
      hp: armorUsable ? Math.max(1, amount - armor) : amount,
    };
  },
  actionsFor(character) {
    if (character.kind === "npc") return [];
    const ownClassMoves = ACTIONS.filter(
      (move) => CLASS_ACTIONS.get(move.id) === character.data.classId,
    );
    const ownedPaths = parseCommaList(
      String(character.data.ownedPaths ?? ""),
    ).filter(Boolean);
    const ownedPathMoves = parseCommaList(
      String(character.data.ownedPathMoves ?? ""),
    ).filter(Boolean);
    const pathMoves = PATH_ACTIONS.filter((move) => {
      const path = PATHS.find(
        (entry) =>
          entry.id === move.id.replace(/^path-/, "").replace(/-\d+$/, ""),
      );
      if (!path || !ownedPaths.includes(path.id)) return false;
      const moveIndex = path.moves.findIndex((name) => name === move.name) + 1;
      return (
        moveIndex === 1 || ownedPathMoves.includes(`${path.id}:${moveIndex}`)
      );
    });
    const artifactMoves = character.inventory.flatMap((item) => {
      const definition = DW2_MAGIC_ITEMS.find((entry) => entry.id === item.defId);
      if (!definition?.artifact || (definition.artifact.requiresEquipped && !item.equipped))
        return [];
      const unlocked = new Set(item.artifactUnlocked ?? []);
      const prefix = `artifact:${definition.id}:`;
      return ARTIFACT_ACTIONS.filter((action) =>
        action.id.startsWith(prefix) && unlocked.has(action.id.slice(prefix.length)),
      );
    });
    return [
      ...ACTIONS.filter((move) => move.category !== "class"),
      ...ownClassMoves,
      ...pathMoves,
      ...artifactMoves,
    ];
  },
  tokenStats: (character, derived) => [
    {
      id: "hp",
      label: "HP",
      value: character.resources.hp ?? 0,
      max: derived.values.maxHp ?? 0,
      colour:
        (character.resources.hp ?? 0) <= (derived.values.maxHp ?? 0) / 4
          ? "#d04a3a"
          : (character.resources.hp ?? 0) <= (derived.values.maxHp ?? 0) / 2
            ? "#d49a32"
            : "#4aa35a",
    },
  ],
  creation: {
    advancementField: "level",
    advancementCounterField: "xp",
    classScoreAssignments: DW2_CLASS_SCORE_ASSIGNMENTS,
    startingItemsField: "startingItems",
    requireAllCreationChoicesAtCreate: true,
    listFields: [
      "startingItems",
      "advancements",
      "ownedPaths",
      "ownedPathMoves",
      "multiclassPaths",
    ],
    choices: [
      {
        id: "class",
        label: "Class",
        plural: "Classes",
        field: "classId",
        at: "create",
        options: CLASSES.map(({ id, name, description }) => ({
          id,
          name,
          text: description,
        })),
      },
      ...CLASS_STARTING_CHOICES,
      ADVANCEMENT,
    ],
    scores: { standardArray: [2, 1, 0, 0, -1] },
  },
  attribution:
    "Dungeon World 2 Beta v3 (October 2026). System moves and class options are concise original summaries; consult the supplied beta for full rules and advancement details.",
  gmReference: sourceGmReference(),
};
