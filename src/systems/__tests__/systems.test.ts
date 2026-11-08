import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { dungeonWorld as dw } from "../dungeon-world";
import { checkSystem, defineSystem, getSystem, listSystems, NO_SYSTEM_ID } from "..";
import { Campaign, createCampaign } from "../../campaign/campaign";
import { systemOf } from "../../features/characters/api";
import { device } from "../../platform/device";
import { resolveEffects } from "../effects";
import { bladesInTheDark as blades } from "../blades-in-the-dark";
import { dungeonWorld2 as dw2 } from "../dungeon-world-2";
import { daggerheart as dh } from "../daggerheart";
import { testCharacter, testSystem } from "./fixtures/testSystem";
import {
  dw2Paths,
  sourceMoveOutcomes,
  sourceMoveRichText,
  sourceMoveText,
} from "../dungeon-world-2/paths.macro";
import { emptyRichText, plainText } from "../../core/richText";
import { BONDS as DW2_BONDS } from "../dungeon-world-2/bonds";
import { STRUGGLES as DW2_STRUGGLES } from "../dungeon-world-2/struggles";
import { addTreasureBoxes, purchaseAtWealth, wealthTierForBoxes } from "../dungeon-world-2/wealth";
import { sourceEntries, systemLibrary, topLevelKeys, viewEntries } from "../../features/library";
import { DW2_CLASS_SCORE_RULES } from "../dungeon-world-2/stats";
import { CLASS_CREATION_HINTS } from "../dungeon-world-2/creationHints";
import { derive } from "../../features/characters/store";
import type { CharacterView } from "../../features/characters/types";
import { asksFirst, performMove, planMove } from "../../features/characters/moves";
import {
  boostFrom,
  choicesAt,
  dataFrom,
  ruleStartingScores,
  scoreRuleProblems,
} from "../../features/characters/creation";
import { DW2_GEAR } from "../dungeon-world-2/gear";

const bladesCharacter = (over: Partial<CharacterView> = {}): CharacterView => ({
  id: "test",
  kind: "pc",
  name: "Test",
  owner: "me",
  scores: {},
  data: {},
  resources: {},
  conditions: [],
  durations: {},
  modifiers: {},
  fields: {},
  inventory: [],
  learned: [],
  ...over,
});
const dice = (...values: number[]) => {
  let index = 0;
  if (!values.length) throw new RangeError("Dice fixture needs at least one result");
  return () => values[index++ % values.length]!;
};

describe("Test system", () => {
  it("uses No system as the default and resolves its sentinel id", () => {
    expect(getSystem(undefined).name).toBe("No system");
    expect(getSystem(NO_SYSTEM_ID).name).toBe("No system");
  });

  it("uses No system for campaigns without an explicit system", async () => {
    device.value = { id: "gm", name: "Gwen" };
    const campaign = await Campaign.open(await createCampaign("No system", "Gwen"));
    expect(systemOf(campaign).id).toBe(NO_SYSTEM_ID);
    campaign.destroy();
  });

  it("validates the fixture without registering it for the app", () => {
    expect(checkSystem(testSystem)).toEqual([]);
    expect(listSystems()).not.toContain(testSystem);
    expect(testSystem.items[0]!.equippable).toBe(true);
    expect(testSystem.conditions[0]!.lockable).toBe(true);
    expect(testSystem.creation?.choices[0]?.options).toHaveLength(2);
    expect(testSystem.sheet?.pc.some((section) => section.kind === "loadout")).toBe(true);
    expect(testSystem.sheet?.npc.some((section) => section.kind === "npcFields")).toBe(true);
    expect(testSystem.monsters).toHaveLength(1);
  });

  it("exercises optional system and nested entity callbacks deterministically", () => {
    const character = testCharacter({ data: { checks: 0, originId: "curious" } });
    const derived = derive(character, testSystem);
    const check = testSystem.actions.find((action) => action.id === "test-check")!;
    const step = check.steps[0]!;
    const learnable = testSystem.actions.find((action) => action.id === "test-learnable")!;
    const followUp = testSystem.followUps.find((entry) => entry.id === "test-damage-roll")!;
    const loadout = (testSystem.loadouts ?? [])[0]!;

    expect(testSystem.modifier(2.9)).toBe(2);
    expect(testSystem.result(12, [])).toBe("success");
    expect(testSystem.checkRoll!("d20+1", "might", character, check)).toBe("d20+1+0[Test]");
    expect(testSystem.hits!(1, [20], 12)).toBe(true);
    expect(testSystem.hits!(11, [], 12)).toBe(false);
    expect(testSystem.resolveDamage!(character, derived, 3, { armor: true })).toEqual({
      hp: 3,
      resources: [{ id: "focus", by: -1 }],
    });
    expect(testSystem.concentrationSave!(8)).toEqual({
      action: "test-save",
      difficulty: { kind: "fixed", value: 10 },
    });
    expect(testSystem.learnedActionAllowed!(learnable, character, derived)).toBe(true);
    expect(check.variants!(character, derived)).toEqual([
      { id: "steady", label: "Steady", costs: [], values: { bonus: 1 } },
    ]);
    expect(
      step.kind === "check" &&
        step.followUpsFor!({ formula: "d20", terms: [], total: 11 }, character, derived),
    ).toEqual(["mark-check"]);
    expect(loadout.available!(character, derived)).toEqual(["curious-option"]);
    expect(followUp.kind === "roll" && followUp.formula(character, derived)).toBe("d6");
    expect(testSystem.actionsFor(character, derived)).toContain(check);
    expect(testSystem.tokenStats(character, derived)).toEqual([
      { id: "hp", label: "HP", value: 12, max: 12, colour: "#4a9b70" },
    ]);
    expect(testSystem.actions.find((action) => action.id === "test-save")?.steps[0]).toMatchObject({
      kind: "save",
      action: "test-check",
    });
  });
});

