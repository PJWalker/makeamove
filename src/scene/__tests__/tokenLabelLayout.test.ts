import { describe, expect, it } from "vitest";
import {
  resolveTokenLabelLayout,
  type TokenLabelPlan,
} from "../tokenLabelLayout";

const box = (id: string, x: number, w: number) => ({ id, x, y: 0, w, h: 10 });

describe("token label layout", () => {
  it("uses wider bars when they do not collide", () => {
    const plan: TokenLabelPlan = {
      id: "one",
      bars: box("one", 5, 20),
      wideBars: box("one", 0, 40),
      name: null,
      small: false,
    };

    expect(resolveTokenLabelLayout([plan], null).bars.get("one")).toEqual(
      plan.wideBars,
    );
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
