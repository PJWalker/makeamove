import { arrayOf, isObject, isString, objectOf } from "../../data/guards";
import type { Guard } from "../../data/schema";
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
  type Icon,
} from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command, type CommandTargets, type Offer } from "./types";

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

const open = (ctx: CampaignContext, sceneId?: string) => {
  const o = ctx.canvas.canvasCommands.value;
  return o && (!sceneId || o.sceneId === sceneId) ? o : null;
};

/** The elements a call is about, as they are now. */
function chosen(ctx: CampaignContext, p: Selection | undefined): SceneElement[] {
  const o = open(ctx, p?.sceneId);
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
  section: "arrange" | "edit" | "delete",
  edit: (ctx: CampaignContext, ids: string[]) => void,
  {
    available,
    offered,
  }: {
    available?: (els: SceneElement[]) => true | string;
    offered?: (els: SceneElement[]) => boolean;
  } = {},
) =>
  command<Selection | undefined>({
    id,
    params: isSelectionOrNow,
    ...look,
    section,
    transact: false,
    available: (ctx, p) => {
      const els = chosen(ctx, p);
      return !els.length ? "Nothing selected" : (available?.(els) ?? true);
    },
    menu: {
      selection: (ctx, t): Offer<Selection | undefined>[] =>
        !offered || offered(chosen(ctx, t)) ? [{ params: t }] : [],
    },
    run: (ctx, p) => {
      const ids = chosen(ctx, p).map((el) => el.id);
      if (ids.length) edit(ctx, ids);
    },
  });

// The scene keeps its own undo steps (scene/sceneDoc.ts), in the player's history all the same.

export const bringToFront = selectionCommand(
  "selection.toFront",
  { title: "Bring to Front", icon: IconToFront },
  "arrange",
  (ctx, ids) => open(ctx)?.controller.restack(ids, "front"),
);

export const sendToBack = selectionCommand(
  "selection.toBack",
  { title: "Send to Back", icon: IconToBack },
  "arrange",
  (ctx, ids) => open(ctx)?.controller.restack(ids, "back"),
);

export const duplicate = selectionCommand(
  "selection.duplicate",
  { title: "Duplicate", icon: IconDuplicate, keys: ["Mod+D"] },
  "edit",
  (ctx, ids) => open(ctx)?.controller.duplicate(ids),
);

export const lock = selectionCommand(
  "selection.lock",
  { title: "Lock", icon: IconLock },
  "edit",
  (ctx, ids) => open(ctx)?.controller.setLocked(ids, true),
  {
    available: (els) => !els.every((el) => el.locked) || "Already locked",
    // Lock and Unlock share a place in the menu: only the one that applies.
    offered: (els) => !els.every((el) => el.locked),
  },
);

export const unlock = selectionCommand(
  "selection.unlock",
  { title: "Unlock", icon: IconUnlock },
  "edit",
  (ctx, ids) => open(ctx)?.controller.setLocked(ids, false),
  {
    available: (els) => els.some((el) => el.locked) || "Not locked",
    offered: (els) => els.every((el) => el.locked),
  },
);

export const deleteSelection = selectionCommand(
  "selection.delete",
  { title: "Delete", icon: IconDelete, keys: ["Delete", "Backspace"], danger: true },
  "delete",
  (ctx, ids) => open(ctx)?.controller.remove(ids),
  { available: (els) => !els.every((el) => el.locked) || "Locked" },
);

const one = (ctx: CampaignContext, p: Selection | undefined) => {
  const els = chosen(ctx, p);
  return els.length === 1 ? els[0]! : null;
};

export const tokenOptions = command<Selection | undefined>({
  id: "token.options",
  params: isSelectionOrNow,
  title: "Token Options…",
  icon: IconRename,
  section: "open",
  transact: false,
  available: (ctx, p) => one(ctx, p)?.type === "token" || "Select one token",
  menu: {
    selection: (ctx, t) => (one(ctx, t)?.type === "token" ? [{ params: t }] : []),
  },
  run: (ctx, p) => {
    const el = one(ctx, p);
    if (el?.type === "token") open(ctx)?.tokenOptions(el.id, "token");
  },
});

export const useAsToken = command<Selection | undefined>({
  id: "map.useAsToken",
  params: isSelectionOrNow,
  title: "Use as Token",
  icon: IconToken,
  section: "act",
  transact: false,
  available: (ctx, p) => one(ctx, p)?.type === "map" || "Select one map",
  menu: { selection: (ctx, t) => (one(ctx, t)?.type === "map" ? [{ params: t }] : []) },
  run: (ctx, p) => {
    const el = one(ctx, p);
    if (el) open(ctx)?.controller.convert(el.id, "token");
  },
});

export const useAsMap = command<Selection | undefined>({
  id: "token.useAsMap",
  params: isSelectionOrNow,
  title: "Use as Map",
  icon: IconMap,
  section: "act",
  transact: false,
  available: (ctx, p) => {
    const el = one(ctx, p);
    return (el?.type === "token" && !!el.image) || "Select one token with an image";
  },
  menu: {
    selection: (ctx, t) => {
      const el = one(ctx, t);
      return el?.type === "token" && el.image ? [{ params: t }] : [];
    },
  },
  run: (ctx, p) => {
    const el = one(ctx, p);
    if (el) open(ctx)?.controller.convert(el.id, "map");
  },
});

// An empty place on the scene

type Place = CommandTargets["canvas"];
const isPlace = objectOf({
  sceneId: isString,
  at: (v): v is { x: number; y: number } => isObject(v),
});

export const addTokenHere = command<Place>({
  id: "canvas.addToken",
  params: isPlace,
  title: "Add Token Here",
  icon: IconAdd,
  section: "open",
  transact: false,
  available: (ctx, { sceneId }) => !!open(ctx, sceneId) || "Open the scene first",
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (ctx, { sceneId, at }) => open(ctx, sceneId)?.controller.addToken(at),
});

export const addImageHere = command<Place>({
  id: "canvas.addImage",
  params: isPlace,
  title: "Add Image Here…",
  icon: IconImage,
  section: "open",
  transact: false,
  available: (ctx, { sceneId }) => !!open(ctx, sceneId) || "Open the scene first",
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (ctx, { sceneId, at }) => open(ctx, sceneId)?.importImagesAt(at),
});

export const sceneSettings = command<Place>({
  id: "canvas.settings",
  params: isPlace,
  title: "Scene Settings…",
  icon: IconGrid,
  section: "edit",
  transact: false,
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (ctx) => ctx.canvas.sceneSettingsOpen.set(true),
});

export const selectionCommands = [
  tokenOptions,
  useAsToken,
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
