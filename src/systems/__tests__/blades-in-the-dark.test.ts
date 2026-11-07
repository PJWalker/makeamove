import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../table/panelLayout", () => ({ showPanel: () => {} }));

import { Campaign, createCampaign } from "../../campaign/campaign";
import { getCharacter, makeMove, moveRequest, newCharacter, startMove } from "../../features/characters/api";
import { actionsFor, derive } from "../../features/characters/store";
import { device } from "../../platform/device";
import { bladesInTheDark } from "../blades-in-the-dark";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  return Campaign.open(
    await createCampaign("blades-in-the-dark campaign tests", "Gwen", "blades-in-the-dark"),
  );
}

describe("Blades in the Dark campaign behavior", () => {
  it("creates a Cutter with its selected ability and load limit", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Vex", "cutter", {
      scores: { skirmish: 2, command: 1 },
      data: { playbook: "cutter", specialAbilities: "ability-cutter-mule" },
    });
    const character = getCharacter(campaign, id)!;
    const derived = derive(character, bladesInTheDark);

    expect(character.data.playbook).toBe("cutter");
    expect(derived.values).toMatchObject({ prowess: 1, maxLoad: 7 });
    expect(actionsFor(character, bladesInTheDark, derived).map((action) => action.id)).toContain(
      "ability-cutter-mule",
    );
    campaign.destroy();
  });

  it("offers an action-roll choice and posts a desperate action with XP follow-up", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Vex", "cutter", { scores: { hunt: 1 }, data: {} });
    const hunt = bladesInTheDark.actions.find((action) => action.id === "hunt")!;

    startMove(campaign, id, hunt);
    expect(moveRequest.value).toEqual({ moveId: "hunt", characterId: id });
    moveRequest.value = null;
    const message = await makeMove(campaign, id, hunt, { mode: "desperate" });

    expect(message).toMatchObject({ kind: "move", moveId: "hunt", characterName: "Vex" });
    if (message?.kind === "move") {
      expect(message.roll?.formula).toContain("Desperate");
      expect(message.suggestions).toContainEqual(expect.objectContaining({ id: "xp-insight" }));
    }
    campaign.destroy();
  });
});