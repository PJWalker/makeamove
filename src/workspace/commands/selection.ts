import { arrayOf, isObject, isString, objectOf } from "../../lib/guards";
import type { Guard } from "../../lib/guards";
import type { SceneElement } from "../../scene/types";
import {
  IconAdd,
  IconDelete,
  IconDuplicate,
  IconGrid,
  IconImage,
  IconLock,
  IconMap,
  IconRename,
  IconToBack,
  IconToFront,
  IconToken,
  IconUnlock,
  IconWall,
} from "../../ui/icons";
import type { Icon } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command } from "./types";
import type { CommandTargets, Offer } from "./types";

/*
 * What can be done with what's selected on the open scene, and with an
 * empty place on it: its context menu, and the canvas's own shortcuts. A
 * call names its scene and elements; from a shortcut, it takes the open
 * scene's selection.
 */

type Selection = CommandTargets["selection"];
const isSelection = objectOf({ sceneId: isString, ids: arrayOf(isString) });
/** A selection, or none for whatever is selected now. */
const isSelectionOrNow: Guard<Selection | undefined> = (v): v is Selection | undefined =>
  v === undefined || isSelection(v);

const open = (context: CampaignContext, sceneId?: string) => {
  const o = context.canvas.canvasCommands.value;
  return o && (!sceneId || o.sceneId === sceneId) ? o : null;
};

/** The elements a call is about, as they are now. */
function chosen(context: CampaignContext, p: Selection | undefined): SceneElement[] {
  const o = open(context, p?.sceneId);
  if (!o) return [];
  const ids = p?.ids ?? o.controller.selection.value;
  return ids.flatMap((id) => o.scene.get(id) ?? []);
}

/**
 * A change to the selected elements. `available` says whether it applies to
 * them; `offered` whether their menu lists it (by default, whenever it applies).
 */
const selectionCommand = (
  id: string,
  look: { title: string; icon: Icon; keys?: string[]; danger?: boolean },
  section: "arrange" | "delete" | "edit",
  edit: (context: CampaignContext, ids: string[]) => void,
  {
    available,
    offered,
  }: {
    available?: (els: SceneElement[]) => string | true;
    offered?: (els: SceneElement[]) => boolean;
  } = {},
) =>
  command<Selection | undefined>({
    id,
    params: isSelectionOrNow,
    ...look,
    section,
    transact: false,
    available: (context, p) => {
      const els = chosen(context, p);
      return els.length === 0 ? "Nothing selected" : (available?.(els) ?? true);
    },
    menu: {
      selection: (context, t): Offer<Selection | undefined>[] =>
        !offered || offered(chosen(context, t)) ? [{ params: t }] : [],
    },
    run: (context, p) => {
      const ids = chosen(context, p).map((element) => element.id);
      if (ids.length > 0) edit(context, ids);
    },
  });

// The scene keeps its own undo steps (scene/sceneDoc.ts), in the player's history all the same.

export const bringToFront = selectionCommand(
  "selection.toFront",
  { title: "Bring to Front", icon: IconToFront },
  "arrange",
  (context, ids) => open(context)?.controller.restack(ids, "front"),
);

export const sendToBack = selectionCommand(
  "selection.toBack",
  { title: "Send to Back", icon: IconToBack },
  "arrange",
  (context, ids) => open(context)?.controller.restack(ids, "back"),
);

export const duplicate = selectionCommand(
  "selection.duplicate",
  { title: "Duplicate", icon: IconDuplicate, keys: ["Mod+D"] },
  "edit",
  (context, ids) => open(context)?.controller.duplicate(ids),
);

export const lock = selectionCommand(
  "selection.lock",
  { title: "Lock", icon: IconLock },
  "edit",
  (context, ids) => open(context)?.controller.setLocked(ids, true),
  {
    available: (els) => !els.every((element) => element.locked) || "Already locked",
    // Lock and Unlock share a place in the menu: only the one that applies.
    offered: (els) => !els.every((element) => element.locked),
  },
);

export const unlock = selectionCommand(
  "selection.unlock",
  { title: "Unlock", icon: IconUnlock },
  "edit",
  (context, ids) => open(context)?.controller.setLocked(ids, false),
  {
    available: (els) => els.some((element) => element.locked) || "Not locked",
    offered: (els) => els.every((element) => element.locked),
  },
);

export const deleteSelection = selectionCommand(
  "selection.delete",
  { title: "Delete", icon: IconDelete, keys: ["Delete", "Backspace"], danger: true },
  "delete",
  (context, ids) => open(context)?.controller.remove(ids),
  { available: (els) => !els.every((element) => element.locked) || "Locked" },
);

