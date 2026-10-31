import { newId } from "../lib/ids";
import type { Campaign } from "../store/campaign";

export interface SceneFolderView {
  id: string;
  name: string;
}

export function listSceneFolders(campaign: Campaign): SceneFolderView[] {
  return [...campaign.sceneFolders.entries()]
    .map(([id, folder]) => ({ id, name: folder.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createSceneFolder(campaign: Campaign, name: string) {
  const id = newId();
  campaign.sceneFolders.set(id, { name: name.trim() || "New folder" });
  return id;
}

export function renameSceneFolder(
  campaign: Campaign,
  id: string,
  name: string,
) {
  if (campaign.sceneFolders.has(id) && name.trim()) {
    campaign.sceneFolders.set(id, { name: name.trim() });
  }
}

/** Deleting a folder files its scenes back at the top level. */
export function deleteSceneFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const scene of campaign.scenes.values()) {
      if (scene.get("folder") === id) scene.delete("folder");
    }
    campaign.sceneFolders.delete(id);
  });
}

export function moveSceneToFolder(
  campaign: Campaign,
  sceneId: string,
  folderId?: string,
) {
  const scene = campaign.scenes.get(sceneId);
  if (!scene) return;
  if (folderId) scene.set("folder", folderId);
  else scene.delete("folder");
}
