import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Campaign } from "../../campaign/campaign";
import { campaignUiDbName as campaignUiDatabaseName } from "../../campaign/storage";
import { LocalDoc as LocalDocument } from "../../data/localDoc";
import { device } from "../../platform/device";
import { SceneDoc as SceneDocument } from "../../scene/sceneDoc";
import { TOOL_IDS } from "../../scene/tools";
import { PANEL_ORDER } from "../../workspace/layoutModel";
import { createTutorialCampaign } from "../create";
import { LIGHTING, PIECE_KEYS, PIECES } from "../dungeon";
import { goalMet, rebase } from "../goals";
import type { World } from "../goals";
import { tutorialProgress } from "../progress";
import { watchWorld } from "../watch";
import { CampaignContext } from "../../workspace/campaignContext";
import type { CanvasCommands } from "../../workspace/canvasState";
import { NOT_IN_TUTORIAL, STEPS, UI_ANCHORS } from "../steps";

/** The app's own UI source, for checking what it marks. */
const uiSource = () =>
  Object.values(
    import.meta.glob<string>(["../../**/*.tsx", "!**/__tests__/**"], {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).join("\n");

const taught = new Set(
  STEPS.flatMap((s) => s.anchors ?? []).flatMap((a): string[] => {
    if ("tool" in a) return [a.tool];
    if ("panel" in a) return [a.panel];
    return [];
  }),
);

describe("the tutorial's steps", () => {
  it("each have their own id", () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only point at parts of the UI that are marked", () => {
    const source = uiSource();
    for (const name of UI_ANCHORS) expect(source, name).toContain(`data-tutorial="${name}"`);
    // Tools and panels are found by the toolbar's and the sidebar's own marks.
    expect(source).toContain("data-tool={id}");
    expect(source).toContain("data-panel={panel ? id : undefined}");
  });

  it("only ask about pieces the dungeon has", () => {
    for (const { goal } of STEPS)
      if (goal.kind === "moved" || goal.kind === "opened")
        expect(PIECES).toHaveProperty(goal.piece);
  });

  it("teach every tool and panel, or say why not", () => {
    const untaught = [...TOOL_IDS, ...PANEL_ORDER].filter(
      (id) => !taught.has(id) && !(id in NOT_IN_TUTORIAL),
    );
    expect(untaught, "add a step to tutorial/steps.ts that points at each").toEqual([]);
  });

  it("don't list a tool or panel as untaught once a step teaches it", () => {
    expect(Object.keys(NOT_IN_TUTORIAL).filter((id) => taught.has(id))).toEqual([]);
  });
});

const world = (patch: Partial<World> = {}): World => ({
  tool: "select",
  tally: { drawing: 1, roll: 0 },
  pieces: { hero: { x: 0, y: 0, open: false }, door: { x: 5, y: 5, open: false } },
  ...patch,
});

describe("tutorial goals", () => {
  it("notice something made, or taken away, since the step began", () => {
    const before = world();
    expect(goalMet({ kind: "more", of: "drawing" }, before, world({ tally: { drawing: 2 } }))).toBe(
      true,
    );
    expect(goalMet({ kind: "more", of: "drawing" }, before, world())).toBe(false);
    expect(
      goalMet({ kind: "fewer", of: "drawing" }, before, world({ tally: { drawing: 0 } })),
    ).toBe(true);
  });

  it("don't count what isn't known yet", () => {
    const loading = world({ tally: {}, pieces: {} });
    expect(
      goalMet({ kind: "fewer", of: "drawing" }, loading, world({ tally: { drawing: 0 } })),
    ).toBe(false);
    expect(goalMet({ kind: "moved", piece: "hero" }, loading, world())).toBe(false);
  });

  it("start from the scene once it has loaded", () => {
    const before = rebase(world({ tally: { roll: 0 }, pieces: {} }), world());
    expect(
      goalMet({ kind: "fewer", of: "drawing" }, before, world({ tally: { drawing: 0 } })),
    ).toBe(true);
    const moved = world({ pieces: { hero: { x: 70, y: 0, open: false } } });
    expect(goalMet({ kind: "moved", piece: "hero" }, before, moved)).toBe(true);
  });

  it("notice a tool picked and a door opened", () => {
    expect(goalMet({ kind: "tool", tool: "pan" }, world(), world({ tool: "pan" }))).toBe(true);
    const open = world({ pieces: { door: { x: 5, y: 5, open: true } } });
    expect(goalMet({ kind: "opened", piece: "door" }, world(), open)).toBe(true);
    expect(goalMet({ kind: "read" }, world(), open)).toBe(false);
  });
});

describe("the tutorial campaign", () => {
  it("starts at the first step, in the tiny dungeon", async () => {
    device.value = { id: "gm", name: "Gwen" };
    const id = await createTutorialCampaign("Gwen");
    const campaign = await Campaign.open(id);
    const local = await LocalDocument.open(campaignUiDatabaseName(id));
    const progress = tutorialProgress(local).value!;
    expect(progress.step).toBe(STEPS[0]!.id);
    expect(campaign.isGm()).toBe(true);

    const scene = await SceneDocument.open(campaign.sceneSubdoc(progress.sceneId)!);
    for (const key of PIECE_KEYS) {
      const piece = PIECES[key];
      expect(scene.get(progress.pieces[key]!), key).toMatchObject({
        type: piece.type,
        x: piece.x,
        y: piece.y,
      });
    }
    expect(scene.lighting()).toEqual(LIGHTING);
    scene.destroy();
    local.destroy();
    campaign.destroy();
  });

  it("is watched as the player plays", async () => {
    device.value = { id: "gm", name: "Gwen" };
    const context = await CampaignContext.open(
      await Campaign.open(await createTutorialCampaign("Gwen")),
    );
    const progress = context.tutorial.value!;
    const scene = await SceneDocument.open(context.campaign.sceneSubdoc(progress.sceneId)!);
    const seen: World[] = [];
    const stop = watchWorld(context, progress, (w) => seen.push(w));
    expect(seen.at(-1)!.pieces).toEqual({});

    context.canvas.canvasCommands.set({ sceneId: progress.sceneId, scene } as CanvasCommands);
    expect(seen.at(-1)!.tally).toMatchObject({ drawing: 0, token: 3, light: 1 });
    scene.update([[progress.pieces.hero!, { x: 0 }]]);
    expect(seen.at(-1)!.pieces.hero).toMatchObject({ x: 0 });
    context.tools.activeTool.set("pan");
    expect(seen.at(-1)!.tool).toBe("pan");

    stop();
    scene.destroy();
    context.dispose();
  });
});
