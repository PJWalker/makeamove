// eslint-disable-next-line import/no-unassigned-import -- Campaigns need IndexedDB, which Node lacks.
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vite-plus/test";

import { Campaign, createCampaign } from "../../../campaign/campaign";
import { newCharacter, newNpc } from "../../../features/characters/api";
import { store } from "../../../lib/store";
import { device } from "../../../platform/device";
import type { TokenElement } from "../../../scene/types";
import { CampaignContext } from "../../campaignContext";
import type { CanvasCommands } from "../../canvasState";
import { tableCommands } from "../all";
import { complete, entities, readSentence, sentenceActions } from "../sentence";

/*
 * Sentences in the palette, as Paul asked for them: who does what to whom,
 * with whatever isn't said taken from the selection, the hovered token and
 * the acting character. How names fill slots is proved (slots.ts); this
 * checks the reading of real names against the real commands.
 */

const token = (id: string, name: string, characterId?: string): TokenElement => ({
  id,
  type: "token",
  name,
  colour: "#888888",
  ...(characterId ? { characterId } : {}),
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rot: 0,
  layer: "token",
  z: "a0",
  locked: false,
  createdBy: "gm",
});

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  const campaign = await Campaign.open(await createCampaign("Sentences", "Gwen", "dungeon-world"));
  const context = await CampaignContext.open(campaign, () => tableCommands);
  const ogre = newNpc(campaign, "Ogre");
  // Made last, so she's the one acting.
  const mira = newCharacter(campaign, "Mira", "fighter");
  const elements = [
    token("t-mira", "Mira", mira),
    token("t-ogre", "Ogre", ogre),
    token("g1", "Goblin"),
    token("g2", "Goblin"),
  ];
  const selection = store<string[]>([]);
  const hoveredToken = store<string | null>(null);
  // Only what sentences read of the open scene; the real one needs a canvas.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  context.canvas.canvasCommands.value = {
    sceneId: "s1",
    scene: { get: (id: string) => elements.find((e) => e.id === id) },
    controller: {
      allElements: (): readonly TokenElement[] => elements,
      element: (id: string) => elements.find((e) => e.id === id) ?? null,
      selection,
      hoveredToken,
    },
  } as CanvasCommands;
  const say = (text: string) =>
    sentenceActions(context, readSentence(text, entities(context)), entities(context));
  return { campaign, context, mira, ogre, selection, hoveredToken, say };
}

let open: Campaign | undefined;
afterEach(() => {
  open?.destroy();
  open = undefined;
});

const hackAndSlash = (actions: ReturnType<Awaited<ReturnType<typeof setUp>>["say"]>) =>
  actions.find((a) => a.title === "Hack and Slash");

it("reads subject, verb and object: Mira hack and slash goblin", async () => {
  const t = await setUp();
  open = t.campaign;
  const a = hackAndSlash(t.say("Mira hack and slash the goblin"));
  expect(a?.params).toMatchObject({
    characterId: t.mira,
    targets: [
      { id: "g1", name: "Goblin" },
      { id: "g2", name: "Goblin" },
    ],
  });
  expect(a?.detail).toBe("Mira → Goblin");
});

it("reads the object before the verb: selected lock, ogre open", async () => {
  const t = await setUp();
  open = t.campaign;
  t.selection.value = ["g1"];
  const lock = t.say("selected lock").find((a) => a.title === "Lock");
  expect(lock?.params).toEqual({ kind: "selection", sceneId: "s1", ids: ["g1"] });
  const opened = t.say("ogre open").find((a) => a.command.id === "character.open");
  expect(opened?.params).toEqual({ id: t.ogre });
});

it("fills unsaid slots from the acting character and the hovered token", async () => {
  const t = await setUp();
  open = t.campaign;
  t.hoveredToken.value = "t-ogre";
  const a = hackAndSlash(t.say("hack"));
  expect(a?.params).toMatchObject({ characterId: t.mira, targets: [{ id: "t-ogre" }] });
  // Nothing hovered and no names: the palette's plain list has it already.
  t.hoveredToken.value = null;
  expect(t.say("hack")).toEqual([]);
});

it("lists every verb for a name alone, so recent ones can lead", async () => {
  const t = await setUp();
  open = t.campaign;
  const titles = t.say("goblin").map((a) => a.title);
  expect(titles).toContain("Lock");
  expect(titles).toContain("Hack and Slash");
});

it("completes a name with Tab", async () => {
  const t = await setUp();
  open = t.campaign;
  const known = entities(t.context);
  const reading = readSentence("Mira hack and slash gob", known);
  expect(reading.completions.map((e) => e.name)).toEqual(["Goblin"]);
  expect(complete("Mira hack and slash gob", reading.completions[0]!)).toBe(
    "Mira hack and slash Goblin ",
  );
});

it("only makes calls that read back as ones their commands accept", async () => {
  const t = await setUp();
  open = t.campaign;
  t.selection.value = ["g1", "t-ogre"];
  t.hoveredToken.value = "g2";
  for (const text of ["", "goblin", "Mira", "me goblin", "selected", "Mira ogre", "ogre"])
    for (const a of t.say(text)) expect(t.context.commands.resolve(a.id), a.id).not.toBeNull();
});
