import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../../store/campaign";
import { device } from "../../store/device";
import {
  createSceneFolder,
  deleteSceneFolder,
  listSceneFolders,
  moveSceneToFolder,
  renameSceneFolder,
} from "../folders";

describe("scene folders", () => {
  it("files scenes, renames folders, and returns scenes to the top level when deleting folders", async () => {
    device.value = { id: "gm", name: "GM" };
    const campaign = await Campaign.open(
      await createCampaign("Scene folders", "GM"),
    );
    const sceneId = campaign.addScene("The Keep");
    const folderId = createSceneFolder(campaign, "Places");

    moveSceneToFolder(campaign, sceneId, folderId);
    expect(
      campaign.sceneViews().find((scene) => scene.id === sceneId)?.folder,
    ).toBe(folderId);

    renameSceneFolder(campaign, folderId, "Locations");
    expect(listSceneFolders(campaign)).toEqual([
      { id: folderId, name: "Locations" },
    ]);

    deleteSceneFolder(campaign, folderId);
    expect(
      campaign.sceneViews().find((scene) => scene.id === sceneId)?.folder,
    ).toBeUndefined();
    expect(listSceneFolders(campaign)).toEqual([]);
    campaign.destroy();
  });
});
