import { describe, expect, it } from "vite-plus/test";
import type { Point } from "../grid";
import { LENIENCY, recogniseShape } from "../recognise";

/** A wobbly hand along a path: points every few px, jittered, as flat [x, y, pressure, …]. */
function hand(path: Point[], wobble = 2, seed = 1): number[] {
  let s = seed;
  const random = () => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647 - 0.5;
  };
  const out: number[] = [];
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1]!;
    const b = path[index]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push(a.x + (b.x - a.x) * t + random() * wobble, a.y + (b.y - a.y) * t + random() * wobble, 0.5);
    }
  }
  const end = path.at(-1)!;
  out.push(end.x, end.y, 0.5);
  return out;
}

/** An ellipse about the origin, or `turns` of the way round one. */
/** A closed path through `corners` whose edges bow out by `bow` px, as a loose hand draws them. */
function bowed(corners: Point[], bow: number): Point[] {
  const middle = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length,
    y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length,
  };
  return [...corners, corners[0]!].flatMap((a, index, loop) => {
    const b = loop[index + 1];
    if (!b) return [a];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const out = Math.hypot(m.x - middle.x, m.y - middle.y);
    return [a, { x: m.x + ((m.x - middle.x) / out) * bow, y: m.y + ((m.y - middle.y) / out) * bow }];
  });
}

const ellipse = (rx: number, ry: number, turns = 1): Point[] =>
  Array.from({ length: 65 }, (_, index) => {
    const a = (index / 64) * Math.PI * 2 * turns;
    return { x: rx * Math.cos(a), y: ry * Math.sin(a) };
  });

describe("neatening curves", () => {
  it("straightens a line", () => {
    const shape = recogniseShape(hand([{ x: 0, y: 0 }, { x: 200, y: 3 }]), 10);
    expect(shape).toMatchObject({ shape: "line", rot: 0 });
    expect(shape!.w).toBeCloseTo(200, -1);
  });

  it("rounds a circle", () => {
    const shape = recogniseShape(hand(ellipse(80, 76)), 10);
    expect(shape).toMatchObject({ shape: "circle", rot: 0 });
    expect(shape!.w).toBe(shape!.h);
    expect(shape!.w).toBeCloseTo(156, -1);
    expect(shape!.x).toBeCloseTo(0, -1);
  });

  it("rounds a slightly oval circle", () => {
    const shape = recogniseShape(hand(ellipse(80, 64)), 10);
    expect(shape).toMatchObject({ shape: "circle", rot: 0 });
    expect(shape!.w).toBe(shape!.h);
  });

  it("rounds a loosely drawn circle", () => {
    expect(recogniseShape(hand(ellipse(80, 76), 8), 10)).toMatchObject({ shape: "circle" });
  });

  it("keeps an ellipse's proportions", () => {
    const shape = recogniseShape(hand(ellipse(120, 50)), 10);
    expect(shape).toMatchObject({ shape: "circle" });
    expect(shape!.w).toBeCloseTo(240, -1);
    expect(shape!.h).toBeCloseTo(100, -1);
  });
});

describe("neatening rectangles", () => {
  it("squares a rectangle", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 200, y: 4 },
      { x: 198, y: 100 },
      { x: -3, y: 98 },
      { x: 0, y: 2 },
    ];
    const shape = recogniseShape(hand(corners), 10);
    expect(shape).toMatchObject({ shape: "rect", rot: 0 });
    expect(shape!.w).toBeCloseTo(200, -1);
    expect(shape!.h).toBeCloseTo(97, -1);
  });

  it("squares a near-square", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 100, y: 2 },
      { x: 101, y: 84 },
      { x: 1, y: 85 },
      { x: 0, y: 1 },
    ];
    const shape = recogniseShape(hand(corners), 10);
    expect(shape).toMatchObject({ shape: "rect", rot: 0 });
    expect(shape!.w).toBe(shape!.h);
  });

  it("squares a loosely drawn rectangle", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(recogniseShape(hand(bowed(corners, 12)), 10)).toMatchObject({ shape: "rect" });
  });
});

