import * as Y from "yjs"
import { newId } from "../lib/ids"

export interface SceneFolderView {
  id: string
  name: string
}

export function listSceneFolders(
  folders: Y.Map<{ name: string }>,
): SceneFolderView[] {
  return [...folders.entries()]
    .map(([id, folder]) => ({ id, name: folder.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createSceneFolder(
  folders: Y.Map<{ name: string }>,
  name: string,
) {
  const id = newId()
  folders.set(id, { name: name.trim() || "New folder" })
  return id
}

export function renameSceneFolder(
  folders: Y.Map<{ name: string }>,
  id: string,
  name: string,
) {
  if (folders.has(id) && name.trim()) {
    folders.set(id, { name: name.trim() })
  }
}

/** Deleting a folder files its scenes back at the top level. */
export function deleteSceneFolder(
  doc: Y.Doc,
  scenes: Y.Map<Y.Map<any>>,
  folders: Y.Map<{ name: string }>,
  id: string,
) {
  doc.transact(() => {
    for (const scene of scenes.values()) {
      if (scene.get("folder") === id) scene.delete("folder")
    }
    folders.delete(id)
  })
}

export function moveSceneToFolder(
  scenes: Y.Map<Y.Map<any>>,
  sceneId: string,
  folderId?: string,
) {
  const scene = scenes.get(sceneId)
  if (!scene) return
  if (folderId) scene.set("folder", folderId)
  else scene.delete("folder")
}