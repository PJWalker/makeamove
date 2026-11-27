/* eslint-disable @typescript-eslint/no-magic-numbers -- Worked images: sizes, spacings and shades. */
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../../lib/seededRandom";
import { detectSquareGrid } from "../gridDetect";
import type { Greyscale } from "../greyscale";

interface Painting {
  width: number;
  height: number;
  /** Px between lines across and down; omitted for no grid. */
  cell?: { w: number; h: number };
  /** Where the first lines are. */
  offset?: { x: number; y: number };
  /** How much darker lines are than the floor. */
  contrast?: number;
  /** How noisy the floor is, and how many dark and light patches lie on it. */
  noise?: number;
  patches?: number;
  scale?: number;
}

/** How much of the px from `index` to `index + 1` a 3 px line centred at `centre` covers. */
const coverage = (index: number, centre: number) =>
  Math.max(0, Math.min(index + 1, centre + 1.5) - Math.max(index, centre - 1.5));

/** How much of px `index` lines `spacing` apart, the first at `first`, cover. */
function onLine(index: number, spacing: number, first: number) {
  const k = Math.round((index + 0.5 - first) / spacing);
  return Math.min(1, coverage(index, first + k * spacing));
}

interface Patch {
  x: number;
  y: number;
  r: number;
  shade: number;
}

/** How bright px (x, y) of the painting is. */
function shadeAt(
  { p, patches, random }: { p: Painting; patches: Patch[]; random: () => number },
  x: number,
  y: number,
) {
  let v = 0.7 + (random() - 0.5) * (p.noise ?? 0.1);
  for (const patch of patches)
    if ((x - patch.x) ** 2 + (y - patch.y) ** 2 < patch.r ** 2) v += patch.shade;
  if (!p.cell) return v;
  const line = Math.max(
    onLine(x, p.cell.w, p.offset?.x ?? 0),
    onLine(y, p.cell.h, p.offset?.y ?? 0),
  );
  return v - line * (p.contrast ?? 0.5);
}

/** A map-like image: a mottled floor with patches on it, and maybe a grid over it. */
function paint(p: Painting): Greyscale {
  const random = seededRandom(JSON.stringify(p));
  const { width, height } = p;
  const data = new Float32Array(width * height);
  const patches = Array.from({ length: p.patches ?? 30 }, () => ({
    x: random() * width,
    y: random() * height,
    r: 10 + random() * 80,
    shade: random() * 0.6 - 0.3,
  }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = shadeAt({ p, patches, random }, x, y);
  return { width, height, scale: p.scale ?? 1, data };
}

describe("finding a square grid on a map image", () => {
  it("finds the spacing and where the lines cross", () => {
    const grid = detectSquareGrid(
      paint({ width: 600, height: 500, cell: { w: 50, h: 50 }, offset: { x: 20.5, y: 7.5 } }),
    );
    expect(grid?.cell).toBeCloseTo(50, 1);
    expect(grid?.x).toBeCloseTo(20.5, 0);
    expect(grid?.y).toBeCloseTo(7.5, 0);
  });

  it("finds a spacing that isn't a whole number of px, to within a hundredth", () => {
    const grid = detectSquareGrid(
      paint({ width: 800, height: 600, cell: { w: 37.3, h: 37.3 }, offset: { x: 3, y: 30 } }),
    );
    expect(grid?.cell).toBeCloseTo(37.3, 2);
  });

  it("finds faint lines on a busy map", () => {
    const grid = detectSquareGrid(
      paint({
        width: 700,
        height: 700,
        cell: { w: 64, h: 64 },
        contrast: 0.12,
        noise: 0.3,
        patches: 80,
      }),
    );
    expect(grid?.cell).toBeCloseTo(64, 1);
  });

  it("reports it in the image's own px when it was analysed shrunk", () => {
    const grid = detectSquareGrid(
      paint({
        width: 500,
        height: 400,
        cell: { w: 40, h: 40 },
        offset: { x: 10, y: 10 },
        scale: 4,
      }),
    );
    expect(grid?.cell).toBeCloseTo(160, 0);
    expect(grid?.x).toBeCloseTo(40, -1);
  });
});

describe("finding no square grid on a map image", () => {
  it("finds nothing on a map without a grid", () => {
    expect(detectSquareGrid(paint({ width: 600, height: 500, patches: 60 }))).toBeNull();
  });

  it("finds nothing when the lines aren't square", () => {
    expect(detectSquareGrid(paint({ width: 600, height: 500, cell: { w: 40, h: 60 } }))).toBeNull();
  });
});
