import { SRD_SPELLS } from "../dnd55e/srdSpells";
import { SRD_FEATS } from "../dnd55e/srdFeats";
import { SRD_MONSTERS } from "../dnd55e/srdMonsters";
import { SRD_MAGIC_ITEMS } from "../dnd55e/srdMagicItems";
import { SRD_CLASS_FEATURES } from "../dnd55e/srdClasses";
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { checkSystem, getSystem } from "..";
import { dnd55e as dnd, pactMagic, proficiencyAt, spellSlots } from "../dnd55e";
import { CLASSES, ITEMS } from "../dnd55e/data";
import {
  characterView,
  createCharacter,
  derive,
  instanceOf,
  actionsFor,
} from "../../features/characters/store";
import { performMove, planMove } from "../../features/characters/moves";
import { Campaign, createCampaign } from "../../campaign/campaign";
import { summaryOf } from "../../campaign/registry";
import { device } from "../../platform/device";
import { newCharacter, moveRequest, startMove, systemOf } from "../../features/characters/api";

vi.mock("../../table/panelLayout", () => ({ showPanel: () => {} }));

const fixed = (...values: number[]) => {
  if (!values.length) throw new RangeError("Dice fixture needs at least one result");
  let index = 0;
  return () => values[index++ % values.length]!;
};

function character(classId: string, scores: Record<string, number>, level = 1) {
  const doc = new Y.Doc();
  const characters = doc.getMap<Y.Map<any>>("characters");
  const id = createCharacter(characters, dnd, {
    name: "Vex",
    owner: "me",
    scores,
    data: { classId, level },
  });
  const m = characters.get(id)!;
  return { m, view: () => characterView(id, m, dnd) };
}

function equip(m: Y.Map<any>, itemId: string) {
  const inv = m.get("inventory") as Y.Map<any>;
  const item = {
    ...instanceOf(
      ITEMS.find((i) => i.id === itemId)!,
      `a${inv.size}`,
    ),
    equipped: true,
  };
  inv.set(item.id, item);
}

