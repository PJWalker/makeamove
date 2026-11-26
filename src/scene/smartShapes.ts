import { fromLocal } from "./geometry";
import { LENIENCY, recogniseShape } from "./recognise";
import type { RecognisedShape } from "./recognise";
import { STRIDE } from "./stroke";
import type { DrawingElement, Layer, NewElement, ShapeKind } from "./types";

/*
 * Turning pen drawings into the shapes they look like: as they're drawn
 * (see gestures/draw.ts), or afterwards, from the selection.
 */

/** How a drawing is inked: its colour, its width in the world, and its layer. */
export interface Ink {
  colour: string;
  width: number;
  layer: Layer;
}

/** "#rrggbb", a colour without its opacity. */
const OPAQUE_HEX = 7;

/** The shape element a drawing in `ink` becomes: outlined in the ink, and empty. */
export function shapeElement(ink: Ink, shape: RecognisedShape): NewElement {
  const stroke = ink.colour.length === OPAQUE_HEX ? `${ink.colour}ff` : ink.colour;
  const fill = `${ink.colour.slice(0, OPAQUE_HEX)}00`;
  return { type: "shape", layer: ink.layer, stroke, fill, width: ink.width, ...shape };
}

/** A drawing's stroke in the world, flat [x, y, pressure, …]: its points at its size, turned and placed. */
export function drawingStroke(d: DrawingElement): number[] {
  const sx = d.w / d.bw;
  const sy = d.h / d.bh;
  const out: number[] = [];
  for (let index = 0; index + STRIDE - 1 < d.points.length; index += STRIDE) {
    const p = fromLocal(d, { x: d.points[index]! * sx, y: d.points[index + 1]! * sy });
    out.push(p.x, p.y, d.points[index + 2]!);
  }
  return out;
}

/** How a drawing is inked, at the size it's drawn now. */
export const drawingInk = (d: DrawingElement): Ink => ({
  colour: d.colour,
  width: (d.width * (d.w / d.bw + d.h / d.bh)) / 2,
  layer: d.layer,
});

/** The shape a drawing is near enough to be offered as, if any. */
export const nearShape = (d: DrawingElement): RecognisedShape | null =>
  recogniseShape(drawingStroke(d), 0, LENIENCY.near);

/** What to call each shape, with even sides and without. */
const NAMES: Record<ShapeKind, [even: string, uneven: string]> = {
  rect: ["Square", "Rectangle"],
  circle: ["Circle", "Ellipse"],
  line: ["Line", "Line"],
  cone: ["Cone", "Cone"],
  polygon: ["Polygon", "Polygon"],
};

/** What to call a shape: a rectangle with even sides is a square, an even ellipse a circle. */
export const shapeName = (shape: RecognisedShape): string =>
  NAMES[shape.shape][Math.abs(shape.w - shape.h) < 1 ? 0 : 1];