describe("Blades in the Dark", () => {
  it("offers unbounded Veteran advancement choices and applies Mule load limits", () => {
    const choices = choicesAt(blades.creation, 40, { playbook: "cutter" }).flatMap(
      (choice) => choice.options,
    );
    expect(choices.some((option) => option.id === "ability-whisper-iron-will")).toBe(true);
    expect(
      derive(
        bladesCharacter({ data: { specialAbilities: "ability-cutter-mule", load: 3 } }),
        blades,
      ).values.maxLoad,
    ).toBe(5);
    expect(
      plainText(blades.actions.find((action) => action.id === "ability-cutter-mule")?.text),
    ).toContain("Light: 5");
  });

  it("offers desperate XP, resistance Stress, and vice clearing from the actual dice result", () => {
    const character = bladesCharacter({ scores: { hunt: 1 }, data: { stress: 6 } });
    const derived = derive(character, blades);
    const hunt = blades.actions.find((action) => action.id === "hunt")!;
    expect(
      performMove(
        blades,
        hunt,
        character,
        derived,
        { mode: "desperate" },
        () => 6,
      ).suggestions.some((suggestion) => suggestion.id === "xp-insight"),
    ).toBe(true);
    const resist = blades.actions.find((action) => action.id === "resist-insight")!;
    expect(performMove(blades, resist, character, derived, {}, () => 4).suggestions).toContainEqual(
      expect.objectContaining({ bump: { field: "stress", by: 2 } }),
    );
    const vice = blades.actions.find((action) => action.id === "indulge-vice")!;
    expect(performMove(blades, vice, character, derived, {}, () => 3).suggestions).toContainEqual(
      expect.objectContaining({ bump: { field: "stress", by: -3 } }),
    );
  });

  const skirmish = blades.actions.find((action) => action.id === "skirmish")!;

  it("has valid data and twelve zero-based action ratings", () => {
    expect(checkSystem(blades)).toEqual([]);
    expect(blades.stats).toHaveLength(12);
    expect(
      blades.stats.every((stat) => stat.default === 0 && stat.min === 0 && stat.max === 4),
    ).toBe(true);
    expect(blades.creation?.scores.pointBuy?.budget).toBe(4);
  });

  it("rolls two lowest dice at zero pool and suppresses zero-pool criticals", () => {
    const c = bladesCharacter();
    const d = derive(c, blades);
    expect(performMove(blades, skirmish, c, d, {}, dice(6, 2)).result).toBe("miss");
    expect(performMove(blades, skirmish, c, d, {}, dice(6, 6)).result).toBe("strong");
    expect(planMove(blades, skirmish, c, d, { extra: -1 }).formula).toBe("2d6kl1[Risky]");
  });

  it("uses the highest die, detects criticals, and spends bonus dice", () => {
    const c = bladesCharacter({ scores: { skirmish: 2 }, modifiers: { "bonus-dice": 1 } });
    const result = performMove(blades, skirmish, c, derive(c, blades), {}, dice(6, 6, 2));
    expect(result.roll?.formula).toBe("3d6kh1[Risky]");
    expect(result.result).toBe("critical");
    expect(result.spent).toEqual(["bonus-dice"]);
  });

  it("creates a Cutter with its starting dots and a playbook ability", () => {
    const playbook = blades
      .creation!.choices.find((choice) => choice.id === "playbook")!
      .options.find((option) => option.id === "cutter")!;
    expect(boostFrom(playbook, 0, playbook.boost!.stats)).toEqual({ skirmish: 2, command: 1 });
    expect(blades.creation!.scores.pointBuy?.budget).toBe(4);
    expect(
      blades
        .creation!.choices.find((choice) => choice.id === "specialAbility")
        ?.options.find((option) => option.name === "Battleborn")?.requires,
    ).toEqual({ playbook: "cutter" });
  });

  it("preserves selected action-roll position", () => {
    const c = bladesCharacter({ scores: { skirmish: 1 } });
    expect(
      plainText(
        performMove(blades, skirmish, c, derive(c, blades), { mode: "controlled" }, dice(4))
          .outcome,
      ),
    ).toContain("minor complication");
    expect(
      plainText(
        performMove(blades, skirmish, c, derive(c, blades), { mode: "desperate" }, dice(4)).outcome,
      ),
    ).toContain("severe harm");
  });

  it("derives resistance dice from actions with at least one dot", () => {
    const c = bladesCharacter({ scores: { hunt: 1, skirmish: 2, prowl: 1, attune: 1, sway: 1 } });
    const d = derive(c, blades);
    expect(d.values).toMatchObject({ insight: 1, prowess: 2, resolve: 2, vice: 1 });
    const resist = blades.actions.find((action) => action.id === "resist-prowess")!;
    const result = performMove(blades, resist, c, d, {}, dice(2, 5));
    expect(result.roll?.formula).toBe("2d6kh1[Resistance]");
    expect(plainText(result.outcome)).toContain("Resistance works");
  });

  it("advances a selected core clock by the project result", () => {
    const action = blades.actions.find((entry) => entry.id === "long-term-project")!;
    const c = bladesCharacter({ scores: { study: 2 } });
    const result = performMove(
      blades,
      action,
      c,
      derive(c, blades),
      { stat: "study", counterMessageId: "clock-1" },
      dice(5),
    );
    expect(result.result).toBe("weak");
    expect(result.suggestions).toContainEqual(
      expect.objectContaining({ count: { messageId: "clock-1", by: 2 } }),
    );
  });

  it("only offers position choices for action rolls", () => {
    const action = blades.actions.find((entry) => entry.id === "skirmish")!;
    const resistance = blades.actions.find((entry) => entry.id === "resist-prowess")!;
    expect(asksFirst(blades, action)).toBe(true);
    expect(asksFirst(blades, resistance)).toBe(false);
  });
});

