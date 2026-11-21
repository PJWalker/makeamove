import type { BlobRef as BlobReference, EntityGraphic, EntityGraphicRef } from "../media/images";

/*
 * Scene elements as plain values. Each is stored as a Y.Map of these fields
 * in the scene's subdocument (see sceneDoc.ts).
 *
 * Every element has a centre (x, y), a size (w, h) and a rotation in
 * radians, all in world px. z is a fractional index ordering it within its
 * layer.
 */

/** Bottom to top. Fog and presence layers arrive with M5 and M2. */
export const LAYERS = ["map", "under", "token", "over"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Transform {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

interface Base extends Transform {
  id: string;
  layer: Layer;
  z: string;
  locked: boolean;
  createdBy: string;
}

export interface MapElement extends Base {
  type: "map";
  image: BlobReference;
}

/**
 * How a token is drawn: 'disc' crops its image to a circle on a coloured
 * background with a ring; 'plain' shows the image as it is (for cut-out art).
 */
export type TokenStyle = "disc" | "plain";

export const TOKEN_STYLES: { id: TokenStyle; label: string }[] = [
  { id: "disc", label: "Round with border" },
  { id: "plain", label: "Image as is" },
];

export interface TokenElement extends Base {
  type: "token";
  image?: BlobReference;
  graphic?: EntityGraphic;
  entityRef?: EntityGraphicRef;
  /** A bundled entry icon, rendered when the token has no image. */
  icon?: string;
  /** The gear definition represented by an item token. */
  itemDefId?: string;
  name: string;
  /** Background and ring colour of a disc token. */
  colour: string;
  /** Missing on tokens from before styles existed, which are discs. */
  style?: TokenStyle;
  /** The character this token stands for; the system decides which of its stats show. */
  characterId?: string;
  /** Hide its name under it. */
  hideName?: boolean;
  /** Hide the bars its character's system shows (HP). */
  hideBars?: boolean;
}

/** A token is only drawn plain if it has an image to show. */
export const isPlainToken = (element: SceneElement) =>
  element.type === "token" && element.style === "plain" && (!!element.image || element.graphic?.kind === "image");

export interface DrawingElement extends Base {
  type: "drawing";
  /** Flat [x, y, pressure, …] relative to the centre, at the size bw × bh. */
  points: number[];
  colour: string;
  /** Stroke width at the original size. */
  width: number;
  bw: number;
  bh: number;
}

/**
 * A shape's outline in its own frame, w × h about its centre: a rectangle,
 * an ellipse, a line along its length (w) as thick as h, a cone opening
 * from the middle of its left edge to its right edge, or a polygon through
 * its own corners.
 */
export type ShapeKind = "rect" | "circle" | "line" | "cone" | "polygon";

/** The shapes dragged out corner to corner or from an origin: every kind but the polygon, placed a corner at a time. */
export type DraggedShapeKind = Exclude<ShapeKind, "polygon">;

/**
 * The outline a shape kind makes. A polygon carries its corners, flat
 * [x, y, …] relative to the centre at the size bw × bh.
 */
export type ShapeGeometry =
  | { shape: DraggedShapeKind }
  | { shape: "polygon"; points: number[]; bw: number; bh: number };

/** How a shape is painted: its outline and its inside, each a colour with its opacity, #rrggbbaa. */
export interface ShapePaint {
  stroke: string;
  fill: string;
}

export type ShapeElement = Base &
  ShapePaint &
  ShapeGeometry & {
    type: "shape";
    /** Outline width. */
    width: number;
    /** Set when placed as an action's area of effect: who placed it, for clearing. */
    template?: boolean;
  };

/** The fonts text on the map can be set in, each a CSS font family. */
export const TEXT_FONTS = [
  { id: "sans", label: "Sans", family: "Cabin, sans-serif" },
  { id: "serif", label: "Serif", family: "Fraunces, serif" },
  { id: "display", label: "Display", family: "Cinzel, serif" },
  { id: "hand", label: "Handwriting", family: "Caveat, cursive" },
] as const;
export type TextFont = (typeof TEXT_FONTS)[number]["id"];

/** The CSS font family of a text font. */
export const fontFamily = (font: TextFont) =>
  (TEXT_FONTS.find((f) => f.id === font) ?? TEXT_FONTS[0]).family;

/** How text on the map is set. */
export interface TextStyle {
  font: TextFont;
  bold: boolean;
  italic: boolean;
}

/** What `els` share of their text style: their font if they're all in one, and bold or italic if all are. */
export function sharedTextStyle(els: readonly TextStyle[]): Partial<TextStyle> {
  const font = els[0]?.font;
  return {
    ...(font && els.every((element) => element.font === font) && { font }),
    bold: els.every((element) => element.bold),
    italic: els.every((element) => element.italic),
  };
}

/** All that decides how big text is drawn. */
export type TextLook = TextStyle & { text: string; colour: string; size: number };

export interface TextElement extends Base, TextStyle {
  type: "text";
  text: string;
  colour: string;
  /** Font size at w × h; resizing scales it. */
  size: number;
  /** The size w × h the text was laid out at. */
  bw: number;
  bh: number;
}

/**
 * A wall (M12): a segment along its length (w) through its centre, at its
 * rotation, that blocks sight and light. A door is a wall the GM can open.
 * Only the GM sees walls.
 */
export interface WallElement extends Base {
  type: "wall";
  door?: boolean;
  open?: boolean;
}

/** A light (M12): bright light out to one radius, dim light out to another, in world px. Only the GM sees the lamp itself. */
export interface LightElement extends Base {
  type: "light";
  bright: number;
  dim: number;
  colour: string;
  /** Whether it wavers like a flame. */
  flicker?: boolean;
}

/** Whether an area is lit whatever the lights do, or dark whatever they do. */
export type AreaTone = "light" | "dark";

/** How the GM sees an area of solid light or dark. */
export const AREA_COLOURS: Record<AreaTone, string> = {
  light: "#ffe29a",
  dark: "#9b8cff",
};

/**
 * An area of solid light or dark (M12): a polygon, its points flat [x, y, …]
 * relative to the centre at the size bw × bh. Only the GM sees its outline.
 */
export interface AreaElement extends Base {
  type: "area";
  tone: AreaTone;
  points: number[];
  bw: number;
  bh: number;
}

/** What fills an effect zone. */
export type EffectKind = "rain" | "snow" | "fog" | "embers" | "magic";

/** Whether an effect gives off light, and whether it blocks sight. */
export interface EffectSight {
  /** Lifts the dark in it to dim light, in its colour. */
  glow?: boolean;
  /** Can't be seen into, out of or through. */
  obscures?: boolean;
}

/** The effects a zone can have, each with the colour, light and sight a new one starts with. */
export const EFFECTS: ({ id: EffectKind; label: string; colour: string } & EffectSight)[] = [
  { id: "rain", label: "Rain", colour: "#a9c4e8" },
  { id: "snow", label: "Snow", colour: "#ffffff" },
  { id: "fog", label: "Fog", colour: "#c8ced6", obscures: true },
  { id: "embers", label: "Embers", colour: "#ff8a3d", glow: true },
  { id: "magic", label: "Magic", colour: "#b68cff", glow: true },
];

/**
 * A zone of weather, cloud or magic (rain, fog, motes of light), in any
 * shape the Shapes tool draws. Everyone sees the effect; only the GM sees
 * its outline. It may glow, and it may block sight, as fog does.
 */
export type EffectElement = Base &
  ShapeGeometry &
  EffectSight & {
    type: "effect";
    effect: EffectKind;
    colour: string;
  };

export type SceneElement =
  | MapElement
  | TokenElement
  | DrawingElement
  | ShapeElement
  | TextElement
  | WallElement
  | LightElement
  | AreaElement
  | EffectElement;

/** What callers supply when adding an element; the store fills in the rest. */
export type NewElement = DistributiveOmit<SceneElement, "id" | "z" | "createdBy" | "locked"> & {
  locked?: boolean;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "rect", label: "Square" },
  { id: "circle", label: "Circle" },
  { id: "line", label: "Line" },
  { id: "cone", label: "Cone" },
  { id: "polygon", label: "Polygon" },
];
