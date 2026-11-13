import { describe, expect, it } from "vite-plus/test";

import { resolveTokenLabelLayout, zoomTokenBars, type TokenLabelPlan } from "../tokenLabelLayout";

const box = (id: string, x: number, w: number) => ({ id, x, y: 0, w, h: 10 });

describe("token label layout", () => {
  it("enlarges a hovered bar around its centre without overlapping neighbors or its name", () => {
    const layout = zoomTokenBars({ id: "one", x: 100, y: 200, w: 60, h: 28 }, 12, 4, [1.5, 1]);
    expect(layout.bars[0]!).toEqual({ x: 85, y: 197, w: 90, h: 18 });
    expect(layout.bars[1]!.y).toBe(219);
    expect(layout.nameOffset).toBe(3);
  });

  it("moves enlarged bars immediately with their screen-space anchor", () => {
    const original = zoomTokenBars({ id: "one", x: 100, y: 200, w: 60, h: 12 }, 12, 4, [1.5])
      .bars[0]!;
    const moved = zoomTokenBars({ id: "one", x: 140, y: 180, w: 60, h: 12 }, 12, 4, [1.5]).bars[0]!;
    expect(moved.x - original.x).toBe(40);
    expect(moved.y - original.y).toBe(-20);
    expect(moved.w).toBe(original.w);
  });

  it("uses wider bars when they do not collide", () => {
    const plan: TokenLabelPlan = {
      id: "one",
      bars: box("one", 5, 20),
      wideBars: box("one", 0, 40),
      name: null,
      small: false,
    };

    expect(resolveTokenLabelLayout([plan], null).bars.get("one")).toEqual(plan.wideBars);
  });

  it("falls back to narrow bars when wider bars overlap", () => {
    const first: TokenLabelPlan = {
      id: "first",
      bars: box("first", 0, 20),
      wideBars: box("first", -15, 50),
      name: null,
      small: false,
    };
    const second: TokenLabelPlan = {
      id: "second",
      bars: box("second", 40, 20),
      wideBars: box("second", 25, 50),
      name: null,
      small: false,
    };

    const layout = resolveTokenLabelLayout([first, second], null);
    expect(layout.bars.get("first")).toEqual(first.bars);
    expect(layout.bars.get("second")).toEqual(second.bars);
    expect(layout.showBars).toEqual(new Set(["first", "second"]));
  });

  it("shows a hovered token even when its labels collide", () => {
    const first: TokenLabelPlan = {
      id: "first",
      bars: box("first", 0, 20),
      wideBars: null,
      name: box("first", 0, 30),
      small: true,
    };

    const layout = resolveTokenLabelLayout([first], "first");
    expect(layout.showBars.has("first")).toBe(true);
    expect(layout.showName.has("first")).toBe(true);
  });
});
