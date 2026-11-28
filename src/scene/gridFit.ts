import type { ImageGrid } from "../media/gridDetect";
import { alignFrame, alignScale, alignScales } from "./alignMap";
import type { Box, Cells, Frame, Scales } from "./alignMap";
import { gridPitch, nearestGridPoint } from "./grid";
import type { Grid } from "./grid";
import type { Transform } from "./types";

const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF;
/** Radians off a quarter turn a map may be and still count as square to the grid. */
const SQUARE_SLOP = 1e-6;

/** Whether `rot` is a whole number of quarter turns, and if so whether an odd one, which swaps the map's sides. */
function quarterTurns(rot: number): "even" | "odd" | null {
  const turns = rot / QUARTER_TURN;
  const whole = Math.round(turns);
  if (Math.abs(turns - whole) * QUARTER_TURN > SQUARE_SLOP) return null;
  return Number.isInteger(whole * HALF) ? "even" : "odd";
}

const swapped = (f: Frame): Frame => ({ x: f.x, y: f.y, w: f.h, h: f.w });

/**
 * Where `map` goes so a box drawn over `cells` of its own covers that
 * many of the grid's cells, with the box's corner on a grid point. It may
 * stretch slightly (see alignScales) only while it sits square to the
 * grid; turned any other way, it keeps its shape. Null without a grid.
 */
export function fitBox(
  map: Transform,
  { box, cells }: { box: Box; cells: Cells },
  grid: Grid,
): Frame | null {
  const pitch = gridPitch(grid);
  if (!pitch) return null;
  const turns = quarterTurns(map.rot);
  const s = alignScale(box, cells, pitch);
  const scales: Scales = turns ? alignScales(box, cells, pitch) : { sx: s, sy: s };
  // The map's sides along the axes: swapped while it's turned on its side.
  const frame = { x: map.x, y: map.y, w: map.w, h: map.h };
  const across = turns === "odd" ? swapped(frame) : frame;
  const fitted = alignFrame(across, { from: box, to: nearestGridPoint(grid, box), ...scales });
  return turns === "odd" ? swapped(fitted) : fitted;
}

/**
 * Where a map goes so the square grid drawn on its image lines up with
 * the scene's: one of its cells made one of the scene's, with a corner on
 * a grid point. Null unless the scene's grid is square too.
 */
export function fitImageGrid(map: Transform, found: ImageGrid, grid: Grid): Frame | null {
  if (grid.type !== "square") return null;
  const px = map.w / found.width;
  const cell = {
    x: map.x - map.w * HALF + found.x * px,
    y: map.y - map.h * HALF + found.y * px,
    w: found.cell * px,
    h: found.cell * px,
  };
  return fitBox(map, { box: cell, cells: { across: 1, down: 1 } }, grid);
}
