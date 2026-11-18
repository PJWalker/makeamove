import type { Campaign } from "../../campaign/campaign";
import { newId } from "../../lib/ids";
import {
  folderName,
  foldersByName,
  renameFolderIn,
  UNTITLED_FOLDER,
  unfile,
  type FolderView,
} from "../../campaign/folders";

export type { FolderView };

export function listFolders(campaign: Campaign): FolderView[] {
  return foldersByName(campaign.characterFolders);
}

export function createFolder(campaign: Campaign, name = UNTITLED_FOLDER) {
  const id = newId();
  campaign.characterFolders.set(id, { name: folderName(name) });
  return id;
}

export function renameFolder(campaign: Campaign, id: string, name: string) {
  renameFolderIn(campaign.characterFolders, id, name);
}

/** Deleting a folder files its characters back at the top. */
export function deleteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    unfile(campaign.characters.values(), id);
    campaign.characterFolders.delete(id);
  });
}

export function moveToFolder(
  campaign: Campaign,
  characterId: string,
  folderId: string | undefined,
) {
  campaign.characters.get(characterId)?.patch({ folder: folderId });
}
