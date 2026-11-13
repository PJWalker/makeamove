import { describe, expect, it } from "vite-plus/test";
import { pinInside, pointerToward, unionRect } from "../edgePin";

const viewport = { x: 0, y: 0, w: 100, h: 100 };

describe("pinInside", () => {
  it("leaves a box inside alone", () => {
    expect(pinInside({ x: 10, y: 10, w: 20, h: 20 }, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("brings a box in from past any edge", () => {
    expect(pinInside({ x: -50, y: 30, w: 20, h: 10 }, viewport)).toEqual({ x: 50, y: 0 });
    expect(pinInside({ x: 30, y: 300, w: 20, h: 10 }, viewport)).toEqual({ x: 0, y: -210 });
  });

  it("keeps the top left of a box bigger than the viewport in", () => {
    expect(pinInside({ x: 50, y: 0, w: 200, h: 10 }, viewport)).toEqual({ x: -50, y: 0 });
  });
});

describe("unionRect", () => {
  it("spans every box", () => {
    expect(
      unionRect([
        { x: 0, y: 5, w: 10, h: 10 },
        { x: 20, y: 0, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 25, h: 15 });
  });
});

describe("pointerToward", () => {
  const box = { x: 40, y: 40, w: 20, h: 20 };

  it("points nowhere at something inside the box", () => {
    expect(pointerToward(box, { x: 50, y: 50 })).toBeNull();
  });

  it("sits just past the box's edge, its tip toward the target", () => {
    const [tip, a, b] = pointerToward(box, { x: 50, y: 500 }, 8, 4)!;
    expect(tip!.x).toBeCloseTo(50);
    expect(tip!.y).toBeCloseTo(60 + 4 + 8);
    expect(a!.y).toBeCloseTo(64);
    expect(b!.y).toBeCloseTo(64);
    expect(Math.abs(a!.x - b!.x)).toBeCloseTo(9.6);
  });
});
