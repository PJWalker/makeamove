import { describe, expect, it } from "vite-plus/test";
import { polygonFrame } from "../geometry";
import { DEFAULT_GRID } from "../grid";
import type { Grid } from "../grid";
import alignToGrid from "../gridAlign";
import type { RecognisedShape } from "../recognise";

const grid: Grid = { ...DEFAULT_GRID, type: "square", size: 50 };

describe("lining boxes up with the grid", () => {
  it("moves a rectangle's sides onto the grid lines they're near", () => {
    const rect: RecognisedShape = { shape: "rect", x: 52, y: 77, w: 98, h: 152, rot: 0 };
    expect(alignToGrid(rect, grid)).toEqual({ shape: "rect", x: 50, y: 75, w: 100, h: 150, rot: 0 });
  });

  it("rounds a circle drawn about cells onto their edges", () => {
    const circle: RecognisedShape = { shape: "circle", x: 51, y: 49, w: 104, h: 104, rot: 0 };
    expect(alignToGrid(circle, grid)).toEqual({ shape: "circle", x: 50, y: 50, w: 100, h: 100, rot: 0 });
  });

  it("leaves a box with a side between grid lines as drawn", () => {
    const rect: RecognisedShape = { shape: "rect", x: 50, y: 75, w: 125, h: 150, rot: 0 };
    expect(alignToGrid(rect, grid)).toBe(rect);
  });
});

describe("lining ends and corners up with the grid", () => {
  it("moves a line's ends onto grid corners, cell centres or the middles of cell sides", () => {
    const line: RecognisedShape = { shape: "line", x: 62.5, y: 25, w: 123, h: 1, rot: 0.016 };
    expect(alignToGrid(line, grid)).toMatchObject({ x: 62.5, y: 25, w: 125, rot: 0 });
  });

  it("puts a cone's tip on the grid and its size in whole cells", () => {
    const cone: RecognisedShape = { shape: "cone", x: 76, y: -2, w: 147, h: 154, rot: 0 };
    expect(alignToGrid(cone, grid)).toMatchObject({ x: 75, y: 0, w: 150, h: 150, rot: 0 });
  });

  it("moves a polygon's corners onto grid corners", () => {
    const polygon: RecognisedShape = { shape: "polygon", ...polygonFrame([{ x: 2, y: -3 }, { x: 148, y: 4 }, { x: 52, y: 97 }]) };
    expect(alignToGrid(polygon, grid)).toEqual({
      shape: "polygon",
      ...polygonFrame([{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 50, y: 100 }]),
    });
  });

  it("leaves a polygon with a corner off the grid as drawn", () => {
    const polygon: RecognisedShape = { shape: "polygon", ...polygonFrame([{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 75, y: 120 }]) };
    expect(alignToGrid(polygon, grid)).toBe(polygon);
  });
});

describe("other grids", () => {
  it("leaves shapes as drawn without a square grid", () => {
    const rect: RecognisedShape = { shape: "rect", x: 52, y: 77, w: 98, h: 152, rot: 0 };
    expect(alignToGrid(rect, { ...grid, type: "hex" })).toBe(rect);
    expect(alignToGrid(rect, { ...grid, type: "none" })).toBe(rect);
  });
});
