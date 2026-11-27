import { describe, expect, it } from "vite-plus/test";
import { resizeRect } from "../resizeRect";

const start = { x: 100, y: 100, w: 400, h: 300 };

describe("resizeRect", () => {
  // Edge, clamp and drag-distance rules are proved in resizeRect.ts; rounding is outside the proof's integer model.
  it("rounds to whole pixels", () => {
    expect(resizeRect(start, "e", 10.6, 0).w).toBe(411);
  });
});
