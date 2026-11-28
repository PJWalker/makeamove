import { describe, expect, it } from "vitest";
import { DEFAULT_DETECT, outlinePaths, wallsAlong } from "../detectWalls";
import type { Greyscale } from "../../media/greyscale";
import { DEFAULT_GRID } from "../grid";
import { wallEnds } from "../vision";

const CELL = 6;
const grid = { ...DEFAULT_GRID, size: 70 };

/** A dark image with light rectangles cut out of it, given in samples. */
function image(
  width: number,
  height: number,
  rooms: [number, number, number, number][],
): Greyscale {
  const data = new Float32Array(width * height).fill(0.1);
  for (const [x0, y0, x1, y1] of rooms)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 0.9;
  return { width, height, scale: 1, data };
}

/** Detect walls on a map placed with its top left corner at the world's origin, a sample per CELL of the grid. */
function detect(shades: Greyscale) {
  const paths = outlinePaths(shades, DEFAULT_DETECT, CELL);
  const w = (shades.width / CELL) * grid.size;
  const h = (shades.height / CELL) * grid.size;
  const frame = { x: w / 2, y: h / 2, w, h, rot: 0 };
  return wallsAlong(
    paths,
    { frame, width: shades.width, height: shades.height },
    { grid, existing: [] },
  );
}

/** Each wall's ends, rounded, as "x,y x,y" either way round. */
const ends = (walls: ReturnType<typeof detect>) =>
  walls
    .map((t) => {
      const { a, b } = wallEnds(t);
      return [a, b]
        .map((p) => `${String(Math.round(p.x))},${String(Math.round(p.y))}`)
        .sort()
        .join(" ");
    })
    .sort();

describe("detecting walls", () => {
  it("walls in a lit room with four walls along the grid", () => {
    // A room from cell (1, 1) to cell (5, 4) of a 7 × 6 map.
    const walls = detect(image(42, 36, [[6, 6, 30, 24]]));
    expect(ends(walls)).toEqual([
      "350,280 350,70",
      "350,280 70,280",
      "350,70 70,70",
      "70,280 70,70",
    ]);
  });

  it("ignores specks too small to be walls", () => {
    const shades = image(42, 36, [[0, 0, 42, 36]]);
    shades.data[100] = 0;
    expect(detect(shades)).toEqual([]);
  });

  it("walls each side of a dark line across a floor, stopping at the map's edge", () => {
    const shades = image(42, 36, [
      [0, 0, 42, 12],
      [0, 18, 42, 36],
    ]);
    expect(ends(detect(shades))).toEqual(["0,140 490,140", "0,210 490,210"]);
  });

  it("skips walls that are already there", () => {
    const shades = image(42, 36, [[6, 6, 30, 24]]);
    const first = detect(shades);
    const paths = outlinePaths(shades, DEFAULT_DETECT, CELL);
    const frame = { x: 245, y: 210, w: 490, h: 420, rot: 0 };
    expect(wallsAlong(paths, { frame, width: 42, height: 36 }, { grid, existing: first })).toEqual(
      [],
    );
  });
});
