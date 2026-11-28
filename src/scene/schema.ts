import { arrayOf, isBoolean, isNumber, isObject, isString, oneOf } from "../lib/guards";
import { Invalid, collection, lww, record, variant } from "../data/schema";
import type { Item, Shape } from "../data/schema";
import type {
  BlobReference,
  EntityGraphic,
  EntityGraphicRef as EntityGraphicReference,
} from "../media/images";
import { isLink } from "../features/notes/links";
import { DEFAULT_GRID } from "./grid";
import { FOG_MODES } from "./fog";
import { EFFECTS, LAYERS, SHAPES, TEXT_FONTS, TOKEN_STYLES } from "./types";
import type { SceneElement } from "./types";

/*
 * A scene subdocument (see design doc, "Data model"):
 *
 *   settings  lighting, darkness, vision, and the grid
 *   elements  elementId -> element: a map, token, drawing, shape…
 *   explored  key -> what characters have seen from one place (fog of war)
 *
 * Each scene is a Yjs subdocument of the campaign root, persisted in its own
 * IndexedDB database and loaded only while someone is looking at it.
 */

const number_ = (fallback: number) => lww(isNumber).or(fallback);
const colour = lww(isString).or("#ffffff");
const isPoints = arrayOf(isNumber);
const isBlob = isObject<BlobReference>;

export const sceneSettings = record({
  lighting: lww(isBoolean).or(false),
  /** How dark unlit places are, 0 to 1. */
  darkness: number_(0.75),
  /** Whether players see only what their tokens see. */
  vision: lww(isBoolean).or(false),
  /** Fog of war: off, revealed by exploring, or revealed by hand (see fog.ts). */
  fog: lww(oneOf(...FOG_MODES.map((m) => m.id))).or("none"),
  gridType: lww(oneOf("none", "square", "hex")).or(DEFAULT_GRID.type),
  gridSize: number_(DEFAULT_GRID.size),
  gridOffsetX: number_(DEFAULT_GRID.offsetX),
  gridOffsetY: number_(DEFAULT_GRID.offsetY),
  gridUnit: number_(DEFAULT_GRID.unit),
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
    entityRef: lww(isObject<EntityGraphicReference>),
    icon: lww(isString),
    itemDefId: lww(isString),
    name: lww(isString).or(""),
    colour,
    style: lww(oneOf(...TOKEN_STYLES.map((s) => s.id))),
    characterId: lww(isString),
    hideName: lww(isBoolean),
    hideBars: lww(isBoolean),
  },
  drawing: { ...outline, colour, width: number_(4) },
  shape: {
    ...outline,
    shape: shapeKind,
    stroke: lww(isString).or("#ffffffff"),
    fill: lww(isString).or("#ffffff00"),
    width: number_(2),
    template: lww(isBoolean),
  },
  text: {
    text: lww(isString).or(""),
    colour,
    size: number_(24),
    bw: number_(1),
    bh: number_(1),
    font: lww(oneOf(...TEXT_FONTS.map((f) => f.id))).or("sans"),
    bold: lww(isBoolean).or(true),
    italic: lww(isBoolean).or(false),
  },
  wall: { door: lww(isBoolean), open: lww(isBoolean) },
  light: { bright: number_(0), dim: number_(0), colour, flicker: lww(isBoolean) },
  area: { ...outline, tone: lww(oneOf("light", "dark")).or("light") },
  pin: { link: lww(isLink) },
  effect: {
    ...outline,
    shape: shapeKind,
    effect: lww(oneOf(...EFFECTS.map((e) => e.id))).or("fog"),
    colour,
    glow: lww(isBoolean),
    obscures: lww(isBoolean),
  },
  fog: { ...outline, shape: shapeKind, force: lww(oneOf("hide", "reveal")).or("hide") },
} satisfies Record<SceneElement["type"], Shape>;

export const sceneElement = variant(
  "type",
  {
    x: number_(0),
    y: number_(0),
    w: number_(1),
    h: number_(1),
    rot: number_(0),
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
function parseElement(m: Item<typeof sceneElement>, id: string): Invalid | SceneElement {
  const element = m.readCase();
  if (!element) return new Invalid("not a kind of element this version knows");
  const polygon = element.type === "area" || ("shape" in element && element.shape === "polygon");
  if (polygon || element.type === "drawing") {
    const { points, bw, bh } = element as { points?: number[]; bw?: number; bh?: number };
    const ok =
      !!points &&
      points.length % (element.type === "drawing" ? 3 : 2) === 0 &&
      points.length >= (polygon ? 6 : 3) &&
      bw !== undefined &&
      bh !== undefined &&
      bw > 0 &&
      bh > 0;
    if (!ok) return new Invalid("its points are missing");
  }
  if (element.type === "map" && !element.image) return new Invalid("its image is missing");
  if (element.type === "pin" && !element.link) return new Invalid("its link is missing");
  return { id, ...element } as SceneElement;
}

/** What a character saw from one place: a polygon in the world, flat [x, y, …]. */
function parseExplored(points: number[]): Invalid | number[] {
  if (points.length < 6 || points.length % 2 !== 0) return new Invalid("its outline is missing");
  return points;
}

export const sceneShape = {
  settings: sceneSettings,
  elements: collection(sceneElement, "scene element", parseElement),
  explored: collection(lww(isPoints), "explored sight", parseExplored),
};