describe("neatening other corners", () => {
  it("makes an isosceles triangle a cone from its apex", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 150, y: -70 },
      { x: 150, y: 70 },
      { x: 2, y: 1 },
    ];
    const shape = recogniseShape(hand(corners), 10);
    expect(shape).toMatchObject({ shape: "cone", rot: 0 });
    expect(shape!.w).toBeCloseTo(150, -1);
    expect(shape!.h).toBeCloseTo(140, -1);
  });

  it("keeps the corners of other polygons", () => {
    const hexagon = Array.from({ length: 7 }, (_, index) => ({
      x: 100 * Math.cos((index / 6) * Math.PI * 2),
      y: 100 * Math.sin((index / 6) * Math.PI * 2),
    }));
    const shape = recogniseShape(hand(hexagon), 10);
    expect(shape?.shape === "polygon" ? shape.points : []).toHaveLength(12);
  });
});

describe("leaving strokes freehand", () => {
  it("leaves loosely drawn polygons alone", () => {
    const arrow = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 60 },
      { x: 120, y: 60 },
      { x: 60, y: 160 },
      { x: 0, y: 60 },
    ];
    expect(recogniseShape(hand(bowed(arrow, 10)), 10)).toBeNull();
  });

  it("leaves polygons of many corners alone", () => {
    const octagon = Array.from({ length: 9 }, (_, index) => ({
      x: 100 * Math.cos((index / 8) * Math.PI * 2),
      y: 100 * Math.sin((index / 8) * Math.PI * 2),
    }));
    expect(recogniseShape(hand(octagon), 10)?.shape).not.toBe("polygon");
  });

  it("leaves squiggles and arcs alone", () => {
    const squiggle = Array.from({ length: 40 }, (_, index) => ({ x: index * 8, y: (index % 2) * 40 }));
    expect(recogniseShape(hand(squiggle), 10)).toBeNull();
    expect(recogniseShape(hand(ellipse(80, 80, 0.6)), 10)).toBeNull();
  });

  it("leaves strokes smaller than the least size alone", () => {
    expect(recogniseShape(hand([{ x: 0, y: 0 }, { x: 8, y: 0 }], 0), 10)).toBeNull();
  });
});

/** A lumpy loop about the origin: a circle whose radius swells and shrinks `lumps` times round. */
const lumpy = (r: number, lumps: number, depth: number): Point[] =>
  Array.from({ length: 97 }, (_, index) => {
    const a = (index / 96) * Math.PI * 2;
    const swell = 1 + depth * Math.sin(lumps * a);
    return { x: r * swell * Math.cos(a), y: r * swell * Math.sin(a) };
  });

const always = (path: Point[]) => recogniseShape(hand(path), 10, LENIENCY.always);

describe("always finding a shape", () => {
  it("rounds a lumpy loop into a circle", () => {
    expect(always(lumpy(80, 3, 0.15))).toMatchObject({ shape: "circle" });
  });

  it("takes any triangle for a cone and any four corners for a rectangle", () => {
    expect(always([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 60, y: 90 }, { x: 0, y: 0 }])).toMatchObject({ shape: "cone" });
    const skewed = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 240, y: 100 }, { x: 40, y: 100 }, { x: 0, y: 0 }];
    expect(always(skewed)).toMatchObject({ shape: "rect" });
  });

  it("closes an arc into a circle, and straightens a wandering stroke into a line", () => {
    expect(always(ellipse(80, 80, 0.75))).toMatchObject({ shape: "circle" });
    const wander = Array.from({ length: 20 }, (_, index) => ({ x: index * 15, y: (index % 2) * 18 }));
    expect(always(wander)).toMatchObject({ shape: "line" });
  });
});

describe("finding the shape a stroke is near", () => {
  it("finds a circle in a loop too lumpy to neaten by itself", () => {
    const loop = hand(lumpy(80, 3, 0.22));
    expect(recogniseShape(loop, 10)).toBeNull();
    expect(recogniseShape(loop, 10, LENIENCY.near)).toMatchObject({ shape: "circle" });
  });
});
