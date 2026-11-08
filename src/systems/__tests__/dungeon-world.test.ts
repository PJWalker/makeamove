import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { Campaign, createCampaign } from "../../campaign/campaign";
import {
  addItem,
  bumpResource,
  createCopy,
  deleteCharacter,
  getCharacter,
  listCharacters,
  makeMove,
  moveRequest,
  newCharacter,
  newNpc,
  removeItem,
  resetCopy,
  setData,
  setNpcField,
  setTemplate,
  startMove,
  systemOf,
  targetRequest,
  toggleCondition,
  tokenStatsSource,
} from "../../features/characters/api";
import { actionsFor, derive } from "../../features/characters/store";
import { device } from "../../platform/device";
import { dungeonWorld } from "../dungeon-world";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  return Campaign.open(
    await createCampaign("dungeon-world campaign tests", "Gwen", "dungeon-world"),
  );
}

describe("Dungeon World campaign behavior", () => {
  it("creates a class character with full HP and class-specific moves", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter", {
      scores: { str: 16, con: 14 },
      data: { level: 2 },
    });
    const character = getCharacter(campaign, id)!;
    const available = actionsFor(character, dungeonWorld, derive(character, dungeonWorld)).map(
      (action) => action.id,
    );

    expect(character.resources.hp).toBe(derive(character, dungeonWorld).values.maxHp);
    expect(available).toContain("hack-and-slash");
    expect(available).toContain("bend-bars");
    expect(available).not.toContain("cast-a-spell");
    campaign.destroy();
  });

  it("asks for a stat before Defy Danger and posts the rolled move", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const move = dungeonWorld.actions.find((action) => action.id === "defy-danger")!;

    startMove(campaign, id, move);
    expect(moveRequest.value).toEqual({ moveId: "defy-danger", characterId: id });
    expect(targetRequest.value).toBeNull();
    moveRequest.value = null;

    const message = await makeMove(campaign, id, move, { stat: "str" });
    expect(message).toMatchObject({ kind: "move", moveId: "defy-danger", characterName: "Ayla" });
    if (message?.kind === "move") expect(message.roll).toBeDefined();
    campaign.destroy();
  });

  it("copies an NPC template until copy-specific fields are changed", async () => {
    const campaign = await setUp();
    const id = newNpc(campaign, "Goblin");
    setData(campaign, id, "maxHp", 7);
    setNpcField(campaign, id, "armor", 1);
    addItem(campaign, id, systemOf(campaign).items[0]!);
    setTemplate(campaign, id, { naming: "number", names: [] });
    expect(getCharacter(campaign, id)!.template).toEqual({ naming: "number", names: [] });

    const first = createCopy(campaign, id, "Goblin 1");
    const second = createCopy(campaign, id, "Goblin 2");
    expect(getCharacter(campaign, first)).toMatchObject({
      name: "Goblin 1",
      base: id,
      kind: "npc",
      resources: { hp: 6 },
      fields: { armor: 1 },
    });
    expect(getCharacter(campaign, first)!.template).toBeUndefined();
    expect(getCharacter(campaign, first)!.inventory).toHaveLength(1);

    bumpResource(campaign, first, "hp", -4, 7);
    expect(getCharacter(campaign, first)!.resources.hp).toBe(2);
    expect(getCharacter(campaign, second)!.resources.hp).toBe(6);
    expect(getCharacter(campaign, id)!.resources.hp).toBe(6);
    expect(tokenStatsSource(campaign)(first)[0]!).toMatchObject({ value: 2, max: 7 });

    setNpcField(campaign, second, "armor", 3);
    setNpcField(campaign, id, "armor", 2);
    expect(getCharacter(campaign, first)!.fields.armor).toBe(2);
    expect(getCharacter(campaign, second)!.fields.armor).toBe(3);

    toggleCondition(campaign, first, systemOf(campaign).conditions[0]!.id);
    expect(getCharacter(campaign, first)!.conditions).toHaveLength(1);
    expect(getCharacter(campaign, id)!.conditions).toHaveLength(0);
    removeItem(campaign, first, getCharacter(campaign, first)!.inventory[0]!.id);
    expect(getCharacter(campaign, first)!.inventory).toHaveLength(0);
    expect(getCharacter(campaign, second)!.inventory).toHaveLength(1);
    expect(listCharacters(campaign).map((character) => character.id)).toEqual([id]);

    resetCopy(campaign, first);
    expect(getCharacter(campaign, first)).toMatchObject({
      name: "Goblin 1",
      resources: { hp: 6 },
      conditions: [],
    });
    deleteCharacter(campaign, id);
    expect(getCharacter(campaign, first)).toBeUndefined();
    campaign.destroy();
  });

  it("equips gear dropped from an item token", async () => {
    const campaign = await setUp();
    const id = newNpc(campaign, "Goblin");
    const gear = systemOf(campaign).items.find((item) => item.equippable)!;
    addItem(campaign, id, gear, true);
    expect(getCharacter(campaign, id)!.inventory[0]).toMatchObject({
      defId: gear.id,
      equipped: true,
    });
    campaign.destroy();
  });
});
