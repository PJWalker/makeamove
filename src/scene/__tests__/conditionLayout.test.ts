import { describe, expect, it } from "vite-plus/test";

import {
  conditionContains,
  conditionLayout,
  hoverSpring,
  type ConditionLayoutInput,
} from "../conditionLayout";

const input: ConditionLayoutInput = {
  x: 200,
  y: 200,
  tokenWidth: 200,
  radius: 5,
  labels: [
    { w: 60, h: 24 },
    { w: 80, h: 24 },
    { w: 50, h: 24 },
  ],
  viewport: { x: 0, y: 0, w: 800, h: 600 },
  obstacles: [],
};

describe("condition layout", () => {
  it("automatically shows names only when the whole row comfortably fits", () => {
    expect(conditionLayout(input).inline).toBe(false);
    expect(conditionLayout({ ...input, tokenWidth: 240 }).inline).toBe(true);
    expect(conditionLayout({ ...input, tokenWidth: 240, x: 20 }).inline).toBe(false);
    expect(
      conditionLayout({
        ...input,
        tokenWidth: 240,
        obstacles: [{ x: 190, y: 180, w: 40, h: 40 }],
      }).inline,
    ).toBe(false);
  });

  it("arranges every condition upward from the pip row", () => {
    const layout = conditionLayout(input);
    expect(layout.vertical).toHaveLength(3);
    expect(conditionContains(layout.vertical[2]!, 200, 200)).toBe(true);
    expect(layout.vertical[2]!.y + layout.vertical[2]!.h).toBe(input.y + input.radius);
    expect(layout.vertical[0]!.y + layout.vertical[0]!.h).toBeLessThan(layout.vertical[1]!.y);
    expect(layout.vertical[1]!.y + layout.vertical[1]!.h).toBeLessThan(layout.vertical[2]!.y);
    expect(new Set(layout.vertical.map((box) => box.w)).size).toBe(1);
  });

  it("opens downward when there is not enough room above", () => {
    const layout = conditionLayout({ ...input, y: 20 });
    expect(layout.vertical[0]!.y).toBe(15);
    expect(layout.vertical[2]!.y).toBeGreaterThan(20);
  });

  it("keeps edge lists inside the viewport and includes more than six conditions", () => {
    const layout = conditionLayout({
      ...input,
      x: 790,
      y: 5,
      labels: Array.from({ length: 8 }, () => ({ w: 100, h: 24 })),
    });
    expect(layout.vertical).toHaveLength(8);
    for (const box of layout.vertical) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(800);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.h).toBeLessThanOrEqual(600);
    }
  });

  it("uses a settling spring with a small overshoot", () => {
    expect(hoverSpring(0)).toBe(0);
    expect(hoverSpring(0.3)).toBeGreaterThan(1);
    expect(hoverSpring(1)).toBe(1);
  });
});