describe("D&D 5.5e", () => {
  it("imports the complete SRD spell catalog with parseable class and level metadata", () => {
    expect(SRD_SPELLS.length).toBeGreaterThan(300);
    expect(SRD_SPELLS.find((spell) => spell.id === "acid-arrow")).toMatchObject({
      level: 2,
      classes: ["wizard"],
    });
    expect(SRD_SPELLS.find((spell) => spell.id === "acid-splash")).toMatchObject({
      level: 0,
      classes: ["sorcerer", "wizard"],
    });
    expect(dnd.actions.some((action) => action.id === "acid-arrow")).toBe(true);
    expect(dnd.actions.some((action) => action.id === "animal-shapes")).toBe(true);
  });

  it("imports the SRD feat catalog into guided feat choices", () => {
    expect(SRD_FEATS.length).toBeGreaterThan(15);
    expect(dnd.creation?.feats?.options.map((feat) => feat.id)).toContain("boon-of-combat-prowess");
  });

  it("is registered and holds together", () => {
    expect(checkSystem(dnd)).toEqual([]);
    expect(getSystem("dnd-5.5e").name).toBe(dnd.name);
  });

  it("imports level-gated class and subclass features from the complete SRD", () => {
    expect(SRD_CLASS_FEATURES.length).toBeGreaterThan(180);
    const { m, view } = character("fighter", {}, 3);
    m.get("data").set("subclass", "champion");
    const ids = actionsFor(view(), dnd, derive(view(), dnd)).map((action) => action.id);
    expect(ids).toContain("feature-fighter-3-improved-critical");
    expect(ids).not.toContain("feature-fighter-15-superior-critical");
    expect(
      dnd.actions.find((action) => action.id === "feature-wizard-18-spell-mastery")?.text.length,
    ).toBeGreaterThan(100);
    expect(
      performMove(
        dnd,
        dnd.actions.find((action) => action.id === "action-surge")!,
        view(),
        derive(view(), dnd),
      ).resourcesSpent,
    ).toEqual([{ id: "actionSurge", by: -1 }]);
  });

  it("uses Champion critical ranges only for weapon and unarmed attacks", () => {
    const { m, view } = character("fighter", { str: 16 }, 3);
    m.get("data").set("subclass", "champion");
    const attack = dnd.actions.find((action) => action.id === "melee-attack")!;
    const aim = { targets: [{ id: "target", name: "Target" }], valueAt: () => 99 };
    expect(
      performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 19, aim).targets?.[0],
    ).toMatchObject({ result: "crit", hit: true });
    expect(
      performMove(
        dnd,
        dnd.actions.find((action) => action.id === "check-str")!,
        view(),
        derive(view(), dnd),
        {},
        () => 19,
      ).result,
    ).toBe("rolled");
    m.get("data").set("level", 15);
    expect(
      performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 18, aim).targets?.[0],
    ).toMatchObject({ result: "crit", hit: true });
  });

  it("imports D&D SRD monsters as creatable system entries", () => {
    expect(SRD_MONSTERS.length).toBeGreaterThan(150);
    expect(SRD_MONSTERS.find((monster) => monster.id === "aboleth")).toMatchObject({
      name: "Aboleth",
      hp: 150,
      size: "large",
      fields: { ac: 17, cr: "10 (XP 5,900, or 7,200 in lair; PB +4)" },
      scores: { str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 },
    });
    expect(dnd.monsters?.length).toBe(SRD_MONSTERS.length);
  });

  it("imports the SRD magic-item catalog without replacing implemented gear effects", () => {
    expect(SRD_MAGIC_ITEMS.length).toBeGreaterThan(100);
    expect(dnd.items.find((item) => item.id === "magic-bag-of-holding")?.name).toBe(
      "Bag of Holding",
    );
    expect(
      dnd.items.find((item) => item.id === "ring-of-protection")?.effects?.length,
    ).toBeGreaterThan(0);
  });

  it("works out modifiers, proficiency, slots and pact magic", () => {
    expect([1, 8, 9, 10, 11, 12, 15, 20].map(dnd.modifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5]);
    expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyAt)).toEqual([2, 2, 3, 4, 5, 6, 6]);
    const wizard = CLASSES.find((k) => k.id === "wizard")!;
    const paladin = CLASSES.find((k) => k.id === "paladin")!;
    expect(spellSlots(wizard, 5)).toEqual([4, 3, 2]);
    expect(spellSlots(paladin, 1)).toEqual([2]);
    expect(spellSlots(paladin, 5)).toEqual([4, 2]);
    expect(pactMagic(1)).toEqual({ slots: 1, level: 1 });
    expect(pactMagic(11)).toEqual({ slots: 3, level: 5 });
  });

  it("derives HP, AC and saves from class, armour and scores", () => {
    const { m, view } = character("fighter", { str: 16, dex: 14, con: 14 }, 3);
    let d = derive(view(), dnd);
    // d10 + 2, then 6 + 2 per level.
    expect(d.values.maxHp).toBe(12 + 2 * 8);
    expect(d.values.ac).toBe(12);
    expect(d.values["save:str"]).toBe(2);
    expect(d.values["save:dex"]).toBe(0);
    equip(m, "chain-shirt");
    equip(m, "shield");
    d = derive(view(), dnd);
    expect(d.values.ac).toBe(13 + 2 + 2);
    equip(m, "gauntlets-of-ogre-power");
    expect(derive(view(), dnd).mods.str).toBe(4);
  });

  it("gives Barbarians and Monks Unarmored Defense", () => {
    expect(derive(character("barbarian", { dex: 14, con: 16 }).view(), dnd).values.ac).toBe(15);
    expect(derive(character("monk", { dex: 16, wis: 14 }).view(), dnd).values.ac).toBe(15);
  });

  it("rolls skills with proficiency and Expertise, and attacks with the weapon in hand", () => {
    const { m, view } = character("rogue", { dex: 16 });
    (m.get("data") as Y.Map<any>).set("skill:stealth", 2);
    const c = view();
    const d = derive(c, dnd);
    const stealth = dnd.actions.find((a) => a.id === "skill-stealth")!;
    expect(planMove(dnd, stealth, c, d).formula).toBe("1d20+3[DEX]+4[Prof]");
    expect(planMove(dnd, stealth, c, d, { mode: "advantage" }).formula).toBe(
      "2d20kh1+3[DEX]+4[Prof]",
    );
    equip(m, "rapier");
    const attack = dnd.actions.find((a) => a.id === "finesse-attack")!;
    const hit = performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 12);
    expect(hit.result).toBe("rolled");
    expect(hit.suggestions[0]!.roll?.formula).toBe("1d8+3[DEX]");
    const crit = performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 20);
    expect(crit.result).toBe("crit");
    expect(crit.suggestions[0]!.roll?.formula).toBe("2d8+3[DEX]");
    expect(performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 1).result).toBe(
      "fumble",
    );
  });

  it("offers prepared spells and known cantrips within class and level limits", () => {
    const { m, view } = character("wizard", { int: 16 }, 5);
    m.get("data").set("preparedSpells", "fireball,cure-wounds");
    m.get("data").set("knownCantrips", "fire-bolt");
    const c = view();
    const d = derive(c, dnd);
    const ids = actionsFor(c, dnd, d).map((a) => a.id);
    expect(ids).toContain("fireball");
    expect(ids).not.toContain("cure-wounds");
    expect(ids).not.toContain("magic-missile");
    expect(d.values.preparedMax).toBe(9);
    expect(d.values.cantripsMax).toBe(4);
    expect(d.values.spellDc).toBe(8 + 3 + 3);
    const bolt = dnd.actions.find((a) => a.id === "fire-bolt")!;
    expect(performMove(dnd, bolt, c, d, {}, () => 10).suggestions[0]!.roll?.formula).toBe("2d10");
    const fighter = character("fighter", {}).view();
    expect(actionsFor(fighter, dnd, derive(fighter, dnd)).some((a) => a.category === "spell")).toBe(
      false,
    );
  });

  it("spends a chosen spell slot, scales damage, and rejects exhausted casting", () => {
    const { m, view } = character("wizard", { int: 16 }, 7);
    const fireball = dnd.actions.find((action) => action.id === "fireball")!;
    const result = performMove(dnd, fireball, view(), derive(view(), dnd), { variant: "slot-4" });
    expect(result.resourcesSpent).toEqual([{ id: "slot4", by: -1 }]);
    expect(result.rollValues).toEqual({ spellSlot: 4 });
    expect(result.suggestions[0]!.roll?.formula).toBe("9d6");
    for (let level = 1; level <= 9; level++) m.get("resources").set(`slot${level}`, 0);
    expect(() => performMove(dnd, fireball, view(), derive(view(), dnd))).toThrow(
      "Not enough resources",
    );
    expect(
      performMove(
        dnd,
        dnd.actions.find((action) => action.id === "fire-bolt")!,
        view(),
        derive(view(), dnd),
        {},
        () => 10,
      ).resourcesSpent,
    ).toBeUndefined();
  });

  it("offers Pact Magic slots and free rituals separately", () => {
    const warlock = character("warlock", { cha: 16 }, 5).view();
    const spell = dnd.actions.find((action) => action.id === "hellish-rebuke")!;
    expect(planMove(dnd, spell, warlock, derive(warlock, dnd)).resources).toEqual([
      { id: "pact", by: -1 },
    ]);
    const wizard = character("wizard", { int: 16 }).view();
    const ritual = dnd.actions.find((action) => action.id === "detect-magic")!;
    expect(
      planMove(dnd, ritual, wizard, derive(wizard, dnd), { variant: "ritual" }).resources,
    ).toEqual([]);
  });

  it("takes 2 per level of Exhaustion from every d20 test", () => {
    const { m, view } = character("fighter", { str: 10 });
    (m.get("data") as Y.Map<any>).set("exhaustion", 2);
    const c = view();
    const d = derive(c, dnd);
    expect(
      planMove(
        dnd,
        dnd.actions.find((a) => a.id === "check-str")!,
        c,
        d,
      ).formula,
    ).toBe("1d20-4[Exhaustion]");
    expect(d.values.speed).toBe(20);
  });

  describe("actions against targets", () => {
    const attack = dnd.actions.find((a) => a.id === "melee-attack")!;
    const targets = [
      { id: "t1", name: "Goblin", characterId: "g1" },
      { id: "t2", name: "Orc", characterId: "g2", long: true },
    ];
    const ac: Record<string, number> = { g1: 13, g2: 30 };
    const valueAt = (t: { characterId?: string }, key: string) =>
      key === "ac" ? ac[t.characterId!] : undefined;

    it("rolls once per target and reads each against its AC", () => {
      const { view } = character("fighter", { str: 16 });
      const c = view();
      // Goblin: 12 + 3 + 2 = 17 hits AC 13. Orc at long range: disadvantage, 15 and 12 keep 12, 17 misses AC 30.
      const r = performMove(dnd, attack, c, derive(c, dnd), {}, fixed(12, 15, 12), {
        targets,
        valueAt,
      });
      expect(r.roll).toBeUndefined();
      expect(r.targets!.map((t) => [t.roll!.total, t.against, t.hit])).toEqual([
        [17, 13, true],
        [17, 30, false],
      ]);
      expect(r.targets![1]!.roll!.formula.startsWith("2d20kl1")).toBe(true);
      // Damage is offered for the target that was hit.
      expect(r.suggestions[0]!.roll!.targets!.map((t) => t.id)).toEqual(["t1"]);
      expect(r.suggestions[0]!.roll!.damage).toBe("damage");
    });

    it("hits on a natural 20 and misses on a natural 1, whatever the AC", () => {
      const { view } = character("fighter", { str: 16 });
      const c = view();
      const r = performMove(
        dnd,
        attack,
        c,
        derive(c, dnd),
        { mode: "advantage" },
        fixed(20, 1, 1, 1),
        { targets, valueAt },
      );
      // Advantage cancels the Orc's long-range disadvantage.
      expect(r.targets![1]!.roll!.formula.startsWith("1d20")).toBe(true);
      expect(r.targets!.map((t) => [t.result, t.hit])).toEqual([
        ["crit", true],
        ["fumble", false],
      ]);
      expect(r.suggestions[0]!.label).toMatch(/critical/);
    });

    it("asks each target of a save spell to roll against the caster’s DC", () => {
      const { view } = character("wizard", { int: 16 }, 5);
      const c = view();
      const fireball = dnd.actions.find((a) => a.id === "fireball")!;
      const r = performMove(dnd, fireball, c, derive(c, dnd), {}, undefined, { targets });
      expect(r.save).toMatchObject({ action: "save-dex", name: "Dexterity Save", difficulty: 14 });
      expect(r.suggestions[0]!.roll).toMatchObject({
        damage: "fire",
        targets: [{ id: "t1" }, { id: "t2" }],
      });
    });
  });
});

describe("D&D 5.5e campaign behavior", () => {
  it("plays the system selected for a campaign and asks before a d20 roll", async () => {
    device.value = { id: "gm", name: "Gwen" };
    const campaignId = await createCampaign("Sunless Citadel", "Gwen", "dnd-5.5e");
    const campaign = await Campaign.open(campaignId);
    expect(systemOf(campaign).id).toBe("dnd-5.5e");
    expect(summaryOf(campaignId)?.systemId).toBe("dnd-5.5e");
    const characterId = newCharacter(campaign, "Vex", "rogue");
    startMove(
      campaign,
      characterId,
      systemOf(campaign).actions.find((action) => action.id === "skill-stealth")!,
    );
    expect(moveRequest.value).toMatchObject({ moveId: "skill-stealth" });
    moveRequest.value = null;
    campaign.destroy();
  });
});
