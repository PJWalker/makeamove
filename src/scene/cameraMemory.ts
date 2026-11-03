import type { Camera } from "./camera";
import { getStorageJson, setStorageJson } from "../platform/localStorage";

const cameraKey = (sceneId: string) => `mam:camera:${sceneId}`;

export function readSceneCamera(sceneId: string): Camera | null {
  const saved = getStorageJson<Camera | null>(cameraKey(sceneId), null);
  return saved && typeof saved.zoom === "number" ? saved : null;
}

export function saveSceneCamera(sceneId: string, camera: Camera) {
  setStorageJson(cameraKey(sceneId), camera);
}
