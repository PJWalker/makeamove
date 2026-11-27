import { isNumber, objectOf } from "../lib/guards";
import type { Guard } from "../lib/guards";
import { getStorageJson, setStorageJson } from "../platform/localStorage";
import type { Camera } from "./camera";

const cameraKey = (sceneId: string) => `mam:camera:${sceneId}`;

const isCamera: Guard<Camera> = objectOf({ x: isNumber, y: isNumber, zoom: isNumber });

export function readSceneCamera(sceneId: string): Camera | null {
  return getStorageJson(cameraKey(sceneId), isCamera, null);
}

export function saveSceneCamera(sceneId: string, camera: Camera) {
  setStorageJson(cameraKey(sceneId), camera);
}
