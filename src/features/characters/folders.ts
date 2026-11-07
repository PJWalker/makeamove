import type { Campaign } from "../../campaign/campaign";
import { newId } from "../../lib/ids";

export interface FolderView {
  id: string;
  name: string;
}

export function listFolders(campaign: Campaign): FolderView[] {
  return [...campaign.characterFolders.entries()]
    .map(([id, f]) => ({ id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createFolder(campaign: Campaign, name: string) {
  const id = newId();
  campaign.characterFolders.set(id, { name: name.trim() || "New folder" });
  return id;
}

export function renameFolder(campaign: Campaign, id: string, name: string) {
  if (campaign.characterFolders.has(id) && name.trim())
    campaign.characterFolders.set(id, { name: name.trim() });
}

/** Deleting a folder files its characters back at the top. */
export function deleteFolder(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.characters.values()) if (m.get("folder") === id) m.delete("folder");
    campaign.characterFolders.delete(id);
  });
}

export function moveToFolder(
  campaign: Campaign,
  characterId: string,
  folderId: string | undefined,
) {
  const m = campaign.characters.get(characterId);
  if (!m) return;
  if (folderId) m.set("folder", folderId);
  else m.delete("folder");
}
