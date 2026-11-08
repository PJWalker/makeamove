import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { newId } from "../lib/ids";
import { sceneDbName } from "../scene/sceneDoc";
import type { SceneView } from "./types";

export const sceneGuid = (campaignId: string, sceneId: string) => `${campaignId}/${sceneId}`;

export function sceneViews(scenes: Y.Map<Y.Map<unknown>>): SceneView[] {
  return [...scenes.entries()]
    .map(([id, scene]): SceneView => {
      const folder = scene.get("folder") as string | undefined;
      return {
        id,
        name: (scene.get("name") as string | undefined) ?? "Untitled scene",
        ...(folder !== undefined && { folder }),
        canvasColour: (scene.get("canvasColour") as string | undefined) ?? null,
        order: (scene.get("order") as string | undefined) ?? "a0",
        visibility: (scene.get("visibility") as SceneView["visibility"] | undefined) ?? "everyone",
      };
    })
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}

export function createScene(
  campaignId: string,
  scenes: Y.Map<Y.Map<unknown>>,
  name: string,
): string {
  const id = newId();
  const views = sceneViews(scenes);
  const last = views.length ? views[views.length - 1]!.order : null;
  const scene = new Y.Map<unknown>();
  scene.set("name", name);
  scene.set("order", generateKeyBetween(last, null));
  scene.set("visibility", "everyone");
  scene.set("doc", new Y.Doc({ guid: sceneGuid(campaignId, id) }));
  scenes.set(id, scene);
  return id;
}

export function sceneSubdoc(
  campaignId: string,
  scenes: Y.Map<Y.Map<unknown>>,
  id: string,
): Y.Doc | null {
  const scene = scenes.get(id);
  if (!scene) return null;
  const doc = scene.get("doc");
  if (doc instanceof Y.Doc) return doc;
  const created = new Y.Doc({ guid: sceneGuid(campaignId, id) });
  scene.set("doc", created);
  return created;
}

export function updateScene(
  doc: Y.Doc,
  scenes: Y.Map<Y.Map<unknown>>,
  id: string,
  patch: Partial<Omit<SceneView, "id">>,
) {
  const scene = scenes.get(id);
  if (!scene) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) scene.delete(key);
      else scene.set(key, value);
    }
  });
}

export function removeScene(campaignId: string, scenes: Y.Map<Y.Map<unknown>>, id: string) {
  scenes.delete(id);
  indexedDB.deleteDatabase(sceneDbName(sceneGuid(campaignId, id)));
}

export function activeSceneId(
  members: Y.Map<Y.Map<unknown>>,
  scenes: Y.Map<Y.Map<unknown>>,
  deviceId: string,
): string | null {
  const mine = members.get(deviceId)?.get("activeSceneId") as string | undefined;
  if (mine && scenes.has(mine)) return mine;
  return sceneViews(scenes)[0]?.id ?? null;
}
