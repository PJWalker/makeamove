import { polygonFrame, shapePolygon } from "./geometry";
import { snapToLattice } from "./grid";
import type { Grid, Point } from "./grid";
import type { RecognisedShape } from "./recognise";

/*
 * Lining a drawn shape up with a square grid, when it's nearly lined up
 * already: a box's edges on grid lines, a polygon's corners on grid
 * corners, a line's ends and a cone's tip on grid corners, cell centres or
 * the middles of cell sides, and a cone's length and width in whole cells.
 * A shape that's off the grid anywhere is left as drawn.
 */

/** How near a grid line an edge or length must be to snap onto it, as a fraction of a cell. */
const EDGE_REACH = 0.2;
/** How near a point of the half-cell lattice an end or tip must be to snap onto it, as a fraction of a cell. */
const POINT_REACH = 0.15;
/** How far off square to the grid a box may be turned, in radians: only by rounding. */
const SQUARE_ROT = 1e-6;

/** Points a whole cell apart (grid corners), or half a cell (with cell centres and the middles of their sides), and how near one a point snaps to it, in cells. */
const CORNERS = { step: 1, reach: EDGE_REACH };
const HALF_CELLS = { step: 0.5, reach: POINT_REACH };

/** `shape` lined up with the grid, or as it is if it's not nearly lined up. */
export default function alignToGrid(shape: RecognisedShape, grid: Grid): RecognisedShape {
  if (grid.type !== "square") return shape;
  return aligned(shape, grid) ?? shape;
}

function aligned(shape: RecognisedShape, grid: Grid): RecognisedShape | null {
  const along = { x: Math.cos(shape.rot), y: Math.sin(shape.rot) };
  if (shape.shape === "rect" || shape.shape === "circle") return alignBox(shape, grid);
  if (shape.shape === "polygon") {
    const corners = shapePolygon(shape).map((p) => nearPoint(p, grid, CORNERS));
    if (!corners.every((p): p is Point => p !== null)) return null;
    return { shape: "polygon", ...polygonFrame(corners) };
  }
  if (shape.shape === "line") {
    const a = nearPoint(offset(shape, along, -shape.w / 2), grid, HALF_CELLS);
    const b = nearPoint(offset(shape, along, shape.w / 2), grid, HALF_CELLS);
    if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      ...shape,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      w,
      rot: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }
  const tip = nearPoint(offset(shape, along, -shape.w / 2), grid, HALF_CELLS);
  const w = nearCells(shape.w, grid);
  const h = nearCells(shape.h, grid);
  if (!tip || !w || !h) return null;
  return { ...shape, ...offset(tip, along, w / 2), w, h };
}

/**
 * A rectangle, circle or ellipse, square to the grid, with each side of
 * its box moved onto the grid line it's near. A circle stays round.
 */
function alignBox(shape: RecognisedShape, grid: Grid): RecognisedShape | null {
  const quarters = Math.round(shape.rot / (Math.PI / 2));
  if (Math.abs(shape.rot - quarters * (Math.PI / 2)) > SQUARE_ROT) return null;
  const [bw, bh] = quarters % 2 ? [shape.h, shape.w] : [shape.w, shape.h];
  const left = nearLine(shape.x - bw / 2, grid.offsetX, grid);
  const right = nearLine(shape.x + bw / 2, grid.offsetX, grid);
  const top = nearLine(shape.y - bh / 2, grid.offsetY, grid);
  const bottom = nearLine(shape.y + bh / 2, grid.offsetY, grid);
  if (left === null || right === null || top === null || bottom === null) return null;
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0 || (shape.w === shape.h && w !== h)) return null;
  return { ...shape, x: (left + right) / 2, y: (top + bottom) / 2, w, h, rot: 0 };
}

/** The grid line (at `origin` plus whole cells) within reach of `v`, if there is one. */
function nearLine(v: number, origin: number, grid: Grid): number | null {
  const line = origin + Math.round((v - origin) / grid.size) * grid.size;
  return Math.abs(v - line) <= EDGE_REACH * grid.size ? line : null;
}

/** A whole number of cells (at least one) within reach of `length`, if there is one. */
function nearCells(length: number, grid: Grid): number | null {
  const cells = Math.max(1, Math.round(length / grid.size)) * grid.size;
  return Math.abs(length - cells) <= EDGE_REACH * grid.size ? cells : null;
}

/** The point of a lattice on the grid within its reach of p, if there is one. */
function nearPoint(p: Point, grid: Grid, lattice: { step: number; reach: number }): Point | null {
  const q = snapToLattice(grid, p, lattice.step * grid.size);
  return Math.hypot(p.x - q.x, p.y - q.y) <= lattice.reach * grid.size ? q : null;
}

const offset = (p: Point, along: Point, by: number): Point => ({
  x: p.x + along.x * by,
  y: p.y + along.y * by,
});
