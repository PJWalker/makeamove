import { describe, expect, it } from "vite-plus/test";
import { exploreKey, newSights } from "../explore";
import { insidePolygon, pairs } from "../geometry";
import { DEFAULT_GRID } from "../grid";
import type { Point } from "../grid";
import type { SceneElement } from "../types";
import { sightPolygon } from "../vision";

const grid = { ...DEFAULT_GRID, type: "square" as const, size: 100 };

const base = { layer: "over" as const, z: "a", locked: false, createdBy: "", rot: 0, h: 4 };

const wall = (id: string, a: Point, b: Point): SceneElement => ({
  ...base,
  id,
  type: "wall",
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  w: Math.hypot(b.x - a.x, b.y - a.y),
  rot: Math.atan2(b.y - a.y, b.x - a.x),
});

const map: SceneElement = {
  ...base,
  id: "map",
  type: "map",
  layer: "map",
  x: 500,
  y: 500,
  w: 1000,
  h: 1000,
  image: { hash: "h", mime: "image/png", width: 1000, height: 1000 },
};

const token = (id: string, at: Point): SceneElement => ({
  ...base,
  id,
  type: "token",
  layer: "token",
  x: at.x,
  y: at.y,
  w: 100,
  h: 100,
  name: id,
  colour: "#fff",
  characterId: id,
});

// A room on the left, its east wall from (400, 0) to (400, 1000).
const eastWall = wall("east", { x: 400, y: 0 }, { x: 400, y: 1000 });

describe("what a character sees from one place", () => {
  it("reaches as far as the map with nothing in the way", () => {
    const sight = pairs(sightPolygon({ x: 200, y: 200 }, [], { x: 0, y: 0, w: 1000, h: 1000 }));
    expect(insidePolygon(sight, { x: 990, y: 990 })).toBe(true);
    expect(insidePolygon(sight, { x: 10, y: 990 })).toBe(true);
    expect(insidePolygon(sight, { x: 1010, y: 500 })).toBe(false);
  });

  it("stops at walls, so the far side stays unseen", () => {
    const sight = pairs(
      sightPolygon({ x: 200, y: 500 }, [{ a: { x: 400, y: 0 }, b: { x: 400, y: 1000 } }], {
        x: 0,
        y: 0,
        w: 1000,
        h: 1000,
      }),
    );
    expect(insidePolygon(sight, { x: 390, y: 500 })).toBe(true);
    expect(insidePolygon(sight, { x: 390, y: 50 })).toBe(true);
    expect(insidePolygon(sight, { x: 410, y: 500 })).toBe(false);
    expect(insidePolygon(sight, { x: 900, y: 900 })).toBe(false);
  });

  it("sees past the end of a wall, but not behind it", () => {
    // A short wall from (300, 450) to (300, 550), seen from (100, 500).
    const sight = pairs(
      sightPolygon({ x: 100, y: 500 }, [{ a: { x: 300, y: 450 }, b: { x: 300, y: 550 } }], {
        x: 0,
        y: 0,
        w: 1000,
        h: 1000,
      }),
    );
    expect(insidePolygon(sight, { x: 600, y: 500 })).toBe(false);
    expect(insidePolygon(sight, { x: 600, y: 200 })).toBe(true);
    expect(insidePolygon(sight, { x: 600, y: 800 })).toBe(true);
  });
});

describe("exploring", () => {
  it("remembers what a character sees where they stand, once per place", () => {
    const last = new Map<string, Point>();
    const known = new Set<string>();
    const pc = token("pc", { x: 150, y: 150 });
    const first = newSights([map, eastWall, pc], [pc], {
      grid,
      known: (k) => known.has(k),
      last,
    });
    expect([...first.keys()]).toEqual([exploreKey(grid, { x: 150, y: 150 })]);
    const sight = pairs(first.values().next().value!);
    expect(insidePolygon(sight, { x: 300, y: 900 })).toBe(true);
    expect(insidePolygon(sight, { x: 600, y: 150 })).toBe(false);
    for (const k of first.keys()) known.add(k);
    // Standing still, nothing new.
    expect(
      newSights([map, eastWall, pc], [pc], { grid, known: (k) => known.has(k), last }).size,
    ).toBe(0);
  });

  it("remembers the places a character passes through on the way", () => {
    const last = new Map<string, Point>([["pc", { x: 50, y: 150 }]]);
    const pc = token("pc", { x: 350, y: 150 });
    const sights = newSights([map, eastWall, pc], [pc], { grid, known: () => false, last });
    // Every half cell along the way.
    expect(sights.size).toBe(7);
    expect(last.get("pc")).toEqual({ x: 350, y: 150 });
  });

  it("doesn't remember a way through a wall, only where the character ends up", () => {
    const last = new Map<string, Point>([["pc", { x: 150, y: 150 }]]);
    const pc = token("pc", { x: 650, y: 150 });
    const sights = newSights([map, eastWall, pc], [pc], { grid, known: () => false, last });
    expect([...sights.keys()]).toEqual([exploreKey(grid, { x: 650, y: 150 })]);
  });
});
