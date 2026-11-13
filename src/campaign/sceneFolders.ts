import { newId } from "../lib/ids";
import { UNTITLED_FOLDER } from "./folders";
import type { CampaignRoot, Scenes } from "./schema";

export interface SceneFolderView {
  id: string;
  name: string;
}

type SceneFolders = CampaignRoot["sceneFolders"];

export function listSceneFolders(folders: SceneFolders): SceneFolderView[] {
  return folders
    .entries()
    .map(([id, folder]) => ({ id, name: folder.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createSceneFolder(folders: SceneFolders, name = UNTITLED_FOLDER) {
  const id = newId();
  folders.set(id, { name: name.trim() || UNTITLED_FOLDER });
  return id;
}

export function renameSceneFolder(folders: SceneFolders, id: string, name: string) {
  if (folders.has(id) && name.trim()) {
    folders.set(id, { name: name.trim() });
  }
}

/** Deleting a folder files its scenes back at the top level. */
export function deleteSceneFolder(scenes: Scenes, folders: SceneFolders, id: string) {
  folders.transact(() => {
    for (const scene of scenes.values()) if (scene.get("folder") === id) scene.delete("folder");
    folders.delete(id);
  });
}

export function moveSceneToFolder(scenes: Scenes, sceneId: string, folderId?: string) {
  scenes.get(sceneId)?.patch({ folder: folderId });
}
