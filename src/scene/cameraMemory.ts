import type { Camera } from "./camera";
import { isNumber, objectOf, type Guard } from "../lib/guards";
import { getStorageJson, setStorageJson } from "../platform/localStorage";

const cameraKey = (sceneId: string) => `mam:camera:${sceneId}`;

const isCamera: Guard<Camera> = objectOf({ x: isNumber, y: isNumber, zoom: isNumber });

export function readSceneCamera(sceneId: string): Camera | null {
  return getStorageJson(cameraKey(sceneId), isCamera, null);
}

export function saveSceneCamera(sceneId: string, camera: Camera) {
  setStorageJson(cameraKey(sceneId), camera);
}
