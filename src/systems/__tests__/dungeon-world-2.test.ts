import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../workspace/panelLayout", () => ({ showPanel: () => {} }));
import * as Y from "yjs";

import { systemActions } from "../../workspace/commands/system";
import { Campaign, createCampaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import {
  addItem,
  bumpResource,
  clearArtifactTrack,
  getCharacter,
  markArtifactTrack,
  makeMove,
  moveRequest,
  newCharacter,
  newNpc,
  viewCharacter,
  actingCharacterId,
  setConditionState,
  setData,
  targetRequest,
  setLearned,
  startMove,
  systemOf,
  tokenStatsSource,
  updateItem,
} from "../../features/characters/api";
import {
  relationshipsOf,
  setRelationship,
  setRelationshipDepth,
} from "../../features/characters/relationships";
import { actionsFor, derive } from "../../features/characters/store";
import { defaultHotbar, hotbarSlots } from "../../features/characters/hotbar";
import { sessionMoveUsed } from "../../features/characters/sessionMoves";
import { applyDamage } from "../../features/characters/resolution";
import { tokenMarksSource } from "../../features/combat/api";
import {
  applyClassChange,
  beginDungeonWorld2Downtime,
  breakDungeonWorld2Weapon,
  carouseDungeonWorld2,
  consumeDungeonWorld2Item,
  dungeonWorld2DowntimeEpoch,
  endDungeonWorld2Session,
  makeDungeonWorld2Camp,
  prepareDungeonWorld2Journey,
  resolveComfortOrSupport,
  resolveStruggle,
  revealStruggle,
  resupplyDungeonWorld2,
  saleValueDungeonWorld2Item,
  sellDungeonWorld2Item,
  shopDungeonWorld2Service,
  trainDungeonWorld2,
} from "../dungeon-world-2/campaign";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  return Campaign.open(await createCampaign("DW2 campaign tests", "Gwen", "dungeon-world-2"));
}

