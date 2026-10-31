import type { Camera } from "./camera";

const cameraKey = (sceneId: string) => `mam:camera:${sceneId}`;

export function readSceneCamera(sceneId: string): Camera | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(cameraKey(sceneId)) ?? "null",
    );
    return saved && typeof saved.zoom === "number" ? saved : null;
  } catch {
    return null;
  }
}

export function saveSceneCamera(sceneId: string, camera: Camera) {
  try {
    localStorage.setItem(cameraKey(sceneId), JSON.stringify(camera));
  } catch {
    // The view just won't be remembered.
  }
}
