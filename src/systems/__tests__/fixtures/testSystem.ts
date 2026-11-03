import type { CharacterView } from "../../../features/characters/types";
import { resolveEffects } from "../../effects";
import type { ActionDef, GameSystem } from "../../types";

const outcomes = {
  success: "The test succeeds.",
  mixed: "The test succeeds with a complication.",
  failure: "The test does not succeed.",
};

const actions: ActionDef[] = [
  {
    id: "test-check",
    name: "Test Check",
    category: "checks",
    trigger: "When you make a test check",
    text: "Resolve a generic check and choose its follow-up.",
    steps: [
      {
        kind: "check",
        ask: { kind: "stat" },
        outcomes,
        followUps: { success: ["mark-check"] },
        followUpsFor: (roll, character, derived) =>
          roll.total >= (derived.values.followUpThreshold ?? 0) &&
          character.data.originId === "curious"
            ? ["mark-check"]
            : [],
      },
    ],
    variants: (character, derived) => [
      {
        id: "steady",
        label: "Steady",
        costs: [],
        values: { bonus: (character.scores.might ?? 0) + (derived.values.armor ?? 0) },
      },
    ],
  },
  {
    id: "test-target",
    name: "Test Target",
    category: "checks",
    trigger: "When you test a target",
    text: "Resolve a generic targeted check.",
    target: { prompt: "Choose a target", min: 1, max: 1 },
    steps: [
      {
        kind: "check",
        stat: "insight",
        difficulty: { kind: "target", value: "guard" },
        outcomes,
      },
    ],
  },
  {
    id: "test-save",
    name: "Test Save",
    category: "checks",
    trigger: "When you test a save",
    text: "Resolve a generic save.",
    steps: [
      {
        kind: "save",
        action: "test-check",
        difficulty: { kind: "fixed", value: 10 },
        success: "The save succeeds.",
        failure: "The save fails.",
      },
    ],
  },
  {
    id: "test-note",
    name: "Test Note",
    category: "reference",
    trigger: "When you need a text-only action",
    text: "This action has no automated steps.",
    steps: [],
  },
  {
    id: "test-learnable",
    name: "Test Learnable",
    category: "reference",
    trigger: "When you learn an action",
    text: "A generic action that may be learned.",
    steps: [],
    tags: ["learnable"],
  },
];

