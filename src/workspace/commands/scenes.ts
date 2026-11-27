import {
  createSceneFolder,
  deleteSceneFolder,
  listSceneFolders,
  moveSceneToFolder,
  renameSceneFolder,
} from "../../campaign/sceneFolders";
import type { SceneView } from "../../campaign/types";
import { isObject, isString, objectOf, optional } from "../../lib/guards";
import type { Grid } from "../../scene/grid";
import type { SceneLighting } from "../../scene/sceneDoc";
import { IconAdd, IconDelete, IconFolder, IconMap, IconMembers } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { folderCommands, moveFolderOffers } from "./folders";
import { command } from "./types";

/* Scenes: making them, going to them, filing and deleting them. Only the GM changes them. */

const isId = objectOf({ id: isString });
const scene = (context: CampaignContext, id: string) =>
  context.campaign.sceneViews().find((s) => s.id === id);
const exists = (context: CampaignContext, { id }: { id: string }) =>
  !!scene(context, id) || "That scene is gone";
const seen = (context: CampaignContext, s: SceneView) =>
  s.visibility === "everyone" || context.isGm();

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
  title: (context, { id }) => scene(context, id)?.name ?? "Scene",
  detail: (context, { id }) =>
    id === context.campaign.activeSceneId() ? "Current scene" : "Go to scene",
  source: "Scenes",
  icon: IconMap,
  section: "open",
  permission: (context, { id }) => {
    const s = scene(context, id);
    return !s || seen(context, s) || "Hidden from players";
  },
  available: exists,
  // Going somewhere isn't an edit to take back.
  undoGroup: false,
  offers: (context) =>
    context.campaign.sceneViews().map((s) => ({ params: { id: s.id }, group: "scene" as const })),
  menu: { scene: (_, { id }) => [{ params: { id }, title: "Open Scene" }] },
  run: ({ campaign }, { id }) => {
    campaign.setActiveScene(id);
  },
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
  run: ({ campaign }, { id }) => {
    campaign.pullPlayersToScene(id);
  },
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
    scene: (context, { id }) =>
      moveFolderOffers(
        id,
        scene(context, id)?.folder,
        listSceneFolders(context.campaign.sceneFolders),
      ),
  },
  run: ({ campaign }, { id, folder }) => {
    moveSceneToFolder(campaign.scenes, id, folder);
  },
});

export const updateScene = command<{ id: string; patch: Partial<Omit<SceneView, "id">> }>({
  id: "scene.update",
  params: objectOf({ id: isString, patch: (v): v is object => typeof v === "object" && !!v }),
  title: "Change Scene",
  permission: "gm",
  available: exists,
  // Dragging through colours, or typing a name, is one step.
  undoGroup: ({ id, patch }) => `scene.update ${id} ${Object.keys(patch).sort().join(",")}`,
  run: ({ campaign }, { id, patch }) => {
    campaign.updateScene(id, patch);
  },
});

/** The open scene's grid and lighting, kept in the scene itself, so undone with its own steps. */
const sceneDocumentOf = (context: CampaignContext, id: string) => {
  const o = context.canvas.canvasCommands.value;
  return o?.sceneId === id ? o.scene : null;
};
const sceneOpen = (context: CampaignContext, { id }: { id: string }) =>
  !!sceneDocumentOf(context, id) || "Open the scene first";

export const setGrid = command<{ id: string; patch: Partial<Grid> }>({
  id: "scene.setGrid",
  params: objectOf({ id: isString, patch: isObject<Partial<Grid>> }),
  title: "Change Grid",
  permission: "gm",
  available: sceneOpen,
  transact: false,
  run: (context, { id, patch }) => sceneDocumentOf(context, id)?.setGrid(patch),
});

export const setLighting = command<{ id: string; patch: Partial<SceneLighting> }>({
  id: "scene.setLighting",
  params: objectOf({ id: isString, patch: isObject<Partial<SceneLighting>> }),
  title: "Change Lighting",
  permission: "gm",
  available: sceneOpen,
  transact: false,
  run: (context, { id, patch }) => sceneDocumentOf(context, id)?.setLighting(patch),
});

export const forgetExplored = command<{ id: string }>({
  id: "scene.forgetExplored",
  params: isId,
  title: "Cover Explored Areas in Fog…",
  permission: "gm",
  available: (context, p) =>
    sceneOpen(context, p) === true && !sceneDocumentOf(context, p.id)?.exploredSights().length
      ? "Nothing explored yet"
      : sceneOpen(context, p),
  // What characters have seen isn't undoable, so neither is forgetting it.
  undoGroup: false,
  transact: false,
  confirm: () => ({
    title: "Cover Explored Areas",
    body: "Forget what characters have seen here, covering it in fog again for every player? Shapes you’ve revealed stay revealed. This can’t be undone.",
    confirmLabel: "Cover in Fog",
    danger: true,
  }),
  run: (context, { id }) => sceneDocumentOf(context, id)?.forgetExplored(),
});

export const deleteScene = command<{ id: string }>({
  id: "scene.delete",
  params: isId,
  title: "Delete Scene…",
  icon: IconDelete,
  danger: true,
  permission: "gm",
  available: (context, p) =>
    context.campaign.sceneViews().length < 2 ? "A campaign needs a scene" : exists(context, p),
  section: "delete",
  // Its drawings and tokens go with it.
  undoGroup: false,
  confirm: (context, { id }) => {
    const name = scene(context, id)?.name ?? "this scene";
    return {
      title: "Delete Scene",
      body: `Delete ${name}? Its maps, tokens and drawings are gone for everyone. This can’t be undone.`,
      subject: name,
      confirmLabel: "Delete",
      danger: true,
    };
  },
  menu: { scene: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => {
    campaign.removeScene(id);
  },
});

export const sceneFolders = folderCommands("scene", {
  permission: "gm",
  create: ({ campaign }, name) => createSceneFolder(campaign.sceneFolders, name),
  rename: ({ campaign }, id, name) => {
    renameSceneFolder(campaign.sceneFolders, id, name);
  },
  remove: ({ campaign }, id) => {
    deleteSceneFolder(campaign.scenes, campaign.sceneFolders, id);
  },
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
  forgetExplored,
  deleteScene,
  ...sceneFolders.all,
];
