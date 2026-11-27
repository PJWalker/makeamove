import { Campaign, createCampaign } from "../campaign/campaign";
import { campaignUiDbName as campaignUiDatabaseName } from "../campaign/storage";
import { LocalDoc as LocalDocument } from "../data/localDoc";
import { SceneDoc as SceneDocument } from "../scene/sceneDoc";
import { NO_SYSTEM_ID } from "../systems";
import { DECOR, LIGHTING, PIECE_KEYS, PIECES } from "./dungeon";
import { tutorialProgress } from "./progress";
import { STEPS } from "./steps";

export const TUTORIAL_NAME = "Tutorial: A Tiny Dungeon";
const SCENE_NAME = "The Tiny Dungeon";

/**
 * Make a campaign to learn the table in: the tiny dungeon as its one scene,
 * with this device's tutorial progress at the first step. It plays without a
 * system, so it teaches what every campaign has. Returns its id.
 */
export async function createTutorialCampaign(gmName: string): Promise<string> {
  const id = await createCampaign(TUTORIAL_NAME, gmName, NO_SYSTEM_ID);
  const campaign = await Campaign.open(id);
  try {
    const sceneId = campaign.activeSceneId()!;
    campaign.updateScene(sceneId, { name: SCENE_NAME });
    const scene = await SceneDocument.open(campaign.sceneSubdoc(sceneId)!);
    scene.add(...DECOR);
    const ids = scene.add(...PIECE_KEYS.map((k) => PIECES[k]));
    scene.setLighting(LIGHTING);
    scene.destroy();

    const local = await LocalDocument.open(campaignUiDatabaseName(id));
    tutorialProgress(local).set({
      step: STEPS[0]!.id,
      sceneId,
      pieces: Object.fromEntries(PIECE_KEYS.map((k, index) => [k, ids[index]!])),
    });
    local.destroy();
  } finally {
    campaign.destroy();
  }
  return id;
}