export const testSystem: GameSystem = {
  id: "test",
  name: "Test system",
  version: "1.0.0",
  stats: [
    { id: "might", name: "Might", abbr: "MGT", default: 1, min: 0, max: 3 },
    { id: "insight", name: "Insight", abbr: "INS", default: 0, min: 0, max: 3 },
  ],
  modifier: (score) => Math.trunc(score),
  baseRoll: "d20",
  defaultRollLabel: "Test roll",
  checkRoll: (formula) => `${formula}+0[Test]`,
  rollModes: [{ id: "advantage", label: "Advantage", roll: "2d20kh1" }],
  results: [
    { id: "success", label: "Success", tone: "good" },
    { id: "mixed", label: "Mixed", tone: "mixed" },
    { id: "failure", label: "Failure", tone: "bad" },
  ],
  result: (total) =>
    total >= 12 ? "success" : total >= 7 ? "mixed" : "failure",
  hits: (total, natural, target) => total >= target || natural.includes(20),
  longRange: { mode: "disadvantage", cancels: "advantage" },
  damageTypes: [{ id: "test-damage", name: "Test damage" }],
  tempHp: "temporaryHp",
  damageArmor: { resource: "focus", label: "Focus" },
  resolveDamage: (_character, _derived, amount, options) => ({
    hp: Math.max(0, Math.ceil(amount)),
    ...(options.armor && amount > 0
      ? { resources: [{ id: "focus", by: -1 }] }
      : {}),
  }),
  concentrationSave: (damage) => ({
    action: "test-save",
    difficulty: { kind: "fixed", value: Math.max(10, damage) },
  }),
  initiative: "test-check",
  actions,
  loadouts: [
    {
      id: "test-loadout",
      label: "Test options",
      ownedField: "testOptions",
      available: (character) =>
        character.data.originId === "curious" ? ["curious-option"] : [],
      activeField: "activeTestOption",
      max: 1,
      options: [
        {
          id: "curious-option",
          name: "Curious option",
          text: "A generic loadout option.",
        },
      ],
    },
  ],
  learnedActionAllowed: (action, character) =>
    character.kind === "pc" && action.tags?.includes("learnable") === true,
  actionCategories: [
    { id: "checks", label: "Checks" },
    { id: "reference", label: "Reference", onHotbar: false },
  ],
  followUps: [
    {
      id: "mark-check",
      kind: "bump",
      label: "Mark a check",
      field: "checks",
      by: 1,
    },
    {
      id: "spend-focus",
      kind: "resource",
      label: "Spend focus",
      resource: "focus",
      by: -1,
    },
    {
      id: "advance-clock",
      kind: "counter",
      label: "Advance test clock",
      by: 1,
      systemCounter: "test-clock",
    },
    {
      id: "test-damage-roll",
      kind: "roll",
      label: "Roll test damage",
      comment: "Roll the generic damage formula.",
      formula: (_character, derived) => `d${derived.values.damageDie}`,
      damage: "test-damage",
    },
  ],
  items: [
    {
      id: "test-charm",
      name: "Test charm",
      description: "A generic item with shared effects.",
      weight: 1,
      tags: ["charm"],
      equippable: true,
      active: "equipped",
      effects: [
        { type: "modify", path: "armor", op: "add", value: 1 },
        { type: "grantTag", tag: "prepared" },
        { type: "rollBonus", stat: "might", value: 1 },
      ],
    },
  ],
  tags: [{ id: "charm", name: "Charm", text: "A generic item tag." }],
  conditions: [
    {
      id: "test-condition",
      name: "Test condition",
      text: "A generic lockable condition.",
      effects: [{ type: "modify", path: "guard", op: "add", value: -1 }],
      lockable: true,
      stat: "might",
    },
  ],
  modifiers: [
    { id: "next-test", label: "Next test", until: "next-roll" },
    { id: "ongoing-test", label: "Ongoing test", until: "removed" },
  ],
  resources: [
    { id: "hp", name: "HP", max: "maxHp" },
    {
      id: "focus",
      name: "Focus",
      max: "maxFocus",
      initial: 2,
      resets: ["short-rest"],
    },
  ],
  characterData: [
    { id: "maxHp", default: 6, for: "npc" },
    { id: "checks", default: 0 },
    { id: "originId", default: "plain" },
    { id: "testOptions", default: "" },
    { id: "activeTestOption", default: "" },
  ],
  campaignFields: [
    {
      id: "test-setting",
      label: "Test setting",
      default: "default",
      type: "select",
      options: [
        { id: "default", label: "Default" },
        { id: "alternate", label: "Alternate" },
      ],
    },
  ],
  campaignLabel: "Test campaign",
  counters: [{ id: "test-clock", label: "Test clock", start: 0, max: 6 }],
  sizes: [
    { id: "standard", name: "Standard", cells: 1 },
    { id: "large", name: "Large", cells: 2 },
  ],
  scene: { unit: 1, unitName: "unit", diagonal: "euclid" },
  npcFields: [
    { id: "armor", label: "Armor", type: "number", default: 0 },
    { id: "role", label: "Role", type: "text" },
    { id: "notes", label: "Notes", type: "longtext" },
  ],
  monsters: [
    {
      id: "test-creature",
      name: "Test creature",
      description: "A generic NPC entry.",
      hp: 8,
      fields: { armor: 1, role: "test" },
      size: "standard",
    },
  ],
  derive: (character, sources) => {
    const resolved = resolveEffects(
      {
        maxHp: Number(
          character.kind === "npc" ? (character.data.maxHp ?? 6) : 12,
        ),
        maxFocus: 3,
        armor: Number(character.fields.armor ?? 0),
        guard: 10,
        followUpThreshold: 10,
        damageDie: 6,
        temporaryHp: 0,
      },
      sources,
    );
    return {
      values: resolved.values,
      mods: Object.fromEntries(
        Object.keys(character.scores).map((stat) => [
          stat,
          Math.trunc(character.scores[stat] ?? 0),
        ]),
      ),
      resolved,
    };
  },
  actionsFor: (character) =>
    character.kind === "npc"
      ? []
      : actions.filter((action) => action.id !== "test-learnable"),
  tokenStats: (character, derived) => [
    {
      id: "hp",
      label: "HP",
      value: character.resources.hp ?? 0,
      max: derived.values.maxHp ?? 0,
      colour: "#4a9b70",
    },
  ],
  creation: {
    choices: [
      {
        id: "origin",
        label: "Origin",
        field: "originId",
        at: "create",
        options: [
          { id: "plain", name: "Plain", text: "A default test origin." },
          {
            id: "curious",
            name: "Curious",
            text: "An origin that opens a generic test option.",
          },
        ],
      },
    ],
    scores: { standardArray: [1, 0] },
  },
  sheet: {
    pc: [
      { kind: "header" },
      { kind: "choices" },
      { kind: "stats", label: "Stats", showScore: true },
      { kind: "derived", items: [{ label: "Guard", value: "guard" }] },
      {
        kind: "fields",
        label: "Test fields",
        items: [{ field: "checks", label: "Checks", type: "number", min: 0 }],
      },
      { kind: "loadout", loadout: "test-loadout" },
      { kind: "modifiers", label: "Modifiers" },
      { kind: "actions", label: "Actions" },
      { kind: "inventory" },
      {
        kind: "counters",
        items: [
          { label: "HP", resource: "hp", max: "maxHp" },
          { label: "Focus", resource: "focus", max: "maxFocus" },
        ],
      },
      {
        kind: "text",
        label: "Test notes",
        fields: [{ field: "testNote", label: "Test note" }],
      },
    ],
    npc: [
      { kind: "header" },
      { kind: "npcFields" },
      { kind: "inventory" },
      {
        kind: "counters",
        items: [{ label: "HP", resource: "hp", max: "maxHp" }],
      },
    ],
  },
  attribution: "Generic fixture for testing the shared system API.",
};

export function testCharacter(
  overrides: Partial<CharacterView> = {},
): CharacterView {
  return {
    id: "test-character",
    kind: "pc",
    name: "Test character",
    owner: "test-owner",
    scores: { might: 1, insight: 0 },
    data: { checks: 0, originId: "plain" },
    resources: { hp: 12, focus: 2 },
    conditions: [],
    durations: {},
    modifiers: {},
    fields: {},
    inventory: [],
    learned: [],
    ...overrides,
  };
}
