import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../table/panelLayout", () => ({ showPanel: () => {} }));

import { Campaign, createCampaign } from "../../campaign/campaign";
import {
  addItem,
  getCharacter,
  makeMove,
  moveRequest,
  newCharacter,
  startMove,
  targetRequest,
} from "../../features/characters/api";
import { actionsFor, derive } from "../../features/characters/store";
import { device } from "../../platform/device";
import { daggerheart } from "../daggerheart";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  return Campaign.open(await createCampaign("daggerheart campaign tests", "Gwen", "daggerheart"));
}

describe("Daggerheart campaign behavior", () => {
  it("creates a character with the expected starting resources and rolls against a Difficulty", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Mira", "guardian", {
      scores: { agility: 1, strength: 2 },
      data: { classId: "guardian", domain1: "Valor", domain2: "Blade" },
    });
    const character = getCharacter(campaign, id)!;
    const derived = derive(character, daggerheart);
    const action = daggerheart.actions.find((entry) => entry.id === "trait-agility")!;

    expect(character.resources).toMatchObject({
      hp: derived.values.maxHp,
      stress: 0,
      hope: 2,
    });
    startMove(campaign, id, action);
    expect(moveRequest.value).toEqual({ moveId: action.id, characterId: id });
    moveRequest.value = null;

    const message = await makeMove(campaign, id, action, { difficulty: 12 });
    expect(message).toMatchObject({ kind: "move", moveId: action.id, characterName: "Mira" });
    if (message?.kind === "move") {
      expect(message.roll?.formula).toContain("1d12[Hope]+1d12[Fear]+1[AGI]");
      expect(message.difficulty).toBe(12);
    }
    campaign.destroy();
  });

  it("adds a weapon attack to the character actions and requests a target", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Mira", "guardian", {
      scores: {},
      data: { classId: "guardian", domain1: "Valor", domain2: "Blade" },
    });
    const longsword = daggerheart.items.find((item) => item.id === "weapon-longsword")!;
    addItem(campaign, id, longsword, true);
    const character = getCharacter(campaign, id)!;
    const actions = actionsFor(character, daggerheart, derive(character, daggerheart));
    const attack = actions.find((action) => action.id === "attack-longsword")!;

    expect(attack).toBeDefined();
    startMove(campaign, id, attack);
    expect(targetRequest.value).toEqual({ moveId: attack.id, characterId: id });
    campaign.destroy();
  });
});