import { store } from "../lib/store";
import {
  getStorageItem,
  getStorageJson,
  setStorageItem,
  setStorageJson,
} from "../platform/localStorage";
import type { AreaTone, Layer, ShapeKind } from "./types";

export type ToolId =
  "select" | "pan" | "draw" | "erase" | "shape" | "text" | "ruler" | "ping" | "wall" | "light";

export const activeTool = store<ToolId>("select");

/*
 * Pen settings, remembered per device.
 */
export const PEN_WIDTHS: readonly [number, number, number] = [3, 6, 12];

interface PenSettings {
  colour: string;
  width: number;
  layer: Extract<Layer, "under" | "over">;
}

const PEN_KEY = "mam:pen";

function loadPen(): PenSettings {
  // Gold, like the UI accent.
  const fallback: PenSettings = { colour: "#f0bb3b", width: PEN_WIDTHS[1], layer: "over" };
  return { ...fallback, ...getStorageJson<Partial<PenSettings>>(PEN_KEY, {}) };
}

export const pen = store<PenSettings>(loadPen());

export function setPen(patch: Partial<PenSettings>) {
  pen.value = { ...pen.value, ...patch };
  setStorageJson(PEN_KEY, pen.value);
}

/** Eraser radius in screen px. */
export const ERASER_RADIUS = 14;

/** The shape the Shapes tool draws, remembered per device. */
const SHAPE_KEY = "mam:shape";
function loadShape(): ShapeKind {
  const v = getStorageItem(SHAPE_KEY);
  return v === "circle" || v === "line" || v === "cone" ? v : "rect";
}
export const shapeTool = store<ShapeKind>(loadShape());
export function setShapeTool(shape: ShapeKind) {
  shapeTool.value = shape;
  setStorageItem(SHAPE_KEY, shape);
}

/** What the Lights tool does: select lamps and areas, or place a lamp or an area of solid light or dark. Remembered per device. */
export type LightToolMode = "select" | "lamp" | AreaTone;
const LIGHT_TOOL_KEY = "mam:light-tool";
function loadLightTool(): LightToolMode {
  const v = getStorageItem(LIGHT_TOOL_KEY);
  return v === "select" || v === "light" || v === "dark" ? v : "lamp";
}
export const lightTool = store<LightToolMode>(loadLightTool());
export function setLightTool(mode: LightToolMode) {
  lightTool.value = mode;
  setStorageItem(LIGHT_TOOL_KEY, mode);
}

/** Outline width of drawn shapes, in world px. */
export const SHAPE_WIDTH = 3;

/** How an action's area of effect is drawn: the accent, under tokens so they stay clear. */
export const TEMPLATE_STYLE = { colour: "#f0c23b", width: 3, layer: "under" as Layer };
