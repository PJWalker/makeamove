import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import * as Y from "yjs";
import { Campaign, createCampaign } from "../../../campaign/campaign";
import { device } from "../../../platform/device";
import {
  createFolder,
  deleteCharacter,
  deleteFolder,
  getCharacter,
  listFolders,
  moveToFolder,
  newCharacter,
  newNpc,
  renameFolder,
  viewCharacter,
  actingCharacterId,
  claimCharacter,
  playedCharacterId,
  playerOf,
  releaseCharacter,
} from "../api";
import {
  editHotbar,
  hotbarSlots,
  insertAt,
  MAX_SLOTS,
  moveTo,
  pin,
  placeAt,
  shift,
  unpin,
} from "../hotbar";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  const campaign = await Campaign.open(await createCampaign("Barrows", "Gwen"));
  const player = new Y.Map<unknown>();
  player.set("name", "Pat");
  player.set("role", "player");
  campaign.members.set("pat", player);
  return campaign;
}

describe("characters in a campaign", () => {
  it("deletes a character and clears anyone playing it", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    campaign.members.get("pat")!.set("character", id);
    deleteCharacter(campaign, id);
    expect(getCharacter(campaign, id)).toBeUndefined();
    expect(actingCharacterId(campaign)).toBeUndefined();
    device.value = { id: "pat", name: "Pat" };
    expect(actingCharacterId(campaign)).toBeUndefined();
    campaign.destroy();
  });
});

describe("player characters", () => {
  it("claims a character, takes it over, and acts as it over the open sheet", async () => {
    const campaign = await setUp();
    // The GM's characters are pregenerated: no one plays them yet.
    const ayla = newCharacter(campaign, "Ayla", "fighter");
    const brom = newCharacter(campaign, "Brom", "wizard");
    expect(playerOf(campaign, ayla)).toBeUndefined();
    device.value = { id: "pat", name: "Pat" };
    claimCharacter(campaign, ayla);
    expect(playedCharacterId(campaign)).toBe(ayla);
    expect(getCharacter(campaign, ayla)!.owner).toBe("pat");
    viewCharacter(campaign, brom);
    expect(actingCharacterId(campaign)).toBe(ayla);
    // Another player can't claim it from under them.
    campaign.members.set("sam", new Y.Map());
    campaign.members.get("sam")!.set("role", "player");
    device.value = { id: "sam", name: "Sam" };
    claimCharacter(campaign, ayla);
    expect(playedCharacterId(campaign)).toBeUndefined();
    device.value = { id: "pat", name: "Pat" };
    releaseCharacter(campaign);
    expect(actingCharacterId(campaign)).toBe(brom);
    campaign.destroy();
  });

  it("plays a player's first character, and stops when it's deleted", async () => {
    const campaign = await setUp();
    device.value = { id: "pat", name: "Pat" };
    const ayla = newCharacter(campaign, "Ayla", "fighter");
    newCharacter(campaign, "Brom", "wizard");
    expect(playedCharacterId(campaign)).toBe(ayla);
    deleteCharacter(campaign, ayla);
    expect(campaign.members.get("pat")!.has("playing")).toBe(false);
    campaign.destroy();
  });
});

describe("hotbar editing", () => {
  it("pins once, caps the length, unpins and reorders", () => {
    expect(pin(["a"], "a")).toEqual(["a"]);
    expect(pin(["a"], "b")).toEqual(["a", "b"]);
    expect(
      pin(
        Array.from({ length: MAX_SLOTS }, (_, index) => String(index)),
        "x",
      ),
    ).toHaveLength(MAX_SLOTS);
    expect(unpin(["a", "b"], "a")).toEqual(["b"]);
    expect(shift(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(shift(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });

  it("moves a slot to a drop position", () => {
    expect(moveTo(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(moveTo(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(placeAt(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(placeAt(["a", "b", "c"], "c", 1)).toEqual(["a", "c", "b"]);
    expect(insertAt(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
    expect(insertAt(["a", "b"], "b", 0)).toEqual(["b", "a"]);
    expect(moveTo(["a", "b", "c"], "a", 1)).toEqual(["a", "b", "c"]);
  });

  it("pins with no character selected", async () => {
    const campaign = await setUp();
    expect(editHotbar(campaign, (slots) => pin(slots, "cmd:fit"))).toBe(true);
    expect(hotbarSlots(campaign, undefined)).toContain("cmd:fit");
    campaign.destroy();
  });
});

describe("NPCs and folders", () => {
  it("does not auto-select an NPC as the only character a player owns", async () => {
    const campaign = await setUp();
    newNpc(campaign, "Goblin");
    viewCharacter(campaign, undefined);
    expect(actingCharacterId(campaign)).toBeUndefined();
    campaign.destroy();
  });

  it("files characters in folders, and deleting a folder returns them to the top", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const folder = createFolder(campaign, "Party");
    renameFolder(campaign, folder, "The Party");
    expect(listFolders(campaign)).toEqual([{ id: folder, name: "The Party" }]);
    moveToFolder(campaign, id, folder);
    expect(getCharacter(campaign, id)!.folder).toBe(folder);
    deleteFolder(campaign, folder);
    expect(getCharacter(campaign, id)!.folder).toBeUndefined();
    expect(listFolders(campaign)).toEqual([]);
    campaign.destroy();
  });
});