describe("Dungeon World 2", () => {
  it("uses the beta move text for every core and extra move", () => {
    const sourceMoves = [
      ["aid-a-pc", "Aid a PC"],
      ["cast-a-spell", "Cast a Spell"],
      ["comfort-or-support", "Comfort or Support"],
      ["defy-danger", "Defy Danger"],
      ["pull-strings", "Pull Strings"],
      ["sense-motive", "Sense Motive"],
      ["sneak-past", "Sneak Past"],
      ["spout-lore", "Spout Lore"],
      ["trade-blows", "Trade Blows"],
      ["unearth-secrets", "Unearth Secrets"],
      ["end-the-session", "End the Session"],
      ["face-death", "Face Death"],
      ["level-up", "Level Up"],
      ["make-camp", "Make Camp"],
      ["perform-a-ritual", "Perform a Ritual"],
      ["reach-your-limit", "Reach Your Limit"],
      ["perilous-journey", "Undertake a Perilous Journey"],
    ] as const;

    expect(sourceMoves).toHaveLength(17);
    for (const [id, sourceName] of sourceMoves) {
      const action = dw2.actions.find((entry) => entry.id === id)!;
      expect(action.text).toEqual(sourceMoveRichText(sourceName));
      expect(plainText(action.text).replace(/^• /gm, "").replace(/\s+/g, " ")).toContain(
        sourceMoveText(sourceName).split(" ").slice(0, 6).join(" "),
      );
      const sourceOutcomes = sourceMoveOutcomes(sourceName);
      if (sourceOutcomes) {
        expect(action.steps[0]).toMatchObject({ outcomes: sourceOutcomes });
      }
    }
    expect(plainText(dw2.actions.find((action) => action.id === "aid-a-pc")!.text)).toContain(
      "They frustrate you; erase 1 Depth with them",
    );
    expect(plainText(dw2.actions.find((action) => action.id === "face-death")?.text)).toContain(
      "Go Out in a Blaze of Glory",
    );
    const classMoves = [
      ["barbarian-rage", "Rage!"],
      ["bard-perform-art", "Perform Your Art"],
      ["cleric-invoke-divine", "Invoke the Divine"],
      ["druid-shapeshift", "Shapeshift"],
      ["fighter-signature-weapon", "Signature Weapon"],
      ["paladin-oaths", "Oaths of Conviction"],
      ["ranger-animal-companion", "Animal Companion"],
      ["rogue-tricks-trade", "Tricks of the Trade"],
      ["wizard-weave-arcane", "Weave the Arcane"],
    ] as const;
    for (const [id, sourceName] of classMoves) {
      const action = dw2.actions.find((entry) => entry.id === id)!;
      expect(action.text).toEqual(sourceMoveRichText(sourceName, 4));
      const sourceOutcomes = sourceMoveOutcomes(sourceName, 4);
      if (sourceOutcomes) {
        expect(action.steps[0]).toMatchObject({ outcomes: sourceOutcomes });
      }
    }
    const campaignMoves = [
      ["enjoy-downtime", "Enjoy Downtime"],
      ["forge-a-bond", "Forge a Bond"],
      ["reveal-your-struggle", "Reveal Your Struggle"],
    ] as const;
    for (const [id, sourceName] of campaignMoves) {
      expect(dw2.actions.find((entry) => entry.id === id)?.text).toEqual(
        sourceMoveRichText(sourceName, 4),
      );
    }
    expect(plainText(dw2.actions.find((action) => action.id === "barbarian-rage")?.text)).toContain(
      "You can't benefit from wearing armor",
    );
    expect(plainText(dw2.actions.find((action) => action.id === "barbarian-rage")?.text)).toContain(
      "Trade Blows+STR",
    );
    expect(dw2.actions.find((action) => action.id === "barbarian-rage")?.text).not.toContain(
      "Trade Blows)+STR",
    );
    expect(
      plainText(dw2.actions.find((action) => action.id === "bard-perform-art")?.text),
    ).toContain("marks 1 Depth with you");
    for (const id of ["pull-strings", "sneak-past", "unearth-secrets"]) {
      expect(dw2.actions.find((action) => action.id === id)?.steps[0]).toMatchObject({
        followUps: { miss: ["xp"] },
      });
    }
    expect(dw2.actions.find((action) => action.id === "face-death")?.steps[0]).not.toHaveProperty(
      "followUps",
    );
    for (const action of dw2.actions.filter((entry) => entry.category === "path")) {
      const step = action.steps[0];
      if (step?.kind !== "check") continue;
      expect(Boolean(step.followUps?.miss)).toBe(
        /\bmark(?:s)?\s+(?:1\s+)?XP\b/i.test(plainText(step.outcomes["miss"])),
      );
    }
  });

  it("has valid data, five direct stats, and nine class options", () => {
    expect(checkSystem(dw2)).toEqual([]);
    expect(dw2.stats.map((stat) => [stat.id, stat.min, stat.max])).toEqual([
      ["str", -1, 3],
      ["dex", -1, 3],
      ["int", -1, 3],
      ["wis", -1, 3],
      ["cha", -1, 3],
    ]);
    expect((dw2.creation?.choices ?? [])[0]!.options).toHaveLength(9);
    expect(dw2.creation?.scores.standardArray).toEqual([2, 1, 0, 0, -1]);
    expect(Object.keys(CLASS_CREATION_HINTS)).toHaveLength(9);
    for (const hints of Object.values(CLASS_CREATION_HINTS)) {
      expect(Object.keys(hints.identity ?? {}).sort()).toEqual([
        "ancestry",
        "background",
        "community",
      ]);
      expect(hints.name).toMatch(/^e\.g\. /);
      expect(hints.relationship).toMatch(/^e\.g\. /);
    }
    expect(CLASS_CREATION_HINTS.barbarian?.identity?.ancestry).toBe(
      "e.g. construct, minotaur, nephilim, etc. What makes your homeland so different from places here?",
    );
    expect(CLASS_CREATION_HINTS.barbarian?.scores).toContain("STR is +2");
    expect(CLASS_CREATION_HINTS.bard?.relationship).toContain("We were an item");
    const distributions: Record<string, string> = {
      barbarian: "-1,0,0,2,2",
      bard: "-1,0,1,1,2",
      cleric: "-1,0,1,1,2",
      druid: "-1,0,0,2,2",
      fighter: "-1,0,1,1,2",
      paladin: "-1,0,0,2,2",
      ranger: "-1,0,0,2,2",
      rogue: "-1,0,1,1,2",
      wizard: "-1,0,1,1,2",
    };
    expect(Object.keys(DW2_CLASS_SCORE_RULES).sort()).toEqual(Object.keys(distributions).sort());
    for (const [classId, rule] of Object.entries(DW2_CLASS_SCORE_RULES)) {
      const scores = ruleStartingScores(rule, dw2.stats);
      expect(scoreRuleProblems(rule, dw2.stats, scores)).toEqual([]);
      expect(
        Object.values(scores)
          .sort((a, b) => a - b)
          .join(","),
      ).toBe(distributions[classId]);
    }
    expect(dw2.tags.map((tag) => tag.id)).toEqual([
      "ammo",
      "area",
      "close",
      "concealed",
      "distinctive",
      "far",
      "forceful",
      "hand",
      "holy",
      "light",
      "near",
      "piercing",
      "precise",
      "reload",
      "thrown",
      "two-handed",
    ]);
    expect(dw2.tags.find((tag) => tag.id === "precise")?.text).toContain(
      "Trade Blows +DEX instead of +STR",
    );
    expect(dw2.tags.find((tag) => tag.id === "ammo")?.text).toContain(
      "you might run out as a result of a GM Move",
    );
    expect(dw2.npcFields.map((field) => field.id)).toEqual([
      "description",
      "drive",
      "resources",
      "resists",
      "damage",
      "tags",
      "conditions",
    ]);
    expect(
      dw2.npcFields.filter((field) => field.type === "longtext").map((field) => field.id),
    ).toEqual(["description", "resources", "resists", "conditions"]);
    expect(DW2_BONDS).toHaveLength(7);
    expect(DW2_BONDS.every((bond) => bond.text.length > 100)).toBe(true);
    expect(DW2_STRUGGLES).toHaveLength(22);
    expect(DW2_STRUGGLES.every((struggle) => struggle.text.length > 100)).toBe(true);
  });

  it("registers both systems for campaign selection", () => {
    expect(listSystems().map((system) => system.id)).toEqual(
      expect.arrayContaining(["blades-in-the-dark", "dungeon-world-2"]),
    );
  });

  it("applies conditions as disadvantage and cancels them with advantage", () => {
    const move = dw2.actions.find((action) => action.id === "sneak-past")!;
    const c = bladesCharacter({ scores: { dex: 1 }, conditions: ["frightened"] });
    const d = derive(c, dw2);
    expect(planMove(dw2, move, c, d).formula).toBe("3d6kl2+1[DEX]");
    const locked = bladesCharacter({ scores: { dex: 1 }, lockedConditions: ["frightened"] });
    expect(planMove(dw2, move, locked, derive(locked, dw2)).formula).toBe("3d6kl2+1[DEX]");
    expect(planMove(dw2, move, c, d, { mode: "advantage" }).formula).toBe("2d6+1[DEX]");
    expect(
      planMove(
        dw2,
        move,
        bladesCharacter({ scores: { dex: -1 } }),
        derive(bladesCharacter({ scores: { dex: -1 } }), dw2),
        { mode: "advantage" },
      ).formula,
    ).toBe("3d6kh2-1[DEX]");
  });

  it("asks Spout Lore's questions and adds one for each yes", () => {
    const move = dw2.actions.find((action) => action.id === "spout-lore")!;
    const c = bladesCharacter();
    const d = derive(c, dw2);
    const check = move.steps.find((step) => step.kind === "check");
    expect(check?.kind === "check" && check.ask?.kind).toBe("questions");
    expect(asksFirst(dw2, move)).toBe(true);
    expect(planMove(dw2, move, c, d, { ask: 0 }).formula).toBe("2d6");
    expect(planMove(dw2, move, c, d, { ask: 2 }).formula).toBe("2d6+2[Yes]");
  });

  it("reduces damage with usable armor, keeps damage at one minimum, and ignores armor for piercing", () => {
    const armored = bladesCharacter({ scores: { str: 2 }, data: { armor: 2 } });
    const derived = derive(armored, dw2);
    expect(dw2.resolveDamage!(armored, derived, 5, {})).toEqual({ hp: 3 });
    expect(dw2.resolveDamage!(armored, derived, 1, {})).toEqual({ hp: 1 });
    expect(dw2.resolveDamage!(armored, derived, 5, { type: "piercing" })).toEqual({ hp: 5 });

    const encumbered = bladesCharacter({ scores: { str: 1 }, data: { armor: 2 } });
    expect(dw2.resolveDamage!(encumbered, derive(encumbered, dw2), 5, {})).toEqual({ hp: 5 });
    expect(dw2.resolveDamage!(armored, derived, 0, {})).toEqual({ hp: 0 });
  });

  it("derives armor protection only from equipped armor items", () => {
    const armor = dw2.items.find((item) => item.id === "medium-armor")!;
    const equipped = bladesCharacter({
      scores: { str: 2 },
      inventory: [
        {
          id: "armor-instance",
          defId: armor.id,
          name: armor.name,
          description: armor.description,
          weight: armor.weight,
          tags: armor.tags,
          equipped: true,
          effects: armor.effects ?? [],
          active: "equipped",
          order: "0",
        },
      ],
    });
    expect(derive(equipped, dw2).values.armor).toBe(2);
    expect(dw2.resolveDamage!(equipped, derive(equipped, dw2), 5, {})).toEqual({ hp: 3 });

    const carried = bladesCharacter({
      scores: { str: 2 },
      inventory: [
        {
          id: "armor-instance",
          defId: armor.id,
          name: armor.name,
          description: armor.description,
          weight: armor.weight,
          tags: armor.tags,
          equipped: false,
          effects: armor.effects ?? [],
          active: "equipped",
          order: "0",
        },
      ],
    });
    expect(derive(carried, dw2).values.armor).toBe(0);
  });

  it("uses the Rogue mixed dice, including advantage and disadvantage", () => {
    const move = dw2.actions.find((action) => action.id === "rogue-tricks-trade")!;
    const c = bladesCharacter({ scores: { dex: 1 } });
    const d = derive(c, dw2);
    expect(planMove(dw2, move, c, d).formula).toBe("d8+d6+1[DEX]");
    expect(planMove(dw2, move, c, d, { mode: "advantage" }).formula).toBe("d8+2d6kh1+1[DEX]");
    expect(planMove(dw2, move, c, d, { mode: "disadvantage" }).formula).toBe("d8+2d6kl1+1[DEX]");
  });

  it("derives class HP and grants only the selected class starting move", () => {
    const c = bladesCharacter({ data: { classId: "wizard", level: 4 } });
    const d = derive(c, dw2);
    expect(d.values.maxHp).toBe(9);
    const actions = dw2.actionsFor(c, d).map((action) => action.id);
    expect(actions).toContain("wizard-weave-arcane");
    expect(actions).not.toContain("barbarian-rage");
  });

  it("offers all Paths and grants only the acquired starting move until a Path Move is selected", () => {
    expect(dw2Paths()).toHaveLength(27);
    expect(dw2Paths().every((path) => path.moves.length === 5)).toBe(true);
    expect(
      dw2Paths().every(
        (path) => path.rules.length === 5 && path.rules.every((move) => move.text.length > 40),
      ),
    ).toBe(true);
    const speech = dw2.actions.find((action) => action.name === "Forthright Speech")?.steps[0];
    expect(speech).toMatchObject({ kind: "check", stat: "cha" });
    expect(speech?.kind === "check" && plainText(speech.outcomes.strong)).toContain(
      "clear a Condition",
    );
    const path = dw2Paths().find((entry) => entry.id === "barbarian-berserker")!;
    const choice = dw2.creation!.choices.find((entry) => entry.id === "advancement")!;
    expect(choice.options.some((option) => option.id === path.id)).toBe(true);
    const c = bladesCharacter({ data: { classId: "barbarian", ownedPaths: path.id } });
    const ids = dw2.actionsFor(c, derive(c, dw2)).map((action) => action.id);
    expect(ids).toContain(`path-${path.id}-1`);
    expect(ids).not.toContain(`path-${path.id}-2`);
    const moves = choicesAt(dw2.creation, 3, c.data).find((entry) => entry.id === "advancement")!;
    expect(moves.options.some((option) => option.id === `path-move-${path.id}-2`)).toBe(true);
  });

  it("caps stat advancements at +2 before level 10 and allows +3 at level 10", () => {
    const levelNine = choicesAt(dw2.creation, 9, {}, { str: 2 }).find(
      (choice) => choice.id === "advancement",
    )!;
    expect(levelNine.options.some((option) => option.id === "stat-str")).toBe(false);
    const levelTen = choicesAt(dw2.creation, 10, {}, { str: 2 }).find(
      (choice) => choice.id === "advancement",
    )!;
    expect(levelTen.options.some((option) => option.id === "stat-str")).toBe(true);
    expect(derive(bladesCharacter({ scores: { str: 3 } }), dw2).mods.str).toBe(3);
  });

  it("limits tiered stat, Path, multiclass, and magic-item acquisitions", () => {
    const data = {
      classId: "barbarian",
      advancements: "stat-str,stat-dex",
      ownedPaths: "barbarian-berserker",
    };
    const early = choicesAt(dw2.creation, 4, data).flatMap((choice) => choice.options);
    expect(early.some((option) => option.id.startsWith("stat-"))).toBe(false);
    expect(early.some((option) => option.id === "barbarian-hedonist")).toBe(false);
    const middle = choicesAt(dw2.creation, 5, data).flatMap((choice) => choice.options);
    expect(middle.some((option) => option.id.startsWith("stat-"))).toBe(true);
    expect(middle.some((option) => option.id === "barbarian-hedonist")).toBe(true);
    expect(middle.some((option) => option.id === "magic-item")).toBe(true);
    const secondMulticlass = { ...data, multiclassPaths: "wizard-evoker" };
    expect(
      choicesAt(dw2.creation, 9, secondMulticlass)
        .flatMap((choice) => choice.options)
        .some((option) => option.id.startsWith("multiclass-")),
    ).toBe(false);
    expect(
      choicesAt(dw2.creation, 10, secondMulticlass)
        .flatMap((choice) => choice.options)
        .some((option) => option.id.startsWith("multiclass-")),
    ).toBe(true);
    expect(
      choicesAt(dw2.creation, 10, { ...data, magicItemAward: true })
        .flatMap((choice) => choice.options)
        .some((option) => option.id === "magic-item"),
    ).toBe(false);
  });

  it("offers every source-backed Struggle once until the current one is resolved", () => {
    const choices = choicesAt(dw2.creation, 2, { classId: "barbarian" });
    const options = choices.flatMap((choice) => choice.options);
    expect(options.filter((option) => option.id.startsWith("reveal-struggle-"))).toHaveLength(22);
    const reformed = options.find((option) => option.id === "reveal-struggle-reformed")!;
    expect(reformed.text).toBe(DW2_STRUGGLES.find((struggle) => struggle.id === "reformed")?.text);
    expect(reformed.grants).toMatchObject({
      struggleRevealed: true,
      struggleId: "reformed",
      struggleTrack: "Guilt",
      struggleProgress: 2,
      struggleMax: 3,
    });
    const alreadyRevealed = choicesAt(dw2.creation, 3, {
      classId: "barbarian",
      struggleRevealed: true,
    }).flatMap((choice) => choice.options);
    expect(alreadyRevealed.some((option) => option.id.startsWith("reveal-struggle-"))).toBe(false);
  });

  it("offers class-specific starting gear and gathers the selected item ids", () => {
    const creation = dw2.creation!;
    const barbarianChoices = choicesAt(creation, "create", { classId: "barbarian" });
    expect(barbarianChoices.map((choice) => choice.id)).toEqual(
      expect.arrayContaining([
        "starting-weapon-barbarian",
        "starting-item-one-barbarian",
        "starting-item-two-barbarian",
        "appearance-1-barbarian",
        "appearance-2-barbarian",
      ]),
    );
    expect(barbarianChoices.some((choice) => choice.id.endsWith("-bard"))).toBe(false);

    const picks = {
      class: { option: "barbarian", pattern: 0, order: [] },
      "starting-weapon-barbarian": { option: "ancestral-longsword", pattern: 0, order: [] },
      "starting-item-one-barbarian": { option: "adventuring-gear", pattern: 0, order: [] },
      "starting-item-two-barbarian": { option: "hearty-feast", pattern: 0, order: [] },
      "appearance-1-barbarian": { option: "cultural-raiment", pattern: 0, order: [] },
      "appearance-2-barbarian": { option: "massive-stature", pattern: 0, order: [] },
    };
    const pickedOptions = Object.fromEntries(
      Object.entries(picks).map(([id, pick]) => [id, pick.option]),
    );
    const pickedData: Record<string, string | number | boolean> = {};
    for (const choice of creation.choices) {
      const option = choice.options.find((item) => item.id === pickedOptions[choice.id]);
      if (!option) continue;
      pickedData[choice.field] = option.id;
      Object.assign(pickedData, option.grants);
    }
    const made = dataFrom(
      choicesAt(creation, "create", pickedData),
      pickedOptions,
      creation.listFields,
    );
    expect(made.startingItems).toBe("ancestral-longsword,shield,adventuring-gear,hearty-feast");
    expect(made.appearance1).toBe("Cultural raiment");
    expect(made.appearance2).toBe("Massive stature");
  });

  it("tracks the beta Wealth thresholds and purchase costs", () => {
    expect(wealthTierForBoxes(4).name).toBe("Poor");
    expect(wealthTierForBoxes(10).name).toBe("Modest");
    expect(wealthTierForBoxes(18).name).toBe("Comfortable");
    expect(wealthTierForBoxes(28).name).toBe("Rich");
    expect(wealthTierForBoxes(40).name).toBe("Aristocratic");
    expect(purchaseAtWealth(10, 1)).toBe(10);
    expect(purchaseAtWealth(10, 2)).toBe(9);
    expect(purchaseAtWealth(10, 3)).toBeNull();
    expect(addTreasureBoxes(38, 5)).toBe(40);
  });

  it("includes the common Beta v3 gear catalog and exposes typed Wealth costs", () => {
    expect(DW2_GEAR).toHaveLength(41);
    expect(dw2.items).toHaveLength(124);
    const magicItems = dw2.items.filter((item) => item.tags.includes("magic"));
    expect(magicItems).toHaveLength(61);
    expect(magicItems.filter((item) => item.tags.includes("artifact"))).toHaveLength(6);
    const artifacts = magicItems.filter((item) => item.tags.includes("artifact"));
    expect(
      artifacts.every((item) => item.artifact?.capacity === 5 && item.artifact.unlocks.length > 0),
    ).toBe(true);
    expect(
      artifacts.find((item) => item.name === "Alveric’s Soulstealer Blade")?.artifact?.unlocks[0]
        ?.text,
    ).toContain("Gravity-Defying Menace");
    expect(magicItems.find((item) => item.name === "animated shield")).toMatchObject({
      uses: 1,
      tags: ["magic", "magic-item"],
    });
    expect(
      magicItems.find((item) => item.name === "Alveric’s Soulstealer Blade")?.description,
    ).toContain("Trapped Souls");
    expect(dw2.items.find((item) => item.id === "dagger")).toMatchObject({
      wealthCost: { rank: 0, tier: "Broke" },
      tags: ["ammo", "hand", "close", "light", "precise", "thrown"],
      equippable: true,
    });
    expect(dw2.items.find((item) => item.id === "potion-of-healing")).toMatchObject({
      wealthCost: { rank: 4, tier: "Rich" },
      uses: 1,
      itemUse: "healing-potion",
      tags: ["magic"],
    });
    const gearCollection = systemLibrary(dw2).collections.find(
      (collection) => collection.id === "gear-weapons",
    )!;
    const dagger = gearCollection.entries.find((entry) => entry.id === "dagger")!;
    expect(dagger.text).toContain("Cost: Broke (0)");
  });

  it("defines each advancement once, gated by level", () => {
    const advancement = dw2.creation!.choices.filter((choice) => choice.field === "advancements");
    expect(advancement).toHaveLength(1);
    const ids = advancement[0]!.options.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    const at = (level: number) =>
      choicesAt(dw2.creation, level, { classId: "barbarian" })
        .flatMap((choice) => choice.options)
        .map((option) => option.id);
    expect(at(4).some((id) => id.startsWith("multiclass-"))).toBe(false);
    expect(at(5)).toContain("multiclass-wizard-evoker");
    expect(at(5)).not.toContain("multiclass-barbarian-berserker");
    expect(at(9)).not.toContain("artifact");
    expect(at(10)).toContain("artifact");
  });

  it("nests class moves, Paths and starting kits inside classes in the Libraries", () => {
    const lib = systemLibrary(dw2);
    const all = sourceEntries(lib);
    expect(
      all
        .filter((entry) => entry.kind === "move")
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(dw2.actions.map((action) => action.id).sort());
    const barbarian = lib.collections
      .find((c) => c.id === "classes")!
      .entries.find((entry) => entry.id === "barbarian")!;
    expect(barbarian.groups?.map((group) => group.id)).toEqual([
      "starting-move",
      "paths",
      "weapon",
      "equipment",
      "appearance",
    ]);
    const berserker = barbarian
      .groups!.find((group) => group.id === "paths")!
      .entries.find((entry) => entry.id === "barbarian-berserker")!;
    expect(berserker.groups?.[0]?.entries.map((entry) => entry.name)[0]).toBe("Trance-Like Fury");
    expect(lib.collections.some((c) => c.name.startsWith("Advancement "))).toBe(false);
    expect(lib.collections.find((c) => c.id === "struggles")?.entries).toHaveLength(22);
    const moves = viewEntries(
      lib.collections.find((c) => c.id === "classes")!.entries,
      "red nails",
    );
    expect(moves.map((view) => view.entry.id)).toEqual(["barbarian"]);
    expect(moves[0]!.reveal).toBe(true);
    const classes = lib.collections.find((c) => c.id === "classes")!.entries;
    expect(viewEntries(classes, "potion of healing", "all", topLevelKeys(lib))).toEqual([]);
  });

  it("exposes source-backed GM agenda, principles, moves, and NPC guidance", () => {
    expect(dw2.gmReference).toHaveLength(5);
    expect(
      plainText(dw2.gmReference?.find((section) => section.title === "Agenda")?.text),
    ).toContain("Portray a meaningful fantasy world");
    expect(
      plainText(dw2.gmReference?.find((section) => section.title === "Major NPCs")?.text),
    ).toContain("Drive");
  });

  it("unlocks Artifact moves and applies passive Artifact stat and HP effects", () => {
    const soulstealer = dw2.items.find((item) => item.name === "Alveric’s Soulstealer Blade")!;
    const caliburnus = dw2.items.find((item) => item.name === "Caliburnus, The Sword That Heals")!;
    const mark = dw2.items.find((item) => item.name === "Indelible Mark of Drakon")!;
    const inventoryItem = (
      definition: typeof soulstealer,
      unlocked: string[],
      equipped = true,
    ) => ({
      id: `instance:${definition.id}`,
      defId: definition.id,
      name: definition.name,
      description: definition.description,
      weight: definition.weight,
      tags: definition.tags,
      equipped,
      ...(definition.equippable ? { equippable: true } : {}),
      effects: [],
      active: "carried" as const,
      order: "a0",
      artifactProgress: 0,
      artifactUnlocked: unlocked,
    });
    const soulMove = soulstealer.artifact!.unlocks[0]!;
    const armed = bladesCharacter({
      scores: { str: -1, cha: 0 },
      data: { classId: "barbarian", level: 1 },
      inventory: [inventoryItem(soulstealer, [soulMove.id])],
    });
    expect(derive(armed, dw2).mods.str).toBe(1);
    expect(
      dw2.actionsFor(armed, derive(armed, dw2)).some((action) => action.name === soulMove.name),
    ).toBe(true);
    const carried = { ...armed, inventory: [inventoryItem(soulstealer, [soulMove.id], false)] };
    expect(derive(carried, dw2).mods.str).toBe(-1);
    expect(
      dw2.actionsFor(carried, derive(carried, dw2)).some((action) => action.name === soulMove.name),
    ).toBe(false);

    const healed = bladesCharacter({
      data: { classId: "barbarian", level: 1 },
      inventory: [
        inventoryItem(
          caliburnus,
          caliburnus.artifact!.unlocks.slice(0, 3).map((move) => move.id),
        ),
      ],
    });
    expect(derive(healed, dw2).mods.cha).toBe(3);
    const marked = bladesCharacter({
      data: { classId: "barbarian", level: 1 },
      inventory: [inventoryItem(mark, [])],
    });
    expect(derive(marked, dw2).values.maxHp).toBe(13);
  });
});

describe("Daggerheart", () => {
  it("offers domain-card advantage and requires three Hope for a Hope feature", () => {
    const character = bladesCharacter({ resources: { hope: 2 } });
    const derived = derive(character, dh);
    const domain = dh.actions.find(
      (action) => action.category.startsWith("domain-") && action.steps.length,
    )!;
    expect(planMove(dh, domain, character, derived, { mode: "advantage" }).formula).toContain(
      "1d6[Advantage]",
    );
    const hopeFeature = dh.actions.find((action) => action.id.startsWith("hope-"))!;
    expect(() => performMove(dh, hopeFeature, character, derived)).toThrow("Not enough resources");
    const prepared = { ...character, resources: { hope: 3 } };
    expect(performMove(dh, hopeFeature, prepared, derive(prepared, dh)).resourcesSpent).toEqual([
      { id: "hope", by: -3 },
    ]);
  });

  it("models multiclass feature/domain/foundation acquisition and tier exclusions", () => {
    const data = { classId: "guardian", domain1: "Valor", domain2: "Blade" };
    expect(
      choicesAt(dh.creation, 4, data)
        .flatMap((choice) => choice.options)
        .some((option) => option.id.startsWith("multiclass-")),
    ).toBe(false);
    const option = choicesAt(dh.creation, 5, data)
      .flatMap((choice) => choice.options)
      .find((entry) => entry.id.startsWith("multiclass-bard-grace-"))!;
    expect(option.cost).toBe(2);
    const character = bladesCharacter({ data: { ...data, ...option.grants, level: 5 } });
    const actions = dh.actionsFor(character, derive(character, dh));
    expect(actions.some((action) => action.id.startsWith("class-bard-"))).toBe(true);
    expect(actions.some((action) => action.id.startsWith("hope-bard-"))).toBe(false);
    const options = choicesAt(dh.creation, 6, character.data).flatMap((choice) => choice.options);
    expect(options.some((entry) => entry.id.startsWith("multiclass-"))).toBe(false);
    expect(
      options
        .filter((entry) =>
          entry.requiresAny?.some((requirements) => requirements.multiclassDomain === "Grace"),
        )
        .every((entry) => Number(entry.text.match(/^Level (\d+)/)?.[1] ?? 0) <= 3),
    ).toBe(true);
  });

  it("uses adversary difficulty and thresholds and reduces damage severity with armor", () => {
    const adversary = bladesCharacter({
      kind: "npc",
      fields: { difficulty: 17, majorThreshold: 6, severeThreshold: 12 },
    });
    const derived = derive(adversary, dh);
    expect(derived.values).toMatchObject({
      difficulty: 17,
      majorThreshold: 6,
      severeThreshold: 12,
    });
    expect(
      [0, 5, 6, 12].map((amount) => dh.resolveDamage!(adversary, derived, amount, {}).hp),
    ).toEqual([0, 1, 2, 3]);
    const pc = bladesCharacter({ resources: { armor: 1 } });
    expect(dh.resolveDamage!(pc, derived, 12, { armor: true })).toEqual({
      hp: 2,
      resources: [{ id: "armor", by: -1 }],
    });
    expect(dh.resolveDamage!(pc, derived, 5, { armor: true }).hp).toBe(0);
  });

  it("loads the licensed core class, heritage, card, weapon, and armor data", () => {
    expect(checkSystem(dh)).toEqual([]);
    expect(dh.creation?.choices.find((choice) => choice.id === "class")?.options).toHaveLength(9);
    expect(
      dh.creation?.choices.find((choice) => choice.id === "ancestry")?.options.length,
    ).toBeGreaterThan(10);
    expect(dh.items.some((item) => item.id === "weapon-longsword")).toBe(true);
    expect(dh.items.some((item) => item.id === "armor-gambeson-armor")).toBe(true);
    expect(dh.counters?.map((counter) => counter.id)).toContain("fear");
  });

  it("uses the Duality Dice and exposes Hope/Fear follow-ups against Difficulty", () => {
    const action = dh.actions.find((entry) => entry.id === "trait-agility")!;
    const c = bladesCharacter({ scores: { agility: 1 } });
    const failure = performMove(dh, action, c, derive(c, dh), { difficulty: 14 }, dice(3, 9));
    expect(failure.roll?.formula).toBe("1d12[Hope]+1d12[Fear]+1[AGI]");
    expect(failure.result).toBe("failure-fear");
    expect(failure.suggestions).toContainEqual(
      expect.objectContaining({ count: { systemCounter: "fear", by: 1 } }),
    );

    const critical = performMove(dh, action, c, derive(c, dh), { difficulty: 99 }, dice(7, 7));
    expect(critical.result).toBe("critical");
    expect(critical.suggestions.map((suggestion) => suggestion.id)).toEqual([
      "gain-hope",
      "clear-stress",
    ]);
  });

  it("lets a character spend Hope to add a named Experience to a Daggerheart roll", () => {
    const action = dh.actions.find((entry) => entry.id === "trait-agility")!;
    const c = bladesCharacter({
      scores: { agility: 1 },
      resources: { hope: 2 },
      data: { experience1Name: "Cliff climber", experience1Bonus: 2 },
    });
    const result = performMove(
      dh,
      action,
      c,
      derive(c, dh),
      { difficulty: 12, rollBonuses: ["experience-1"] },
      dice(7, 4),
    );
    expect(result.roll?.formula).toBe("1d12[Hope]+1d12[Fear]+1[AGI]+2[Cliff climber]");
    expect(result.resourcesSpent).toEqual([{ id: "hope", by: -1 }]);
  });

  it("limits domain-card choices to the selected class domains and grants selected cards", () => {
    const classChoice = dh.creation!.choices.find((choice) => choice.id === "class")!;
    const bard = classChoice.options.find((option) => option.id === "bard")!;
    const data: Record<string, string | number | boolean> = { classId: bard.id, ...bard.grants };
    const choices = choicesAt(dh.creation, "create", data);
    const cardChoice = choices.find((choice) => choice.id === "domain-card-1")!;
    expect(cardChoice.options.length).toBeGreaterThan(0);
    expect(
      cardChoice.options.every((option) =>
        option.requiresAny?.some((requirements) =>
          Object.entries(requirements).every(([key, value]) => data[key] === value),
        ),
      ),
    ).toBe(true);
    const selected = cardChoice.options[0]!;
    const c = bladesCharacter({
      data: { ...data, domainCards: selected.id, activeDomainCards: selected.id },
    });
    const granted = dh.actions.find((action) => action.id.endsWith(selected.id))!;
    expect(dh.actionsFor(c, derive(c, dh)).map((action) => action.id)).toContain(granted.id);
  });

  it("offers two tiered advancements and only improves named Experiences", () => {
    expect(dh.creation?.choicesPerAdvancement).toBe(2);
    const choices = choicesAt(dh.creation, 2, {
      experience1Name: "Cliff climber",
      experience2Name: "Courtier",
    });
    const slots = choices.filter((choice) => choice.id.startsWith("advancement-2-"));
    expect(slots).toHaveLength(2);
    const firstSlot = slots[0]!;
    expect(firstSlot.options.some((option) => option.id === "improve-experiences-1-2")).toBe(true);
    expect(firstSlot.options.some((option) => option.id === "improve-experiences-1-3")).toBe(false);
    expect(
      firstSlot.options.find((option) => option.id === "improve-experiences-1-2")?.dataBoost,
    ).toEqual([
      { field: "experience1Bonus", by: 1 },
      { field: "experience2Bonus", by: 1 },
    ]);
    const subclassChoice = dh.creation!.choices.find((choice) => choice.id === "subclass")!;
    const subclass = subclassChoice.options[0]!;
    expect(
      choicesAt(dh.creation, 5, {
        subclassId: subclass.id,
        classId: String(subclass.requires?.classId),
      })
        .flatMap((choice) => choice.options)
        .some((option) => option.id === "subclass-specialization"),
    ).toBe(true);
  });

  it("treats a matching Duality result as a hit even above the target Difficulty", () => {
    const attack = dh.actions.find((entry) => entry.id === "attack-longsword")!;
    const c = bladesCharacter({ scores: { agility: 1 } });
    const result = performMove(dh, attack, c, derive(c, dh), {}, dice(6, 6), {
      targets: [{ id: "target", name: "Target" }],
      valueAt: () => 99,
    });
    expect(result.targets?.[0]).toMatchObject({ result: "critical", hit: true, against: 99 });
    expect(result.suggestions.map((suggestion) => suggestion.id)).toContain(
      "weapon-critical-damage-longsword",
    );
  });

  it("registers Daggerheart with the other built-in systems", () => {
    expect(listSystems().map((system) => system.id)).toContain("daggerheart");
  });
});

describe("resolveEffects", () => {
  it("applies set, then add, then multiply, then clamps", () => {
    const r = resolveEffects({ armor: 0 }, [
      { name: "Cap", effects: [{ type: "modify", path: "armor", op: "max", value: 5 }] },
      { name: "Double", effects: [{ type: "modify", path: "armor", op: "multiply", value: 2 }] },
      { name: "Mail", effects: [{ type: "modify", path: "armor", op: "add", value: 2 }] },
      { name: "Base", effects: [{ type: "modify", path: "armor", op: "set", value: 1 }] },
    ]);
    // set 1, add 2 → 3, multiply 2 → 6, max 5 → 5
    expect(r.values.armor).toBe(5);
    expect(r.why.armor).toEqual(["Base: 0 → 1", "Mail: 1 → 3", "Double: 3 → 6", "Cap: 6 → 5"]);
  });

  it("orders by priority before phase", () => {
    const r = resolveEffects({ x: 1 }, [
      { name: "late", effects: [{ type: "modify", path: "x", op: "set", value: 9, priority: 1 }] },
      { name: "early", effects: [{ type: "modify", path: "x", op: "add", value: 1 }] },
    ]);
    expect(r.values.x).toBe(9);
  });

  it("collects granted moves, tags and roll bonuses once", () => {
    const r = resolveEffects({}, [
      {
        name: "Holy Symbol",
        effects: [
          { type: "grantMove", move: "turn-undead" },
          { type: "grantMove", move: "turn-undead" },
          { type: "grantTag", tag: "holy" },
          { type: "rollBonus", moves: ["hack-and-slash"], value: 1 },
        ],
      },
    ]);
    expect(r.moves).toEqual(["turn-undead"]);
    expect(r.tags).toEqual(["holy"]);
    expect(r.bonuses).toEqual([
      { source: "Holy Symbol", stat: undefined, moves: ["hack-and-slash"], value: 1 },
    ]);
  });

  it("is the same whichever order sources arrive in", () => {
    const a = { name: "A", effects: [{ type: "modify", path: "x", op: "add", value: 2 } as const] };
    const b = {
      name: "B",
      effects: [{ type: "modify", path: "x", op: "multiply", value: 3 } as const],
    };
    expect(resolveEffects({ x: 1 }, [a, b]).values.x).toBe(
      resolveEffects({ x: 1 }, [b, a]).values.x,
    );
  });
});

describe("Dungeon World data", () => {
  it("maps scores to modifiers", () => {
    const m = dw.modifier;
    expect([3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18].map(m)).toEqual([
      -3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 2, 3,
    ]);
  });

  it("bands 2d6 results", () => {
    expect([12, 10, 9, 7, 6, 2].map((t) => dw.result(t, []))).toEqual([
      "strong",
      "strong",
      "weak",
      "weak",
      "miss",
      "miss",
    ]);
    expect(dw.results.map((r) => r.label)).toEqual(["Full success", "Partial success", "Miss"]);
  });

  it("has unique ids, and every rolled move has outcomes for each band", () => {
    const ids = dw.actions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of dw.actions)
      for (const step of m.steps) {
        if (step.kind !== "check") continue;
        for (const r of dw.results) expect(step.outcomes[r.id], `${m.id} ${r.id}`).toBeDefined();
        if (step.stat)
          expect(
            dw.stats.some((s) => s.id === step.stat),
            m.id,
          ).toBe(true);
        for (const ids of Object.values(step.followUps ?? {}))
          for (const f of ids)
            expect(
              dw.followUps.some((x) => x.id === f),
              `${m.id} ${f}`,
            ).toBe(true);
      }
    for (const m of dw.actions)
      expect(
        dw.actionCategories.some((k) => k.id === m.category),
        m.id,
      ).toBe(true);
  });

  it("offers eight classes as plugin creation options", () => {
    expect(dw.creation?.choices.find((choice) => choice.id === "class")?.options).toHaveLength(8);
  });
});

