import { arrayOf, isBoolean, isNumber, isObject, isString, oneOf } from "../data/guards";
import { Invalid, collection, lww, record, variant, type Item, type Shape } from "../data/schema";
import type { BlobRef, EntityGraphic, EntityGraphicRef } from "../media/images";
import { DEFAULT_GRID } from "./grid";
import { EFFECTS, LAYERS, SHAPES, TOKEN_STYLES, type SceneElement } from "./types";

/*
 * A scene subdocument (see design doc, "Data model"):
 *
 *   settings  lighting, darkness, vision, and the grid
 *   elements  elementId -> element: a map, token, drawing, shape…
 *
 * Each scene is a Yjs subdocument of the campaign root, persisted in its own
 * IndexedDB database and loaded only while someone is looking at it.
 */

const num = (fallback: number) => lww(isNumber).or(fallback);
const colour = lww(isString).or("#ffffff");
const isPoints = arrayOf(isNumber);
const isBlob = isObject<BlobRef>;

export const sceneSettings = record({
  lighting: lww(isBoolean).or(false),
  /** How dark unlit places are, 0 to 1. */
  darkness: num(0.75),
  /** Whether players see only what their tokens see. */
  vision: lww(isBoolean).or(false),
  gridType: lww(oneOf("none", "square", "hex")).or(DEFAULT_GRID.type),
  gridSize: num(DEFAULT_GRID.size),
  gridOffsetX: num(DEFAULT_GRID.offsetX),
  gridOffsetY: num(DEFAULT_GRID.offsetY),
  gridUnit: num(DEFAULT_GRID.unit),
  gridUnitName: lww(isString).or(DEFAULT_GRID.unitName),
  gridDiagonal: lww(oneOf("one", "alternate", "euclid")).or(DEFAULT_GRID.diagonal),
});

/** A polygon's or stroke's points, flat and relative to its centre at the size bw × bh. */
const outline = { points: lww(isPoints), bw: lww(isNumber), bh: lww(isNumber) };

const shapeKind = lww(oneOf(...SHAPES.map((s) => s.id))).or("rect");

/** The fields each kind of element has, beside its place and size. See types.ts for what they mean. */
const elementCases = {
  map: { image: lww(isBlob) },
  token: {
    image: lww(isBlob),
    graphic: lww(isObject<EntityGraphic>),
    entityRef: lww(isObject<EntityGraphicRef>),
    icon: lww(isString),
    itemDefId: lww(isString),
    name: lww(isString).or(""),
    colour,
    style: lww(oneOf(...TOKEN_STYLES.map((s) => s.id))),
    characterId: lww(isString),
    hideName: lww(isBoolean),
    hideBars: lww(isBoolean),
  },
  drawing: { ...outline, colour, width: num(4) },
  shape: {
    ...outline,
    shape: shapeKind,
    stroke: lww(isString).or("#ffffffff"),
    fill: lww(isString).or("#ffffff00"),
    width: num(2),
    template: lww(isBoolean),
  },
  text: { text: lww(isString).or(""), colour, size: num(24), bw: num(1), bh: num(1) },
  wall: { door: lww(isBoolean), open: lww(isBoolean) },
  light: { bright: num(0), dim: num(0), colour, flicker: lww(isBoolean) },
  area: { ...outline, tone: lww(oneOf("light", "dark")).or("light") },
  effect: {
    ...outline,
    shape: shapeKind,
    effect: lww(oneOf(...EFFECTS.map((e) => e.id))).or("fog"),
    colour,
    glow: lww(isBoolean),
    obscures: lww(isBoolean),
  },
} satisfies Record<SceneElement["type"], Shape>;

export const sceneElement = variant(
  "type",
  {
    x: num(0),
    y: num(0),
    w: num(1),
    h: num(1),
    rot: num(0),
    layer: lww(oneOf(...LAYERS)).or("token"),
    /** A fractional index ordering it within its layer. */
    z: lww(isString).or("a0"),
    locked: lww(isBoolean).or(false),
    createdBy: lww(isString).or(""),
  },
  elementCases,
);

/**
 * An element as stored, or why it can't be drawn: a kind this build doesn't
 * know, or a polygon or stroke without its points, as a peer on another
 * version (or a build part way through a change) may have left it.
 */
function parseElement(m: Item<typeof sceneElement>, id: string): SceneElement | Invalid {
  const el = m.readCase();
  if (!el) return new Invalid("not a kind of element this version knows");
  const polygon = el.type === "area" || ("shape" in el && el.shape === "polygon");
  if (polygon || el.type === "drawing") {
    const { points, bw, bh } = el as { points?: number[]; bw?: number; bh?: number };
    const ok =
      !!points &&
      points.length % (el.type === "drawing" ? 3 : 2) === 0 &&
      points.length >= (polygon ? 6 : 3) &&
      bw !== undefined &&
      bh !== undefined &&
      bw > 0 &&
      bh > 0;
    if (!ok) return new Invalid("its points are missing");
  }
  if (el.type === "map" && !el.image) return new Invalid("its image is missing");
  return { id, ...el } as SceneElement;
}

export const sceneShape = {
  settings: sceneSettings,
  elements: collection(sceneElement, "scene element", parseElement),
};