/** The one selected element, if just one is selected and it `fits`. */
const one = (
  context: CampaignContext,
  p: Selection | undefined,
  fits: (element: SceneElement) => boolean,
) => {
  const els = chosen(context, p);
  return els.length === 1 && fits(els[0]!) ? els[0]! : null;
};

/** Something done with one selected element of a kind; its menu lists it only for that. */
const oneElementCommand = (
  id: string,
  look: { title: string; icon: Icon },
  section: "act" | "open",
  fits: (element: SceneElement) => boolean,
  unfit: string,
  act: (context: CampaignContext, id: string) => void,
) =>
  command<Selection | undefined>({
    id,
    params: isSelectionOrNow,
    ...look,
    section,
    transact: false,
    available: (context, p) => !!one(context, p, fits) || unfit,
    menu: { selection: (context, t) => (one(context, t, fits) ? [{ params: t }] : []) },
    run: (context, p) => {
      const element = one(context, p, fits);
      if (element) act(context, element.id);
    },
  });

export const tokenOptions = oneElementCommand(
  "token.options",
  { title: "Token Options…", icon: IconRename },
  "open",
  (element) => element.type === "token",
  "Select one token",
  (context, id) => open(context)?.tokenOptions(id, "token"),
);

export const alignMapToGrid = command<Selection | undefined>({
  id: "map.alignToGrid",
  params: isSelectionOrNow,
  title: "Align to Grid…",
  icon: IconGrid,
  section: "act",
  transact: false,
  available: (context, p) => {
    const map = one(context, p, (element) => element.type === "map");
    if (!map) return "Select one map";
    if (map.locked) return "Locked";
    return open(context)?.controller.renderer.grid.type !== "none" || "The scene has no grid";
  },
  menu: {
    selection: (context, t) =>
      one(context, t, (element) => element.type === "map") ? [{ params: t }] : [],
  },
  run: (context, p) => {
    const map = one(context, p, (element) => element.type === "map");
    if (map) open(context)?.controller.alignMap(map.id);
  },
});

export const useAsToken = oneElementCommand(
  "map.useAsToken",
  { title: "Use as Token", icon: IconToken },
  "act",
  (element) => element.type === "map",
  "Select one map",
  (context, id) => open(context)?.controller.convert(id, "token"),
);

export const detectWalls = command<Selection | undefined>({
  id: "map.detectWalls",
  params: isSelectionOrNow,
  title: "Detect Walls…",
  icon: IconWall,
  section: "act",
  transact: false,
  available: (context, p) => {
    if (!one(context, p, (element) => element.type === "map")) return "Select one map";
    return Boolean(open(context)?.controller.gm) || "Only the GM places walls";
  },
  menu: {
    selection: (context, t) =>
      one(context, t, (element) => element.type === "map") && open(context)?.controller.gm
        ? [{ params: t }]
        : [],
  },
  run: (context, p) => {
    const map = one(context, p, (element) => element.type === "map");
    if (map) open(context)?.controller.detectWalls(map.id);
  },
});

export const useAsMap = oneElementCommand(
  "token.useAsMap",
  { title: "Use as Map", icon: IconMap },
  "act",
  (element) => element.type === "token" && !!element.image,
  "Select one token with an image",
  (context, id) => open(context)?.controller.convert(id, "map"),
);

// An empty place on the scene

type Place = CommandTargets["canvas"];
const isPlace = objectOf({
  sceneId: isString,
  at: (v): v is { x: number; y: number } => isObject(v),
});

const sceneOpen = (context: CampaignContext, { sceneId }: Place) =>
  !!open(context, sceneId) || "Open the scene first";

export const addTokenHere = command<Place>({
  id: "canvas.addToken",
  params: isPlace,
  title: "Add Token Here",
  icon: IconAdd,
  section: "open",
  transact: false,
  available: sceneOpen,
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (context, { sceneId, at }) => open(context, sceneId)?.controller.addToken(at),
});

export const addImageHere = command<Place>({
  id: "canvas.addImage",
  params: isPlace,
  title: "Add Image Here…",
  icon: IconImage,
  section: "open",
  transact: false,
  available: sceneOpen,
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (context, { sceneId, at }) => open(context, sceneId)?.importImagesAt(at),
});

export const sceneSettings = command<Place>({
  id: "canvas.settings",
  params: isPlace,
  title: "Scene Settings…",
  icon: IconGrid,
  section: "edit",
  transact: false,
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (context) => {
    context.canvas.sceneSettingsOpen.set(true);
  },
});

export const selectionCommands = [
  tokenOptions,
  alignMapToGrid,
  useAsToken,
  detectWalls,
  useAsMap,
  bringToFront,
  sendToBack,
  duplicate,
  lock,
  unlock,
  deleteSelection,
  addTokenHere,
  addImageHere,
  sceneSettings,
];
