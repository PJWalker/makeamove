import { describe, expect, it } from "vite-plus/test";

import * as Y from "yjs";
import {
  boostFrom,
  choicesAt,
  dataFrom,
  pointsSpent,
  raise,
  validBoost,
  previewChoices,
} from "../../features/characters/creation";
import {
  characterView,
  createCharacter,
  derive,
  actionsFor,
} from "../../features/characters/store";
import { dnd55e as dnd } from "../dnd55e";
import { rootOf } from "../../data/schema";
import { campaignShape } from "../../campaign/schema";

describe("guided creation", () => {
  const creation = dnd.creation!;

  it("uses system defaults for missing scores, preserving zero and negative values", () => {
    const system = {
      ...dnd,
      stats: [
        { id: "rating", name: "Rating", abbr: "R", default: 0 },
        { id: "strength", name: "Strength", abbr: "STR", default: -1 },
      ],
    };
    const doc = new Y.Doc();
    const characters = rootOf(doc, campaignShape).characters;
    const id = createCharacter(characters, system, { name: "Test", owner: "me" });
    expect(characterView(id, characters.get(id)!, system).scores).toEqual({
      rating: 0,
      strength: -1,
    });
    doc.destroy();
  });

  it("offers system choices at creation and class-specific choices at advancement points", () => {
    expect(choicesAt(creation, "create", { classId: "wizard" }).map((c) => c.id)).toEqual([
      "class",
      "species",
      "background",
    ]);
    const at3 = choicesAt(creation, 3, { classId: "wizard" });
    expect(at3.map((c) => c.id)).toEqual(["subclass"]);
    expect(at3[0]!.options.map((o) => o.id)).toEqual(["evoker"]);
    expect(choicesAt(creation, 2, { classId: "wizard" })).toEqual([]);
  });

  it("costs a point buy, refusing scores it can’t buy", () => {
    const buy = creation.scores.pointBuy!;
    expect(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, buy)).toBe(27);
    expect(pointsSpent({ str: 16, dex: 8 }, buy)).toBeNull();
  });

  it("places a background’s boost and caps scores at 20", () => {
    const sage = creation.choices[2]!.options.find((o) => o.id === "sage")!;
    expect(boostFrom(sage, 0, ["int", "con", "wis"])).toEqual({ int: 2, con: 1 });
    expect(boostFrom(sage, 1, ["int", "con", "wis"])).toEqual({ int: 1, con: 1, wis: 1 });
    expect(raise({ int: 19, con: 10 }, { int: 2, con: 1 })).toEqual({ int: 20, con: 11 });
  });

  it("requires boost placements to be complete, distinct, and eligible", () => {
    const option = {
      id: "traits",
      name: "Traits",
      text: "",
      boost: { stats: ["str", "dex"], amounts: [[1, 1]] },
    };
    expect(validBoost(option, 0, [], { str: 1, dex: 1 }, {})).toBe(false);
    expect(validBoost(option, 0, ["str", "str"], { str: 1, dex: 1 }, {})).toBe(false);
    expect(validBoost(option, 0, ["str", "dex"], { str: 1, dex: 1 }, {}, ["str"])).toBe(false);
    expect(validBoost(option, 0, ["str", "dex"], { str: 1, dex: 1 }, {})).toBe(true);
  });

  it("applies selected data boosts cumulatively to existing values", () => {
    const options = [
      { id: "improve", name: "Improve", text: "", dataBoost: [{ field: "experience", by: 1 }] },
    ];
    const choices = [1, 2].map((index) => ({
      id: `pick-${index}`,
      label: "Improve",
      field: "advancements",
      at: 2,
      options,
    }));
    expect(
      dataFrom(choices, { "pick-1": "improve", "pick-2": "improve" }, ["advancements"], {
        experience: 2,
      }).experience,
    ).toBe(4);
  });

  it("previews grants for other choices without hiding the selected acquisition", () => {
    const creation = {
      scores: {},
      choices: [
        {
          id: "unlock",
          label: "Unlock",
          field: "advancements",
          at: 2,
          options: [
            {
              id: "magic",
              name: "Magic",
              text: "",
              grants: { domain: "Arcana", unlocked: true },
              notRequires: { unlocked: true },
            },
          ],
        },
        {
          id: "card",
          label: "Card",
          field: "card",
          at: 2,
          options: [
            { id: "spell", name: "Spell", text: "", requires: { domain: "Arcana" } },
            { id: "base", name: "Base", text: "" },
          ],
        },
      ],
    };
    const choices = previewChoices(creation, 2, {}, {}, { unlock: "magic" });
    expect(
      choices
        .find((choice) => choice.id === "unlock")
        ?.options.some((option) => option.id === "magic"),
    ).toBe(true);
    expect(
      choices
        .find((choice) => choice.id === "card")
        ?.options.some((option) => option.id === "spell"),
    ).toBe(true);
  });

  it("writes each choice and its grants, gathering list fields", () => {
    const choices = choicesAt(creation, "create", { classId: "fighter" });
    const data = dataFrom(choices, { species: "goliath", background: "soldier" }, ["feats"]);
    expect(data).toMatchObject({
      species: "goliath",
      speed: 35,
      background: "soldier",
      feats: "savage-attacker",
      "skill:athletics": 1,
    });
  });
});

describe("5.5e origins in the numbers", () => {
  function make(data: Record<string, string | number>, level = 1, classId = "fighter") {
    const doc = new Y.Doc();
    const characters = rootOf(doc, campaignShape).characters;
    const id = createCharacter(characters, dnd, {
      name: "Brom",
      owner: "me",
      scores: { con: 14, dex: 14 },
      data: { classId, level, ...data },
    });
    return characterView(id, characters.get(id)!, dnd);
  }

  it("adds Dwarven Toughness and Tough per level, and Alert to initiative", () => {
    const plain = derive(make({}, 4), dnd).values;
    const tough = derive(make({ species: "dwarf", feats: "tough,alert" }, 4), dnd).values;
    expect((tough.maxHp ?? 0) - (plain.maxHp ?? 0)).toBe(3 * 4);
    expect((tough.initiative ?? 0) - (plain.initiative ?? 0)).toBe(plain.prof ?? 0);
  });

  it("gives the subclass from level 3 and species actions to their species", () => {
    const ids = (c: ReturnType<typeof make>) => actionsFor(c, dnd, derive(c, dnd)).map((a) => a.id);
    expect(ids(make({ subclass: "champion" }, 2))).not.toContain("subclass-champion");
    expect(ids(make({ subclass: "champion" }, 3))).toContain("subclass-champion");
    expect(ids(make({ species: "dragonborn" }))).toContain("breath-weapon");
    expect(ids(make({ species: "human" }))).not.toContain("breath-weapon");
  });
});
