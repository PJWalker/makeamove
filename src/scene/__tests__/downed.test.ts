import { describe, expect, it } from "vite-plus/test";
import { BAR_BREAK_AT } from "../barChange";
import { DOWN_MS, downFrame, downs, isDowned } from "../downed";

const hp = (value: number, max = 10) => ({ id: "hp", label: "HP", value, max, colour: "#000" });

describe("downs", () => {
  it("puts a token down at zero hit points, and only for hit points", () => {
    expect(downs(hp(0))).toBe(true);
    expect(downs(hp(-2))).toBe(true);
    expect(downs(hp(1))).toBe(false);
    expect(downs(hp(0, 0))).toBe(false);
    expect(downs({ ...hp(0), id: "stress" })).toBe(false);
    expect(isDowned([{ ...hp(0), id: "stress" }, hp(3)])).toBe(false);
    expect(isDowned([hp(0)])).toBe(true);
  });
});

describe("downFrame", () => {
  const fall = { from: 0, down: true, start: 0 };
  const rise = { from: 1, down: false, start: 0 };

  it("falls as the bar snaps, and ends upside down and grey", () => {
    expect(downFrame(fall, BAR_BREAK_AT - 1)).toMatchObject({ turn: 0, grey: 0, done: false });
    const end = downFrame(fall, BAR_BREAK_AT + DOWN_MS);
    expect(end).toMatchObject({ turn: 1, grey: 1, done: true });
    expect(end.scale).toBeCloseTo(1);
  });

  it("gets back up at once, upright and in colour", () => {
    expect(downFrame(rise, 0).turn).toBe(1);
    expect(downFrame(rise, DOWN_MS)).toMatchObject({ turn: 0, grey: 0, done: true });
  });

  it("carries on from where it was when it turns around", () => {
    expect(downFrame({ from: 0.4, down: false, start: 0 }, 0).turn).toBeCloseTo(0.4);
  });
});