describe("tokenStats", () => {
  it("shows HP as a bar that changes colour as it drops", () => {
    const stats = (hp: number) =>
      dw.tokenStats({ resources: { hp } } as never, { values: { maxHp: 16 } } as never)[0]!;
    expect(stats(16)).toMatchObject({ id: "hp", value: 16, max: 16 });
    expect(new Set([stats(16).colour, stats(8).colour, stats(4).colour]).size).toBe(3);
  });
});

describe("checking a system", () => {
  it("finds nothing wrong with Dungeon World", () => {
    expect(checkSystem(dw)).toEqual([]);
  });

  it("names what does not hold together", () => {
    const broken = {
      ...dw,
      actions: [
        ...dw.actions,
        { ...dw.actions[0]!, id: dw.actions[0]!.id },
        {
          id: "odd",
          name: "Odd",
          category: "nope",
          trigger: "",
          text: emptyRichText(),
          steps: [{ kind: "check" as const, stat: "luck", outcomes: {} }],
        },
      ],
    };
    const problems = checkSystem(broken);
    expect(problems).toContain(`Two actions share the id “${dw.actions[0]!.id}”.`);
    expect(problems).toContain("Odd: no action category “nope”.");
    expect(problems).toContain("Odd: no stat “luck”.");
    expect(problems).toContain("Odd: no outcome for “Full success”.");
    expect(() => defineSystem(broken)).toThrow(/has problems/);
  });
});
