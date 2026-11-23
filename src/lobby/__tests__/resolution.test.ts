/* eslint-disable @typescript-eslint/no-magic-numbers */
import { describe, expect, it } from "vite-plus/test";
import { govern, governedScale, governor } from "../resolution";
import type { FrameMeasure, Governor } from "../resolution";

function measure(samples: readonly number[], kind: FrameMeasure, ratio = 2): Governor {
  let state = governor();
  for (const milliseconds of samples) state = govern(state, { milliseconds, measure: kind }, ratio);
  return state;
}
const repeat = (milliseconds: number, times: number) =>
  Array.from({ length: times }, () => milliseconds);

describe("the cave's resolution", () => {
  it("holds its resolution at a steady 30 frames a second, as in Low Power Mode", () => {
    const state = measure(repeat(1000 / 30, 600), "interval");
    expect(governedScale(state, 2)).toBe(1);
    expect(state.gaveUp).toBe(false);
  });

  it("ignores the long gaps of a browser holding frames back", () => {
    const state = measure(repeat(1000, 600), "interval");
    expect(governedScale(state, 2)).toBe(1);
    expect(state.gaveUp).toBe(false);
  });

  it("softens the picture when frames fall behind, and gives up when even that can't keep up", () => {
    expect(governedScale(measure(repeat(60, 60), "interval"), 2)).toBe(0.75);
    expect(measure(repeat(60, 600), "interval").gaveUp).toBe(true);
  });

  it("sharpens the picture while the GPU has room, but no finer than the screen", () => {
    expect(governedScale(measure(repeat(2, 600), "gpu", 2), 2)).toBe(1.5);
    expect(governedScale(measure(repeat(2, 600), "gpu", 1), 1)).toBe(1);
  });
});
