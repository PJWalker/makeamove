import { describe, expect, it } from "vite-plus/test";
import { BAR_CHANGE_MS, barChangeFrame } from "../barChange";

describe("barChangeFrame", () => {
  const hit = { from: 0.8, to: 0.3, delta: -5, start: 0, grownFrom: 0 };
  const heal = { from: 0.3, to: 0.8, delta: 5, start: 0, grownFrom: 0 };

  it("drops a hit's fill at once and drains what was lost after a beat", () => {
    expect(barChangeFrame(hit, 0)).toMatchObject({ fill: 0.3, ghost: 0.8, ghostHot: true });
    expect(barChangeFrame(hit, 300).ghost).toBeCloseTo(0.8);
    expect(barChangeFrame(hit, 1100).ghost).toBeCloseTo(0.3);
  });

  it("shows a heal's gain at once and swells the fill into it", () => {
    expect(barChangeFrame(heal, 0)).toMatchObject({ fill: 0.3, ghost: 0.8 });
    expect(barChangeFrame(heal, 900).fill).toBeCloseTo(0.8);
  });

  it("shakes only on a hit", () => {
    expect(barChangeFrame(hit, 100).shakeX).not.toBe(0);
    expect(barChangeFrame(heal, 100).shakeX).toBe(0);
  });

  it("grows the bar, then settles back to its size", () => {
    expect(barChangeFrame(hit, 0).grow).toBe(0);
    expect(barChangeFrame(hit, 800).grow).toBeCloseTo(1, 1);
    const end = barChangeFrame(hit, BAR_CHANGE_MS);
    expect(end.grow).toBeCloseTo(0);
    expect(end.alpha).toBe(0);
    expect(end.done).toBe(true);
  });

  it("stays grown when a change cuts into another", () => {
    expect(barChangeFrame({ ...hit, grownFrom: 1 }, 0).grow).toBe(1);
  });
});
