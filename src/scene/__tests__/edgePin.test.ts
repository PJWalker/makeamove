import { describe, expect, it } from "vite-plus/test";
import { pointerToward } from "../edgePin";

// pinInside and unionRect are proved in edgePin.ts.

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
