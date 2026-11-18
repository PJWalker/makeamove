import { newId } from "../lib/ids";
import {
  folderName,
  foldersByName,
  renameFolderIn,
  UNTITLED_FOLDER,
  unfile,
  type FolderView,
} from "./folders";
import type { CampaignRoot, Scenes } from "./schema";

export type SceneFolderView = FolderView;

type SceneFolders = CampaignRoot["sceneFolders"];

export function listSceneFolders(folders: SceneFolders): SceneFolderView[] {
  return foldersByName(folders);
}

export function createSceneFolder(folders: SceneFolders, name = UNTITLED_FOLDER) {
  const id = newId();
  folders.set(id, { name: folderName(name) });
  return id;
}

export function renameSceneFolder(folders: SceneFolders, id: string, name: string) {
  renameFolderIn(folders, id, name);
}

/** Deleting a folder files its scenes back at the top level. */
export function deleteSceneFolder(scenes: Scenes, folders: SceneFolders, id: string) {
  folders.transact(() => {
    unfile(scenes.values(), id);
    folders.delete(id);
  });
}

export function moveSceneToFolder(scenes: Scenes, sceneId: string, folderId?: string) {
  scenes.get(sceneId)?.patch({ folder: folderId });
}
