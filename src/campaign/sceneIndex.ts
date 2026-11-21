import { generateKeyBetween } from "fractional-indexing";
import type * as Y from "yjs";
import { newId } from "../lib/ids";
import { byOrder } from "../lib/order";
import { sceneDbName } from "../scene/sceneDoc";
import type { Members, Scenes } from "./schema";
import type { SceneView } from "./types";
import { deleteData } from "../platform/dataEpoch";

export const sceneGuid = (campaignId: string, sceneId: string) => `${campaignId}/${sceneId}`;

export function sceneViews(scenes: Scenes): SceneView[] {
  return scenes
    .entries()
    .map(([id, scene]): SceneView => {
      const folder = scene.get("folder");
      return {
        id,
        name: scene.get("name"),
        ...(folder !== undefined && { folder }),
        canvasColour: scene.get("canvasColour") ?? null,
        order: scene.get("order"),
        visibility: scene.get("visibility"),
      };
    })
    .sort(byOrder);
}

export function createScene(campaignId: string, scenes: Scenes, name: string): string {
  const id = newId();
  const last = sceneViews(scenes).at(-1)?.order ?? null;
  scenes.transact(() => {
    scenes.set(id, { name, order: generateKeyBetween(last, null), visibility: "everyone" });
    scenes.get(id)!.subdoc("doc", sceneGuid(campaignId, id));
  });
  return id;
}

/** The scene's subdocument (not yet loaded), made if it has none. */
export function sceneSubdoc(campaignId: string, scenes: Scenes, id: string): Y.Doc | null {
  return scenes.get(id)?.subdoc("doc", sceneGuid(campaignId, id)) ?? null;
}

export function updateScene(scenes: Scenes, id: string, patch: Partial<Omit<SceneView, "id">>) {
  const { canvasColour, ...rest } = patch;
  scenes.get(id)?.patch({
    ...rest,
    ...(canvasColour !== undefined && { canvasColour: canvasColour ?? undefined }),
  });
}

export function removeScene(campaignId: string, scenes: Scenes, id: string) {
  scenes.delete(id);
  deleteData(sceneDbName(sceneGuid(campaignId, id)));
}

export function activeSceneId(members: Members, scenes: Scenes, deviceId: string): string | null {
  const mine = members.get(deviceId)?.get("activeSceneId");
  if (mine && scenes.has(mine)) return mine;
  return sceneViews(scenes)[0]?.id ?? null;
}
