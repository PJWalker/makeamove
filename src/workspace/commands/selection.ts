import { arrayOf, isObject, isString, objectOf } from "../../lib/guards";
import type { Guard } from "../../lib/guards";
import { elementsFromClipboard } from "../../scene/clipboard";
import type { NewElement, SceneElement } from "../../scene/types";
import {
  IconAdd,
  IconCopy,
  IconCut,
  IconBackward,
  IconDelete,
  IconDuplicate,
  IconForward,
  IconGrid,
  IconGroup,
  IconHidden,
  IconImage,
  IconLock,
  IconMap,
  IconPaste,
  IconRename,
  IconToBack,
  IconToFront,
  IconToken,
  IconUngroup,
  IconUnlock,
  IconVisible,
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
  look: { title: string; icon: Icon; keys?: string[]; nativeKey?: string; danger?: boolean },
  section: "arrange" | "delete" | "edit",
  edit: (context: CampaignContext, ids: string[]) => void,
  {
    available,
    offered,
    gm,
  }: {
    available?: (els: SceneElement[]) => string | true;
    offered?: (els: SceneElement[]) => boolean;
    /** Only the GM may. */
    gm?: boolean;
  } = {},
) =>
  command<Selection | undefined>({
    id,
    params: isSelectionOrNow,
    ...look,
    section,
    transact: false,
    ...(gm ? { permission: "gm" as const } : {}),
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
  { title: "Bring to Front", icon: IconToFront, keys: ["Mod+Shift+]"] },
  "arrange",
  (context, ids) => open(context)?.controller.arrange(ids, { to: "front" }),
);

export const bringForward = selectionCommand(
  "selection.forward",
  { title: "Bring Forward", icon: IconForward, keys: ["Mod+]"] },
  "arrange",
  (context, ids) => open(context)?.controller.arrange(ids, { to: "forward" }),
);

export const sendBackward = selectionCommand(
  "selection.backward",
  { title: "Send Backward", icon: IconBackward, keys: ["Mod+["] },
  "arrange",
  (context, ids) => open(context)?.controller.arrange(ids, { to: "backward" }),
);

export const sendToBack = selectionCommand(
  "selection.toBack",
  { title: "Send to Back", icon: IconToBack, keys: ["Mod+Shift+["] },
  "arrange",
  (context, ids) => open(context)?.controller.arrange(ids, { to: "back" }),
);

/** Put clipboard HTML on the system clipboard, from a menu: the keys copy through the browser's own event. */
async function writeClipboard(html: string | null) {
  if (!html) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
    ]);
  } catch (error) {
    console.error("Couldn't copy to the clipboard", error);
  }
}

export const copy = selectionCommand(
  "selection.copy",
  { title: "Copy", icon: IconCopy, nativeKey: "Mod+C" },
  "edit",
  (context, ids) => void writeClipboard(open(context)?.controller.copy(ids) ?? null),
);

export const cut = selectionCommand(
  "selection.cut",
  { title: "Cut", icon: IconCut, nativeKey: "Mod+X" },
  "edit",
  (context, ids) => void writeClipboard(open(context)?.controller.copy(ids, { cut: true }) ?? null),
);

/** Whether the elements are already one group, all of it. */
const oneGroup = (els: SceneElement[]) => {
  const group = els[0]?.group;
  return group !== undefined && els.every((element) => element.group === group);
};

export const group = selectionCommand(
  "selection.group",
  { title: "Group", icon: IconGroup, keys: ["Mod+G"] },
  "arrange",
  (context, ids) => open(context)?.controller.group(ids),
  {
    available: (els) =>
      els.length < 2 ? "Select two or more" : !oneGroup(els) || "Already a group",
    offered: (els) => els.length > 1 && !oneGroup(els),
  },
);

export const ungroup = selectionCommand(
  "selection.ungroup",
  { title: "Ungroup", icon: IconUngroup, keys: ["Mod+Shift+G"] },
  "arrange",
  (context, ids) => open(context)?.controller.ungroup(ids),
  {
    available: (els) => els.some((element) => element.group) || "Not grouped",
    offered: (els) => els.some((element) => element.group),
  },
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

export const hide = selectionCommand(
  "selection.hide",
  { title: "Hide from Players", icon: IconHidden },
  "edit",
  (context, ids) => open(context)?.controller.setHidden(ids, true),
  {
    gm: true,
    available: (els) => !els.every((element) => element.hidden) || "Already hidden",
    // Hide and Show share a place in the menu: only the one that applies.
    offered: (els) => !els.every((element) => element.hidden),
  },
);

export const show = selectionCommand(
  "selection.show",
  { title: "Show to Players", icon: IconVisible },
  "edit",
  (context, ids) => open(context)?.controller.setHidden(ids, false),
  {
    gm: true,
    available: (els) => els.some((element) => element.hidden) || "Not hidden",
    offered: (els) => els.every((element) => element.hidden),
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

export const useAsToken = oneElementCommand(
  "map.useAsToken",
  { title: "Use as Token", icon: IconToken },
  "act",
  (element) => element.type === "map",
  "Select one map",
  (context, id) => open(context)?.controller.convert(id, "token"),
);

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

/** One clipboard item's scene elements, or else its image. */
async function readItem(item: ClipboardItem): Promise<File | NewElement[] | null> {
  if (item.types.includes("text/html")) {
    const html = await item.getType("text/html");
    const copies = elementsFromClipboard(await html.text());
    if (copies) return copies;
  }
  const type = item.types.find((t) => t.startsWith("image/"));
  return type ? new File([await item.getType(type)], "Pasted image", { type }) : null;
}

/** Paste what's on the system clipboard at a place, from a menu: scene elements, or else images. */
async function pasteAt(context: CampaignContext, { sceneId, at }: Place) {
  try {
    const items = await navigator.clipboard.read();
    const read = await Promise.all(items.map(async (item) => readItem(item)));
    const controller = open(context, sceneId)?.controller;
    const copies = read.find((r) => Array.isArray(r));
    if (copies) controller?.paste(copies, at);
    else await controller?.importFiles(read.filter((r) => r instanceof File), at);
  } catch (error) {
    console.error("Couldn't paste from the clipboard", error);
  }
}

export const pasteHere = command<Place>({
  id: "canvas.paste",
  params: isPlace,
  title: "Paste Here",
  icon: IconPaste,
  nativeKey: "Mod+V",
  section: "edit",
  transact: false,
  available: sceneOpen,
  menu: { canvas: (_, t) => [{ params: t }] },
  run: (context, place) => void pasteAt(context, place),
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
  useAsToken,
  useAsMap,
  bringToFront,
  bringForward,
  sendBackward,
  sendToBack,
  group,
  ungroup,
  copy,
  cut,
  duplicate,
  lock,
  unlock,
  hide,
  show,
  deleteSelection,
  addTokenHere,
  addImageHere,
  pasteHere,
  sceneSettings,
];
