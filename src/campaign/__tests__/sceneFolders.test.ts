import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Campaign, createCampaign } from "../campaign";
import { device } from "../../platform/device";
import {
  createSceneFolder,
  deleteSceneFolder,
  listSceneFolders,
  moveSceneToFolder,
  renameSceneFolder,
} from "../sceneFolders";

describe("scene folders", () => {
  it("files scenes, renames folders, and returns scenes to the top level when deleting folders", async () => {
    device.value = { id: "gm", name: "GM" };
    const campaign = await Campaign.open(await createCampaign("Scene folders", "GM"));
    const sceneId = campaign.addScene("The Keep");
    const folderId = createSceneFolder(campaign.sceneFolders, "Places");

    moveSceneToFolder(campaign.scenes, sceneId, folderId);
    expect(campaign.sceneViews().find((scene) => scene.id === sceneId)?.folder).toBe(folderId);

    renameSceneFolder(campaign.sceneFolders, folderId, "Locations");
    expect(listSceneFolders(campaign.sceneFolders)).toEqual([{ id: folderId, name: "Locations" }]);

    deleteSceneFolder(campaign.scenes, campaign.sceneFolders, folderId);
    expect(campaign.sceneViews().find((scene) => scene.id === sceneId)?.folder).toBeUndefined();
    expect(listSceneFolders(campaign.sceneFolders)).toEqual([]);
    campaign.destroy();
  });
});
