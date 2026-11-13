import { describe, expect, it } from "vite-plus/test";
import { HP_COLOURS, hpColour } from "../tokenStats";

describe("hit point bars", () => {
  it("colours by how much of the maximum is left", () => {
    expect(hpColour(10, 10)).toBe(HP_COLOURS.healthy);
    expect(hpColour(5, 10)).toBe(HP_COLOURS.hurt);
    expect(hpColour(2, 10)).toBe(HP_COLOURS.critical);
  });
});
