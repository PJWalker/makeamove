import { hexAt, hexCentre } from "./grid";
import type { DiagonalRule, Grid, Point } from "./grid";
import { fromLocal, shapeOutline } from "./geometry";
import type { ShapeGeometry, Transform } from "./types";

/*
 * Distances on a scene, in the scene's units (see design, "D&D 5.5e plugin
 * and a general rules engine", core change 7). On a square grid, distances
 * count cells, with the scene's rule for diagonals; hex grids count hexes;
 * with no grid, distances are straight lines, at the grid size per unit
 * step.
 */

/** How many cells a move of di × dj cells counts as. */
export function steps(di: number, dj: number, rule: DiagonalRule): number {
  const a = Math.abs(di);
  const b = Math.abs(dj);
  if (rule === "euclid") return Math.hypot(a, b);
  const long = Math.max(a, b);
  const short = Math.min(a, b);
  return rule === "alternate" ? long + Math.floor(short / 2) : long;
}

/** The square cell containing p. */
export function cellAt(grid: Grid, p: Point): { i: number; j: number } {
  return {
    i: Math.floor((p.x - grid.offsetX) / grid.size),
    j: Math.floor((p.y - grid.offsetY) / grid.size),
  };
}

export const cellCentre = (grid: Grid, index: number, index_: number): Point => ({
  x: grid.offsetX + (index + 0.5) * grid.size,
  y: grid.offsetY + (index_ + 0.5) * grid.size,
});

/** Hexes between two hexes in axial coordinates. */
export const hexSteps = (a: { q: number; r: number }, b: { q: number; r: number }) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export interface Measure {
  /** Distance in the scene's units. */
  distance: number;
  /** The points measured between: cell centres on a grid. */
  a: Point;
  b: Point;
}

/** The distance between two points, cell to cell on a grid. */
export function measure(grid: Grid, a: Point, b: Point): Measure {
  if (grid.type === "square") {
    const ca = cellAt(grid, a);
    const callback = cellAt(grid, b);
    return {
      distance: steps(callback.i - ca.i, callback.j - ca.j, grid.diagonal) * grid.unit,
      a: cellCentre(grid, ca.i, ca.j),
      b: cellCentre(grid, callback.i, callback.j),
    };
  }
  if (grid.type === "hex") {
    const ha = hexAt(grid, a);
    const hb = hexAt(grid, b);
    return {
      distance: hexSteps(ha, hb) * grid.unit,
      a: hexCentre(grid, ha.q, ha.r),
      b: hexCentre(grid, hb.q, hb.r),
    };
  }
  return { distance: toUnits(grid, Math.hypot(b.x - a.x, b.y - a.y)), a, b };
}

/**
 * The cells a token covers, as inclusive ranges. A token smaller than a cell
 * covers the cell its centre is in.
 */
export function tokenCells(grid: Grid, t: Transform) {
  const span = (centre: number, size: number, offset: number) => {
    const lo = Math.round((centre - size / 2 - offset) / grid.size);
    const hi = Math.round((centre + size / 2 - offset) / grid.size) - 1;
    if (hi >= lo) return [lo, hi] as const;
    const c = Math.floor((centre - offset) / grid.size);
    return [c, c] as const;
  };
  const [index0, index1] = span(t.x, t.w, grid.offsetX);
  const [index0_, index1_] = span(t.y, t.h, grid.offsetY);
  return { i0: index0, i1: index1, j0: index0_, j1: index1_ };
}

/**
 * The distance between two tokens, edge to edge, in the scene's units.
 * On a grid, tokens in neighbouring cells are one cell apart (5 ft); with no
 * grid, touching tokens are 0 apart.
 */
export function tokenDistance(grid: Grid, a: Transform, b: Transform): number {
  if (grid.type === "square") {
    const p = tokenCells(grid, a);
    const q = tokenCells(grid, b);
    const di = Math.max(0, q.i0 - p.i1, p.i0 - q.i1);
    const dj = Math.max(0, q.j0 - p.j1, p.j0 - q.j1);
    return steps(di, dj, grid.diagonal) * grid.unit;
  }
  if (grid.type === "hex") {
    // A big token reaches about half its width in hexes from its centre.
    const reach = (t: Transform) => Math.floor(Math.round(Math.max(t.w, t.h) / grid.size) / 2);
    const d = hexSteps(hexAt(grid, a), hexAt(grid, b)) - reach(a) - reach(b);
    return Math.max(d, 0) * grid.unit;
  }
  const gap = Math.hypot(b.x - a.x, b.y - a.y) - Math.max(a.w, a.h) / 2 - Math.max(b.w, b.h) / 2;
  return toUnits(grid, Math.max(0, gap));
}

/** A length in world px, in the scene's units. */
export function toUnits(grid: Grid, px: number): number {
  return (px / grid.size) * grid.unit;
}

/** "30 ft"; a decimal place only when the distance isn't whole. */
export function formatDistance(grid: Grid, distance: number): string {
  return `${Math.round(distance * 10) / 10} ${grid.unitName}`.trim();
}

/** A range: up to `normal`, or out to `long` at a cost (5.5e: disadvantage). */
export interface Range {
  normal: number;
  long?: number;
}

/** Whether a distance is within a range, at long range, or out of it. */
export function inRange(distance: number, range: Range): "long" | "normal" | "out" {
  if (distance <= range.normal) return "normal";
  if (range.long !== undefined && distance <= range.long) return "long";
  return "out";
}

/**
 * How long a straight stretch of dx × dy world px is, in the scene's units:
 * on a square grid, with the scene's rule for diagonals.
 */
export function lengthUnits(grid: Grid, dx: number, dy: number): number {
  if (grid.type !== "square") return toUnits(grid, Math.hypot(dx, dy));
  return steps(dx / grid.size, dy / grid.size, grid.diagonal) * grid.unit;
}

/**
 * What a shape measures, in the scene's units, and where in the world each
 * measure belongs: a rectangle's sides under it, a circle's radius (or an
 * ellipse's width and height), a line's or cone's length, and each side of
 * a polygon by that side. Lengths follow the scene's rule for diagonals.
 */
export function shapeMeasures(
  grid: Grid,
  shape: ShapeGeometry & Transform,
): { text: string; at: Point }[] {
  const cos = Math.cos(shape.rot);
  const sin = Math.sin(shape.rot);
  /** A length along the shape's width, and one along its height. */
  const along = (px: number) => formatDistance(grid, lengthUnits(grid, px * cos, px * sin));
  const athwart = (px: number) => formatDistance(grid, lengthUnits(grid, -px * sin, px * cos));
  const across = `${along(shape.w)} × ${athwart(shape.h)}`;
  const at = (x: number, y: number) => fromLocal(shape, { x, y });
  const even = along(shape.w) === athwart(shape.h);
  if (shape.shape === "rect") return [{ text: across, at: at(0, shape.h / 2) }];
  if (shape.shape === "circle")
    return [{ text: even ? `${along(shape.w / 2)} radius` : across, at: at(0, 0) }];
  if (shape.shape === "line") return [{ text: along(shape.w), at: at(0, 0) }];
  if (shape.shape === "cone")
    return [
      {
        text: even ? along(shape.w) : `${along(shape.w)} long, ${athwart(shape.h)} wide`,
        at: at(0, 0),
      },
    ];
  const corners = shapeOutline(shape, shape.w, shape.h).map((p) => at(p.x, p.y));
  return corners.map((a, index) => {
    const b = corners[(index + 1) % corners.length]!;
    return {
      text: formatDistance(grid, lengthUnits(grid, b.x - a.x, b.y - a.y)),
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  });
}