describe("Dungeon World 2 campaign behavior", () => {
  it("creates an NPC with its own HP, system fields, and a token HP bar", async () => {
    const campaign = await setUp();
    const id = newNpc(campaign, "Goblin");
    const npc = getCharacter(campaign, id)!;
    expect(npc).toMatchObject({
      kind: "npc",
      name: "Goblin",
      resources: { hp: 6 },
      data: { maxHp: 6 },
    });
    expect(Object.keys(npc.fields)).toEqual(systemOf(campaign).npcFields.map((field) => field.id));
    setData(campaign, id, "maxHp", 12);
    expect(tokenStatsSource(campaign)(id)[0]).toMatchObject({ id: "hp", value: 6, max: 12 });
    campaign.destroy();
  });

  it("marks Bloodied tokens at half HP or less, beside their conditions", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const pips = () => tokenMarksSource(campaign)("token", id).pips.map((pip) => pip.id);
    setConditionState(campaign, id, "angry", "marked");
    expect(pips()).toEqual(["angry"]);
    const max = getCharacter(campaign, id)!.resources.hp!;
    bumpResource(campaign, id, "hp", Math.floor(max / 2) - max);
    expect(pips()).toEqual(["angry", "bloodied"]);
    campaign.destroy();
  });

  it("creates a character at full HP and selects it", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    expect(systemOf(campaign).id).toBe("dungeon-world-2");
    expect(actingCharacterId(campaign)).toBe(id);
    expect(getCharacter(campaign, id)).toMatchObject({
      name: "Ayla",
      data: { classId: "fighter", level: 1 },
      resources: { hp: 10 },
    });
    campaign.destroy();
  });

  it("posts text-only and rolled DW2 move cards", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const moves = systemOf(campaign).actions;
    const textMove = await makeMove(
      campaign,
      id,
      moves.find((move) => move.id === "comfort-or-support")!,
    );
    expect(textMove).toMatchObject({ kind: "move", moveId: "comfort-or-support" });
    if (textMove?.kind === "move") expect(textMove.roll).toBeUndefined();

    const rollMove = await makeMove(
      campaign,
      id,
      moves.find((move) => move.id === "trade-blows")!,
      { stat: "str" },
    );
    expect(rollMove).toMatchObject({ kind: "move", moveId: "trade-blows", characterName: "Ayla" });
    if (rollMove?.kind === "move") expect(rollMove.roll).toBeDefined();
    campaign.destroy();
  });

  it("learns a move dropped on it, beyond its class, and can forget it", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const system = systemOf(campaign);
    const has = () =>
      actionsFor(
        getCharacter(campaign, id)!,
        system,
        derive(getCharacter(campaign, id)!, system),
      ).map((action) => action.id);
    expect(has()).not.toContain("barbarian-rage");
    setLearned(campaign, id, "barbarian-rage", true);
    setLearned(campaign, id, "barbarian-rage", true);
    expect(getCharacter(campaign, id)!.learned).toEqual(["barbarian-rage"]);
    expect(has()).toContain("barbarian-rage");
    setLearned(campaign, id, "barbarian-rage", false);
    expect(has()).not.toContain("barbarian-rage");
    campaign.destroy();
  });

  it("asks for a stat before a DW2 move, then posts the move card", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const tradeBlows = systemOf(campaign).actions.find((move) => move.id === "trade-blows")!;
    startMove(campaign, id, tradeBlows);
    expect(moveRequest.value).toEqual({ moveId: "trade-blows", characterId: id });
    expect(targetRequest.value).toBeNull();
    moveRequest.value = null;
    const message = await makeMove(campaign, id, tradeBlows, { stat: "str" });
    expect(message).toMatchObject({ kind: "move", moveId: "trade-blows", characterName: "Ayla" });
    campaign.destroy();
  });

  it("equips armor and keeps the DW2 move in the hotbar and index", async () => {
    const campaign = await setUp();
    const id = newCharacter(campaign, "Ayla", "fighter");
    const armor = systemOf(campaign).items.find((item) =>
      item.effects?.some((effect) => effect.type === "modify"),
    )!;
    addItem(campaign, id, armor);
    const item = getCharacter(campaign, id)!.inventory[0]!;
    updateItem(campaign, id, item.id, { equipped: true });
    expect(getCharacter(campaign, id)!.inventory[0]!.equipped).toBe(true);
    expect(derive(getCharacter(campaign, id)!, systemOf(campaign)).values.armor).toBe(1);
    const ids = systemActions(campaign).map((action) => action.id);
    expect(ids).toContain("move:trade-blows");
    expect(ids).toContain(`character:${id}`);
    expect(defaultHotbar(campaign, id)).toContain("move:trade-blows");
    expect(hotbarSlots(campaign, id)).toEqual(defaultHotbar(campaign, id));
    campaign.destroy();
  });

  it("awards group XP for End the Session questions once per session", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");

    expect(await endDungeonWorld2Session(campaign, ayla, [true, false, true])).toBe(true);
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(2);
    expect(getCharacter(campaign, brom)?.data.xp).toBe(2);
    expect(await endDungeonWorld2Session(campaign, ayla, [true, true, true])).toBe(false);
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(2);
    campaign.destroy();
  });

  it("restores the party at Make Camp and only clears a selected marked Condition", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");
    bumpResource(campaign, ayla, "hp", -4);
    bumpResource(campaign, brom, "hp", -3);
    setConditionState(campaign, ayla, "angry", "marked");
    setConditionState(campaign, brom, "frightened", "locked");
    const shield = systemOf(campaign).items.find((item) => item.id === "shield")!;
    addItem(campaign, ayla, shield, true);
    const shieldInstance = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === shield.id,
    )!;
    updateItem(campaign, ayla, shieldInstance.id, { usesLeft: 0 });

    expect(
      await makeDungeonWorld2Camp(campaign, ayla, { [ayla]: "angry", [brom]: "frightened" }),
    ).toBe(true);
    for (const id of [ayla, brom]) {
      const character = getCharacter(campaign, id)!;
      expect(character.resources.hp).toBe(derive(character, systemOf(campaign)).values.maxHp);
    }
    expect(getCharacter(campaign, ayla)?.conditions).not.toContain("angry");
    expect(getCharacter(campaign, brom)?.conditions).toContain("frightened");
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === shieldInstance.id)
        ?.usesLeft,
    ).toBe(1);
    expect(await makeDungeonWorld2Camp(campaign, ayla, {})).toBe(false);
    campaign.destroy();
  });

  it("repairs one broken mundane weapon at camp for a fighter with Snap the Blade", async () => {
    const campaign = await setUp();
    const fighter = newCharacter(campaign, "Fighter", "fighter");
    setData(campaign, fighter, "ownedPaths", "fighter-weaponmaster");
    setData(campaign, fighter, "ownedPathMoves", "fighter-weaponmaster:5");
    const longsword = systemOf(campaign).items.find((item) => item.id === "longsword")!;
    addItem(campaign, fighter, longsword, true);
    const weapon = getCharacter(campaign, fighter)!.inventory.find(
      (item) => item.defId === longsword.id,
    )!;

    expect(breakDungeonWorld2Weapon(campaign, fighter, weapon.id)).toBe(true);
    expect(
      getCharacter(campaign, fighter)?.inventory.find((item) => item.id === weapon.id)?.broken,
    ).toBe(true);
    expect(await makeDungeonWorld2Camp(campaign, fighter, {}, { [fighter]: weapon.id })).toBe(true);
    expect(
      getCharacter(campaign, fighter)?.inventory.find((item) => item.id === weapon.id)?.broken,
    ).toBe(false);
    campaign.destroy();
  });

  it("uses a healing potion or hearty feast and spends their limited uses", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");
    const potion = systemOf(campaign).items.find((item) => item.id === "potion-of-healing")!;
    const feast = systemOf(campaign).items.find((item) => item.id === "hearty-feast")!;
    addItem(campaign, ayla, potion);
    const healingPotion = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === potion.id,
    )!;
    bumpResource(campaign, ayla, "hp", -5);
    expect(
      consumeDungeonWorld2Item(campaign, ayla, healingPotion.id, { kind: "heal-half-lost" }),
    ).toBe(true);
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === healingPotion.id)
        ?.usesLeft,
    ).toBe(0);
    expect(
      consumeDungeonWorld2Item(campaign, ayla, healingPotion.id, { kind: "heal-half-lost" }),
    ).toBe(false);

    addItem(campaign, ayla, potion);
    const conditionPotion = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === potion.id && item.usesLeft === 1,
    )!;
    setConditionState(campaign, ayla, "angry", "locked");
    expect(
      consumeDungeonWorld2Item(campaign, ayla, conditionPotion.id, {
        kind: "clear-locked",
        condition: "angry",
      }),
    ).toBe(true);
    expect(getCharacter(campaign, ayla)?.lockedConditions).not.toContain("angry");

    addItem(campaign, ayla, feast);
    const heartyFeast = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === feast.id,
    )!;
    bumpResource(campaign, ayla, "hp", -6);
    bumpResource(campaign, brom, "hp", -4);
    expect(consumeDungeonWorld2Item(campaign, ayla, heartyFeast.id)).toBe(true);
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9);
    expect(getCharacter(campaign, brom)?.resources.hp).toBe(8);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === heartyFeast.id)?.usesLeft,
    ).toBe(0);
    campaign.destroy();
  });

  it("lets a magic wand drain or mark a Condition, then restores its charge at camp", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const wand = systemOf(campaign).items.find((item) => item.name === "magic wand")!;
    addItem(campaign, ayla, wand);
    const wandInstance = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === wand.id,
    )!;

    expect(
      consumeDungeonWorld2Item(campaign, ayla, wandInstance.id, {
        kind: "mark-condition",
        condition: "angry",
      }),
    ).toBe(true);
    expect(getCharacter(campaign, ayla)?.conditions).toContain("angry");
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft,
    ).toBe(1);
    expect(consumeDungeonWorld2Item(campaign, ayla, wandInstance.id, { kind: "drain" })).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft,
    ).toBe(0);
    expect(await makeDungeonWorld2Camp(campaign, ayla, {})).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === wandInstance.id)?.usesLeft,
    ).toBe(1);
    campaign.destroy();
  });

  it("lets an equipped shield block one non-piercing attack but not piercing damage", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const shield = systemOf(campaign).items.find((item) => item.id === "shield")!;
    addItem(campaign, ayla, shield, true);
    const shieldInstance = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === shield.id,
    )!;
    const target = { id: "token-ayla", name: "Ayla", characterId: ayla };
    bumpResource(campaign, ayla, "hp", -3);

    applyDamage(campaign, "shieldable-attack", target, 5, false, {
      type: "physical",
      shieldItemId: shieldInstance.id,
    });
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(9);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === shieldInstance.id)
        ?.usesLeft,
    ).toBe(0);

    addItem(campaign, ayla, shield, true);
    const replacement = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === shield.id && item.usesLeft === 1,
    )!;
    applyDamage(campaign, "piercing-attack", target, 2, false, { type: "piercing" });
    expect(getCharacter(campaign, ayla)?.resources.hp).toBe(7);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === replacement.id)?.usesLeft,
    ).toBe(1);
    campaign.destroy();
  });

  it("resolves Comfort or Support benefits for both PCs and advances the receiver’s directional Depth", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");
    setConditionState(campaign, ayla, "angry", "marked");
    setConditionState(campaign, brom, "frightened", "marked");
    setRelationship(campaign.characters, brom, ayla, "Trusts");
    setRelationshipDepth(campaign.characters, brom, ayla, 1, 3);

    expect(
      await resolveComfortOrSupport(campaign, ayla, brom, [
        { kind: "clear-comforted", condition: "frightened" },
        { kind: "gain-depth" },
        { kind: "clear-supporter", condition: "angry" },
      ]),
    ).toBe(true);
    expect(getCharacter(campaign, ayla)?.conditions).not.toContain("angry");
    expect(getCharacter(campaign, brom)?.conditions).not.toContain("frightened");
    expect(
      relationshipsOf(campaign.characters, brom).find((relationship) => relationship.to === ayla)
        ?.depth,
    ).toBe(2);
    expect(await resolveComfortOrSupport(campaign, ayla, brom, [])).toBe(false);
    campaign.destroy();
  });

  it("prepares a quick Perilous Journey with Conditions for every PC and its pace modifier", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");

    expect(
      prepareDungeonWorld2Journey(campaign, ayla, "quick", {
        [ayla]: "angry",
        [brom]: "frightened",
      }),
    ).toBe(true);
    expect(getCharacter(campaign, ayla)?.conditions).toContain("angry");
    expect(getCharacter(campaign, brom)?.conditions).toContain("frightened");
    expect(moveRequest.value).toMatchObject({
      moveId: "perilous-journey",
      characterId: ayla,
      choice: { extra: -1 },
    });
    moveRequest.value = null;
    campaign.destroy();
  });

  it("resolves Downtime Carouse, Resupply, and once-per-period Train", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");
    setConditionState(campaign, ayla, "angry", "locked");

    expect(dungeonWorld2DowntimeEpoch(campaign)).toBe(0);
    expect(beginDungeonWorld2Downtime(campaign)).toBe(1);
    expect(trainDungeonWorld2(campaign, ayla)).toBe(true);
    expect(trainDungeonWorld2(campaign, ayla)).toBe(false);
    expect(getCharacter(campaign, ayla)?.data.xp).toBe(1);
    expect(carouseDungeonWorld2(campaign, ayla, "clear-locked", undefined, "angry")).toBe(true);
    expect(getCharacter(campaign, ayla)?.lockedConditions).not.toContain("angry");
    expect(carouseDungeonWorld2(campaign, ayla, "gain-depth", brom)).toBe(true);
    expect(
      relationshipsOf(campaign.characters, ayla).find((relationship) => relationship.to === brom)
        ?.depth,
    ).toBe(1);

    const provisions = systemOf(campaign).items.find((item) => item.id === "provisions")!;
    const magicSupply = {
      id: "test-magic-supply",
      name: "Magic supply",
      description: "",
      weight: 0,
      uses: 2,
      tags: ["magic"],
    };
    addItem(campaign, ayla, provisions);
    addItem(campaign, ayla, magicSupply);
    const character = getCharacter(campaign, ayla)!;
    const provisionInstance = character.inventory.find((item) => item.defId === provisions.id)!;
    const magicInstance = character.inventory.find((item) => item.defId === magicSupply.id)!;
    updateItem(campaign, ayla, provisionInstance.id, { usesLeft: 0 });
    updateItem(campaign, ayla, magicInstance.id, { usesLeft: 0 });
    expect(resupplyDungeonWorld2(campaign, ayla)).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === provisionInstance.id)
        ?.usesLeft,
    ).toBe(3);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === magicInstance.id)
        ?.usesLeft,
    ).toBe(0);
    setData(campaign, ayla, "treasureBoxes", 2);
    expect(beginDungeonWorld2Downtime(campaign)).toBe(2);
    expect(await shopDungeonWorld2Service(campaign, ayla, "repair", 3)).toBe(true);
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(1);
    expect(trainDungeonWorld2(campaign, ayla)).toBe(true);
    campaign.destroy();
  });

  it("sells priced gear for Treasure only when its Wealth tier is higher", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    beginDungeonWorld2Downtime(campaign);
    const shortspear = systemOf(campaign).items.find((item) => item.id === "shortspear")!;
    const longsword = systemOf(campaign).items.find((item) => item.id === "longsword")!;
    addItem(campaign, ayla, shortspear);
    addItem(campaign, ayla, longsword);
    const character = getCharacter(campaign, ayla)!;
    const cheap = character.inventory.find((item) => item.defId === shortspear.id)!;
    const better = character.inventory.find((item) => item.defId === longsword.id)!;

    expect(saleValueDungeonWorld2Item(campaign, ayla, cheap.id)).toBe(0);
    expect(sellDungeonWorld2Item(campaign, ayla, cheap.id)).toBe(true);
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(4);
    expect(saleValueDungeonWorld2Item(campaign, ayla, better.id)).toBe(1);
    expect(sellDungeonWorld2Item(campaign, ayla, better.id)).toBe(true);
    expect(getCharacter(campaign, ayla)?.data.treasureBoxes).toBe(5);
    campaign.destroy();
  });

  it("tracks Artifact marks and applies the source unlock policies per item instance", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const items = systemOf(campaign).items;
    const soulstealer = items.find((item) => item.name === "Alveric’s Soulstealer Blade")!;
    const branch = items.find((item) => item.name === "Gwendolen’s Branch of the Green")!;
    addItem(campaign, ayla, soulstealer, true);
    addItem(campaign, ayla, branch, true);
    const soulstealerInstance = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === soulstealer.id,
    )!;
    const branchInstance = getCharacter(campaign, ayla)!.inventory.find(
      (item) => item.defId === branch.id,
    )!;

    for (let mark = 0; mark < 4; mark++)
      expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id)).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === soulstealerInstance.id)
        ?.artifactProgress,
    ).toBe(4);
    expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id)).toBe(false);
    const firstSoulMove = soulstealer.artifact!.unlocks[0]!.id;
    expect(markArtifactTrack(campaign, ayla, soulstealerInstance.id, firstSoulMove)).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === soulstealerInstance.id),
    ).toMatchObject({ artifactProgress: 0, artifactUnlocked: [firstSoulMove] });
    for (let mark = 0; mark < 5; mark++)
      expect(markArtifactTrack(campaign, ayla, branchInstance.id, "ignored")).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === branchInstance.id)
        ?.artifactUnlocked,
    ).toEqual([branch.artifact!.unlocks[0]!.id]);
    for (let mark = 0; mark < 4; mark++)
      expect(markArtifactTrack(campaign, ayla, branchInstance.id)).toBe(true);
    expect(markArtifactTrack(campaign, ayla, branchInstance.id)).toBe(true);
    expect(
      getCharacter(campaign, ayla)?.inventory.find((item) => item.id === branchInstance.id)
        ?.artifactUnlocked,
    ).toEqual([branch.artifact!.unlocks[1]!.id]);
    expect(clearArtifactTrack(campaign, ayla, branchInstance.id)).toBe(false);
    campaign.destroy();
  });

  it("limits Comfort per PC and Make Camp per party until a new session begins", async () => {
    const campaign = await setUp();
    const ayla = newCharacter(campaign, "Ayla", "barbarian");
    const brom = newCharacter(campaign, "Brom", "bard");
    const comfort = systemOf(campaign).actions.find(
      (action) => action.id === "comfort-or-support",
    )!;
    const camp = systemOf(campaign).actions.find((action) => action.id === "make-camp")!;

    expect(await makeMove(campaign, ayla, comfort)).toBeDefined();
    expect(sessionMoveUsed(campaign, ayla, comfort)).toBe(true);
    expect(sessionMoveUsed(campaign, brom, comfort)).toBe(false);
    viewCharacter(campaign, ayla);
    expect(
      systemActions(campaign).find((action) => action.id === "move:comfort-or-support")?.available,
    ).toBe("Already used this session");
    expect(await makeMove(campaign, ayla, comfort)).toBeUndefined();
    viewCharacter(campaign, brom);
    expect(
      systemActions(campaign).find((action) => action.id === "move:comfort-or-support")?.available,
    ).toBe(true);
    expect(await makeMove(campaign, brom, comfort)).toBeDefined();
    expect(
      systemActions(campaign).find((action) => action.id === "move:comfort-or-support")?.available,
    ).toBe("Already used this session");

    expect(await makeMove(campaign, ayla, camp)).toBeDefined();
    expect(sessionMoveUsed(campaign, brom, camp)).toBe(true);
    expect(
      systemActions(campaign).find((action) => action.id === "move:make-camp")?.available,
    ).toBe("Already used this session");
    expect(await makeMove(campaign, brom, camp)).toBeUndefined();

    await campaign.chat.post(
      { kind: "system", text: "Session 1 begins", event: "session-start", session: 1 },
      { id: "gm", name: "Gwen" },
    );
    expect(sessionMoveUsed(campaign, ayla, comfort)).toBe(false);
    expect(sessionMoveUsed(campaign, brom, camp)).toBe(false);
    expect(
      systemActions(campaign).find((action) => action.id === "move:make-camp")?.available,
    ).toBe(true);
    campaign.destroy();
  });

  it("changes DW2 Class and reallocated advances without resetting campaign progress", async () => {
    const campaign = await Campaign.open(
      await createCampaign("Class change", "Gwen", "dungeon-world-2"),
    );
    const characterId = newCharacter(campaign, "Erinyette", "barbarian");
    const character = campaign.characters.get(characterId)!;
    campaign.doc.transact(() => {
      setData(campaign, characterId, "level", 5);
      setData(campaign, characterId, "xp", 3);
      setData(campaign, characterId, "advancements", "stat-dex-2,stat-wis-3,path-rogue-burglar");
      setData(campaign, characterId, "treasureBoxes", 7);
      (character.get("resources") as Y.Map<number>).set("hp", 10);
    });

    expect(
      applyClassChange(
        campaign,
        characterId,
        "bard",
        { str: 0, dex: 1, int: 1, wis: -1, cha: 2 },
        {
          advancements: "stat-cha-2,stat-int-3,path-bard-diplomat",
          ownedPaths: "barbarian-berserker,bard-diplomat",
          multiclassPaths: "barbarian-berserker",
          ownedPathMoves: "",
        },
      ),
    ).toBe(true);
    expect(getCharacter(campaign, characterId)).toMatchObject({
      data: {
        classId: "bard",
        level: 5,
        xp: 3,
        treasureBoxes: 7,
        advancements: "stat-cha-2,stat-int-3,path-bard-diplomat",
        ownedPaths: "barbarian-berserker,bard-diplomat",
        multiclassPaths: "barbarian-berserker",
      },
      scores: { str: 0, dex: 1, int: 1, wis: -1, cha: 2 },
      resources: { hp: 6 },
    });
    expect(derive(getCharacter(campaign, characterId)!, systemOf(campaign)).values.maxHp).toBe(12);
    campaign.destroy();
  });

  it("reveals a dropped DW2 Struggle with its starting track, one at a time", async () => {
    const campaign = await Campaign.open(
      await createCampaign("Struggle reveal", "Gwen", "dungeon-world-2"),
    );
    const characterId = newCharacter(campaign, "Ayla", "barbarian");

    expect(revealStruggle(campaign, characterId, "reformed")).toBe(true);
    expect(getCharacter(campaign, characterId)?.data).toMatchObject({
      struggleRevealed: true,
      struggleId: "reformed",
      struggleName: "Reformed",
      struggleTrack: "Guilt",
      struggleProgress: 2,
      struggleMax: 3,
    });
    expect(revealStruggle(campaign, characterId, "vengeful")).toBe(false);
    expect(getCharacter(campaign, characterId)?.data.struggleId).toBe("reformed");
    campaign.destroy();
  });

  it("resolves a DW2 Struggle with a bonus level-up while preserving XP", async () => {
    const campaign = await Campaign.open(
      await createCampaign("Struggle resolution", "Gwen", "dungeon-world-2"),
    );
    const characterId = newCharacter(campaign, "Ayla", "barbarian");
    campaign.doc.transact(() => {
      setData(campaign, characterId, "level", 4);
      setData(campaign, characterId, "xp", 2);
      setData(campaign, characterId, "advancements", "stat-str,reveal-struggle-reformed");
      setData(campaign, characterId, "struggleRevealed", true);
      setData(campaign, characterId, "struggleId", "reformed");
      setData(campaign, characterId, "struggleName", "Reformed");
      setData(campaign, characterId, "struggleTrack", "Guilt");
      setData(campaign, characterId, "struggleProgress", 2);
      setData(campaign, characterId, "struggleMax", 3);
      (campaign.characters.get(characterId)!.get("resources") as Y.Map<number>).set("hp", 4);
    });

    expect(resolveStruggle(campaign, characterId)).toBe(true);
    expect(getCharacter(campaign, characterId)).toMatchObject({
      data: {
        level: 5,
        xp: 2,
        advancements: "stat-str",
        struggleRevealed: false,
        struggleId: "",
        struggleProgress: 0,
      },
      resources: { hp: 5 },
    });
    campaign.destroy();
  });
});
