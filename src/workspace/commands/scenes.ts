import {
  createSceneFolder,
  deleteSceneFolder,
  listSceneFolders,
  moveSceneToFolder,
  renameSceneFolder,
} from "../../campaign/sceneFolders";
import type { SceneView } from "../../campaign/types";
import { isObject, isString, objectOf, optional } from "../../data/guards";
import type { Grid } from "../../scene/grid";
import type { SceneLighting } from "../../scene/sceneDoc";
import { IconAdd, IconDelete, IconFolder, IconMap, IconMembers } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { folderCommands } from "./folders";
import { command } from "./types";

/* Scenes: making them, going to them, filing and deleting them. Only the GM changes them. */

const isId = objectOf({ id: isString });
const scene = (ctx: CampaignContext, id: string) =>
  ctx.campaign.sceneViews().find((s) => s.id === id);
const exists = (ctx: CampaignContext, { id }: { id: string }) =>
  !!scene(ctx, id) || "That scene is gone";
const seen = (ctx: CampaignContext, s: SceneView) => s.visibility === "everyone" || ctx.isGm();

export const newScene = command<{ folder?: string | undefined }, string>({
  id: "scene.create",
  params: objectOf({ folder: optional(isString) }),
  title: "New Scene",
  icon: IconAdd,
  permission: "gm",
  offers: () => [{ params: {} }],
  run: ({ campaign }, { folder }) => {
    const id = campaign.addScene(`Scene ${campaign.sceneViews().length + 1}`);
    if (folder) moveSceneToFolder(campaign.scenes, id, folder);
    campaign.setActiveScene(id);
    return id;
  },
});

export const openScene = command<{ id: string }>({
  id: "scene.open",
  params: isId,
  kind: "entry",
  title: (ctx, { id }) => scene(ctx, id)?.name ?? "Scene",
  detail: (ctx, { id }) => (id === ctx.campaign.activeSceneId() ? "Current scene" : "Go to scene"),
  source: "Scenes",
  icon: IconMap,
  section: "open",
  permission: (ctx, { id }) => {
    const s = scene(ctx, id);
    return !s || seen(ctx, s) || "Hidden from players";
  },
  available: exists,
  // Going somewhere isn't an edit to take back.
  undoGroup: false,
  offers: (ctx) =>
    ctx.campaign.sceneViews().map((s) => ({ params: { id: s.id }, group: "scene" as const })),
  menu: { scene: (_, { id }) => [{ params: { id }, title: "Open Scene" }] },
  run: ({ campaign }, { id }) => campaign.setActiveScene(id),
});

export const pullPlayers = command<{ id: string }>({
  id: "scene.pullPlayers",
  params: isId,
  title: "Pull Players Here",
  icon: IconMembers,
  permission: "gm",
  available: exists,
  section: "play",
  undoGroup: false,
  menu: { scene: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => campaign.pullPlayersToScene(id),
});

export const moveScene = command<{ id: string; folder?: string | undefined }>({
  id: "scene.moveToFolder",
  params: objectOf({ id: isString, folder: optional(isString) }),
  title: "Move to Folder",
  icon: IconFolder,
  permission: "gm",
  available: exists,
  section: "file",
  menu: {
    scene: (ctx, { id }) => {
      const s = scene(ctx, id);
      const folders = listSceneFolders(ctx.campaign.sceneFolders);
      return [
        ...folders
          .filter((f) => f.id !== s?.folder)
          .map((f) => ({ params: { id, folder: f.id }, title: `Move to ${f.name}` })),
        ...(s?.folder && folders.some((f) => f.id === s.folder)
          ? [{ params: { id }, title: "Remove from Folder" }]
          : []),
      ];
    },
  },
  run: ({ campaign }, { id, folder }) => moveSceneToFolder(campaign.scenes, id, folder),
});

export const updateScene = command<{ id: string; patch: Partial<Omit<SceneView, "id">> }>({
  id: "scene.update",
  params: objectOf({ id: isString, patch: (v): v is object => typeof v === "object" && !!v }),
  title: "Change Scene",
  permission: "gm",
  available: exists,
  // Dragging through colours, or typing a name, is one step.
  undoGroup: ({ id, patch }) => `scene.update ${id} ${Object.keys(patch).sort().join()}`,
  run: ({ campaign }, { id, patch }) => campaign.updateScene(id, patch),
});

/** The open scene's grid and lighting, kept in the scene itself, so undone with its own steps. */
const sceneDocOf = (ctx: CampaignContext, id: string) => {
  const o = ctx.canvas.canvasCommands.value;
  return o?.sceneId === id ? o.scene : null;
};

export const setGrid = command<{ id: string; patch: Partial<Grid> }>({
  id: "scene.setGrid",
  params: objectOf({ id: isString, patch: isObject<Partial<Grid>> }),
  title: "Change Grid",
  permission: "gm",
  available: (ctx, { id }) => !!sceneDocOf(ctx, id) || "Open the scene first",
  transact: false,
  run: (ctx, { id, patch }) => sceneDocOf(ctx, id)?.setGrid(patch),
});

export const setLighting = command<{ id: string; patch: Partial<SceneLighting> }>({
  id: "scene.setLighting",
  params: objectOf({ id: isString, patch: isObject<Partial<SceneLighting>> }),
  title: "Change Lighting",
  permission: "gm",
  available: (ctx, { id }) => !!sceneDocOf(ctx, id) || "Open the scene first",
  transact: false,
  run: (ctx, { id, patch }) => sceneDocOf(ctx, id)?.setLighting(patch),
});

export const deleteScene = command<{ id: string }>({
  id: "scene.delete",
  params: isId,
  title: "Delete Scene…",
  icon: IconDelete,
  danger: true,
  permission: "gm",
  available: (ctx, p) =>
    ctx.campaign.sceneViews().length < 2 ? "A campaign needs a scene" : exists(ctx, p),
  section: "delete",
  // Its drawings and tokens go with it.
  undoGroup: false,
  confirm: (ctx, { id }) => {
    const name = scene(ctx, id)?.name ?? "this scene";
    return {
      title: "Delete scene",
      body: `Delete ${name}? Its maps, tokens and drawings are gone for everyone. This can’t be undone.`,
      subject: name,
      confirmLabel: "Delete",
      danger: true,
    };
  },
  menu: { scene: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => campaign.removeScene(id),
});

export const sceneFolders = folderCommands("scene", {
  permission: "gm",
  create: ({ campaign }, name) => createSceneFolder(campaign.sceneFolders, name),
  rename: ({ campaign }, id, name) => renameSceneFolder(campaign.sceneFolders, id, name),
  remove: ({ campaign }, id) => deleteSceneFolder(campaign.scenes, campaign.sceneFolders, id),
  newHere: [newScene],
});

export const sceneCommands = [
  newScene,
  openScene,
  pullPlayers,
  moveScene,
  updateScene,
  setGrid,
  setLighting,
  deleteScene,
  ...sceneFolders.all,
];
