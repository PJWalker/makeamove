import { watch } from "../lib/store";
import type { SceneDoc as SceneDocument } from "../scene/sceneDoc";
import type { SceneElement } from "../scene/types";
import type { CampaignContext } from "../workspace/campaignContext";
import { PIECE_KEYS } from "./dungeon";
import type { PieceKey } from "./dungeon";
import type { PieceState, Tally, World } from "./goals";
import type { TutorialProgress } from "./progress";

/** A count of each kind of element, all at nought. */
const NO_ELEMENTS: Record<SceneElement["type"], number> = {
  map: 0,
  token: 0,
  drawing: 0,
  shape: 0,
  text: 0,
  wall: 0,
  light: 0,
  area: 0,
  effect: 0,
  pin: 0,
  fog: 0,
};

/** The tutorial's scene, if it's the one open on the canvas. */
function tutorialScene(context: CampaignContext, progress: TutorialProgress): SceneDocument | null {
  const open = context.canvas.canvasCommands.value;
  return open?.sceneId === progress.sceneId ? open.scene : null;
}

/** The table as the tutorial sees it now (goals.ts). */
export function worldOf(context: CampaignContext, progress: TutorialProgress): World {
  const { campaign } = context;
  const tally: Partial<Record<Tally, number>> = {
    note: campaign.notes.size,
    message: 0,
    roll: 0,
  };
  for (const m of campaign.chat.messages.value) {
    if (m.kind === "text") tally.message!++;
    if (m.kind === "roll") tally.roll!++;
  }
  const pieces: Partial<Record<PieceKey, PieceState>> = {};
  const scene = tutorialScene(context, progress);
  if (scene) {
    const elements = { ...NO_ELEMENTS };
    for (const element of scene.views()) elements[element.type]++;
    Object.assign(tally, elements);
    for (const key of PIECE_KEYS) {
      const id = progress.pieces[key];
      const element = id === undefined ? null : scene.get(id);
      if (element)
        pieces[key] = {
          x: element.x,
          y: element.y,
          locked: element.locked,
          open: element.type === "wall" && element.open === true,
        };
    }
  }
  return { tool: context.tools.activeTool.value, tally, pieces };
}

/** Call `onChange` with the world now, and again whenever anything a goal looks at changes. */
export function watchWorld(
  context: CampaignContext,
  progress: TutorialProgress,
  onChange: (world: World) => void,
): () => void {
  const update = () => {
    onChange(worldOf(context, progress));
  };
  let stopScene: (() => void) | undefined;
  const stopCanvas = watch([context.canvas.canvasCommands], () => {
    stopScene?.();
    stopScene = tutorialScene(context, progress)?.elements.observe(update);
    update();
  });
  const stopStores = watch([context.tools.activeTool, context.campaign.chat.messages], update);
  const stopNotes = context.campaign.notes.observe(update);
  return () => {
    stopCanvas();
    stopScene?.();
    stopStores();
    stopNotes();
  };
}
