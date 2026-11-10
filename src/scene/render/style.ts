import type { Graphics } from "pixi.js";
import type { Rect } from "../camera";
import type { Point } from "../grid";
import type { SdfFontSpec } from "./sdfFont";
import type { SdfTextOptions } from "./sdfText";
import type { RenderState } from "./state";

/** The UI accent, oklch(82% 0.15 85), as sRGB for the canvas. */
export const ACCENT = 0xf0bb3b;
export const INK = 0x14161c;

/** The canvas fonts, loaded from index.html. */
export const cabin = (weight: number): SdfFontSpec => ({ family: "Cabin, sans-serif", weight });
export const fraunces = (weight: number): SdfFontSpec => ({ family: "Fraunces, serif", weight });

/** Every font the canvas draws, to load before any glyphs are drawn. */
export const CANVAS_FONTS = [cabin(600), cabin(700), cabin(800), fraunces(600)];

/** Token names, white with a dark outline to read over any map. */
export const TOKEN_NAME: SdfTextOptions = {
  font: cabin(600),
  size: 15,
  fill: 0xffffff,
  outline: { color: INK, width: 4 },
};

/** Points as Pixi's flat [x, y, x, y…]. */
export const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What of the canvas isn't covered by UI, in screen px, kept a little in from its edges. */
export function screenViewport(s: Pick<RenderState, "size" | "insets">): Rect {
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
    .fill({ color: 0xffffff, alpha })
    .stroke({ color: INK, width: 2, join: "round", alpha });
