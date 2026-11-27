import type { ImageGrid } from "../media/gridDetect";
import { alignFrame, alignScale } from "./alignMap";
import type { Frame } from "./alignMap";
import { gridPitch, nearestGridPoint } from "./grid";
import type { Grid } from "./grid";

const HALF = 0.5;

/**
 * Where a map goes so the square grid drawn on its image lines up with
 * the scene's: one of its cells made one of the scene's, with a corner on
 * a grid point. Null unless the scene's grid is square too.
 */
export default function fitImageGrid(map: Frame, found: ImageGrid, grid: Grid): Frame | null {
  const pitch = gridPitch(grid);
  if (grid.type !== "square" || !pitch) return null;
  const px = map.w / found.width;
  const cell = {
    x: map.x - map.w * HALF + found.x * px,
    y: map.y - map.h * HALF + found.y * px,
    w: found.cell * px,
    h: found.cell * px,
  };
  const s = alignScale(cell, { across: 1, down: 1 }, pitch);
  return alignFrame(map, { from: cell, to: nearestGridPoint(grid, cell), s });
}
