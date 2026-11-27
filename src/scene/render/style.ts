import { Color } from "pixi.js";
import type { Graphics } from "pixi.js";
import type { Rect } from "../camera";
import type { Point } from "../grid";
import { fontFamily, TEXT_FONTS } from "../types";
import type { TextStyle } from "../types";
import type { SdfFontSpec } from "./sdfFont";
import type { SdfTextOptions } from "./sdfText";
import type { RenderState } from "./state";

/** The UI accent, oklch(82% 0.15 85), as sRGB for the canvas. */
export const ACCENT = 0xF0_BB_3B;
export const INK = 0x14_16_1C;

/** A scene colour as CSS: its hex without alpha, and its opacity apart. */
export function cssColour(colour: number | string) {
  const c = new Color(colour);
  return { hex: c.toHex(), alpha: c.alpha };
}

/** The canvas fonts, loaded from index.html. */
export const cabin = (weight: number): SdfFontSpec => ({ family: "Cabin, sans-serif", weight });
export const fraunces = (weight: number): SdfFontSpec => ({ family: "Fraunces, serif", weight });

/** The weight of text on the map, plain or bold. */
export const textWeight = (bold: boolean) => (bold ? 700 : 400);

/** The font text on the map is drawn in. */
export const textFont = ({ font, bold, italic }: TextStyle): SdfFontSpec => ({
  family: fontFamily(font),
  weight: textWeight(bold),
  style: italic ? "italic" : "normal",
});

/** Every font the canvas draws, to load before any glyphs are drawn. */
export const CANVAS_FONTS = [
  cabin(600),
  cabin(800),
  fraunces(600),
  ...TEXT_FONTS.flatMap(({ id: font }) =>
    [false, true].flatMap((bold) =>
      [false, true].map((italic) => textFont({ font, bold, italic })),
    ),
  ),
];

/** Token names, white with a dark outline to read over any map. */
export const TOKEN_NAME: SdfTextOptions = {
  font: cabin(600),
  size: 15,
  fill: 0xFF_FF_FF,
  outline: { color: INK, width: 4 },
};

/** Points as Pixi's flat [x, y, x, y…]. */
export const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** What of the canvas isn't covered by UI, in screen px, kept a little in from its edges. */
export function screenViewport(s: Pick<RenderState, "insets" | "size">): Rect {
  const insets = s.insets();
  return {
    x: insets.left + 4,
    y: insets.top + 4,
    w: Math.max(1, s.size.width - insets.left - insets.right - 8),
    h: Math.max(1, s.size.height - insets.top - 8),
  };
}

/** Room kept around what's pinned to the edge of the screen for its pointer, in px. */
export const POINTER_ROOM = 16;

/** A little triangle pointing toward something off screen (see pointerToward). */
export const drawPointer = (g: Graphics, pointer: Point[], alpha = 1) =>
  g
    .poly(flat(pointer))
    .fill({ color: 0xFF_FF_FF, alpha })
    .stroke({ color: INK, width: 2, join: "round", alpha });
