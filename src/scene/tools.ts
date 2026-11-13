import { store } from "../lib/store";
import { settingsOver, type LocalDoc, type LocalValue } from "../data/localDoc";
import {
  EFFECTS,
  SHAPES,
  type AreaTone,
  type EffectKind,
  type Layer,
  type SceneElement,
  type ShapeKind,
  type ShapePaint,
} from "./types";

export type ToolId =
  | "select"
  | "pan"
  | "draw"
  | "erase"
  | "shape"
  | "text"
  | "ruler"
  | "ping"
  | "wall"
  | "light"
  | "effect";

/** The range of pen widths, in screen px. */
export const PEN_WIDTH_RANGE = { min: 1, max: 24 } as const;

interface PenSettings {
  colour: string;
  /** Stroke width in screen px, so the brush is the same size on screen at any zoom. */
  width: number;
  layer: Extract<Layer, "under" | "over">;
}

/** Eraser radius in screen px. */
export const ERASER_RADIUS = 14;

/** What the Lights tool places: a lamp, or an area of solid light or dark. */
export type LightToolMode = "lamp" | AreaTone;

/** What the Effects tool puts down: the effect, its colour, light and sight, and the shape of its zone. */
interface EffectSettings {
  effect: EffectKind;
  colour: string;
  glow: boolean;
  obscures: boolean;
  shape: ShapeKind;
}

/** An effect as it starts: in its own colour, with its own light and sight. */
function effectDefaults(effect: EffectKind) {
  const e = EFFECTS.find((x) => x.id === effect)!;
  return { effect, colour: e.colour, glow: !!e.glow, obscures: !!e.obscures };
}

/** The sorts of things on a scene, as the Select tool picks them: lamps and areas are both lights. */
export type SelectKind =
  | "token"
  | "map"
  | "drawing"
  | "shape"
  | "text"
  | "wall"
  | "light"
  | "effect";
export const kindOf = (el: SceneElement): SelectKind => (el.type === "area" ? "light" : el.type);
const SELECT_KINDS: readonly SelectKind[] = [
  "token",
  "map",
  "drawing",
  "shape",
  "text",
  "wall",
  "light",
  "effect",
];
const SELECTABLE_DEFAULT: SelectKind[] = ["token", "map", "drawing", "shape", "text", "wall"];

/** One of `options` as stored, or `fallback`. */
function oneOf<T extends string>(options: readonly T[], fallback: T, name: string) {
  return (stored: unknown): T => {
    if (stored === undefined) return fallback;
    if (options.includes(stored as T)) return stored as T;
    console.warn(`Ignoring stored ${name}: unknown`, stored);
    return fallback;
  };
}

/**
 * The scene tools on this device: which is in use (for this session only),
 * and each one's settings, remembered in the campaign's local document.
 */
export class SceneTools {
  readonly activeTool = store<ToolId>("select");
  /** The player's own order for the toolbar. */
  readonly toolOrder: LocalValue<ToolId[]>;
  readonly pen: LocalValue<PenSettings>;
  /** The shape the Shapes tool draws. */
  readonly shapeTool: LocalValue<ShapeKind>;
  /** How the Shapes tool paints what it draws. */
  readonly shapePaint: LocalValue<ShapePaint>;
  readonly lightTool: LocalValue<LightToolMode>;
  readonly effectTool: LocalValue<EffectSettings>;
  /** The sorts of things the Select tool picks. Lights and effects are off until asked for. */
  readonly selectable: LocalValue<SelectKind[]>;

  constructor(local: LocalDoc) {
    this.toolOrder = local.value("toolOrder", (v) => {
      if (Array.isArray(v)) return v.filter((t): t is ToolId => typeof t === "string");
      if (v !== undefined) console.warn("Ignoring stored tool order: not a list", v);
      return [];
    });
    // Gold, like the UI accent.
    const penRead = settingsOver<PenSettings>(
      { colour: "#f0bb3b", width: 6, layer: "over" },
      "pen",
    );
    this.pen = local.value("pen", (v) => {
      const pen = penRead(v);
      return pen.layer === "under" || pen.layer === "over" ? pen : { ...pen, layer: "over" };
    });
    this.shapeTool = local.value(
      "shapeTool",
      oneOf(
        SHAPES.map((s) => s.id),
        "rect",
        "shape tool",
      ),
    );
    // Gold, like the pen, its inside a light tint.
    this.shapePaint = local.value(
      "shapePaint",
      settingsOver<ShapePaint>({ stroke: "#f0bb3bff", fill: "#f0bb3b38" }, "shape paint"),
    );
    this.lightTool = local.value(
      "lightTool",
      oneOf(["lamp", "light", "dark"], "lamp", "light tool"),
    );
    const effectRead = settingsOver<EffectSettings>(
      { ...effectDefaults("fog"), shape: "circle" },
      "effect tool",
    );
    this.effectTool = local.value("effectTool", (v) => {
      const e = effectRead(v);
      const known = EFFECTS.some((x) => x.id === e.effect) && SHAPES.some((s) => s.id === e.shape);
      return known ? e : effectRead(undefined);
    });
    this.selectable = local.value("selectable", (v) => {
      if (Array.isArray(v))
        return v.filter((k: unknown): k is SelectKind => SELECT_KINDS.includes(k as SelectKind));
      if (v !== undefined) console.warn("Ignoring stored selectable kinds: not a list", v);
      return SELECTABLE_DEFAULT;
    });
  }

  setPen(patch: Partial<PenSettings>) {
    this.pen.value = { ...this.pen.value, ...patch };
  }

  setShapePaint(patch: Partial<ShapePaint>) {
    this.shapePaint.value = { ...this.shapePaint.value, ...patch };
  }

  /** Choosing another effect starts it as that effect starts. */
  setEffectTool(patch: Partial<EffectSettings>) {
    this.effectTool.value = {
      ...this.effectTool.value,
      ...(patch.effect ? effectDefaults(patch.effect) : {}),
      ...patch,
    };
  }

  /** The sorts of things the active tool picks: its own, or what the Select tool's options turn on. */
  pickingKinds(tool: ToolId = this.activeTool.value): readonly SelectKind[] {
    const own = TOOL_KINDS[tool];
    return own ? [own] : this.selectable.value;
  }
}

/** The GM's sorts of things, which only the GM sees, picks and edits. */
export const GM_KINDS: readonly SelectKind[] = ["wall", "light", "effect"];

/** The tools that make a sort of thing, and pick only that while in use. */
export const TOOL_KINDS: Partial<Record<ToolId, SelectKind>> = { light: "light", effect: "effect" };

/** Outline width of drawn shapes, in world px. */
export const SHAPE_WIDTH = 3;

/** How an action's area of effect is drawn: the accent, under tokens so they stay clear. */
export const TEMPLATE_STYLE: ShapePaint & { width: number; layer: Layer } = {
  stroke: "#f0c23bff",
  fill: "#f0c23b38",
  width: 3,
  layer: "under",
};
