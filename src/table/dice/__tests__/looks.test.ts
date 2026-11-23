import { describe, expect, it } from "vite-plus/test";
import { looksOf } from "../looks";

const shown = (sides: number, value: number) =>
  looksOf(sides, value, "red").map((look) => `${look.form} d${look.sides} ${look.label(look.shown)}`);

describe("how a die is drawn", () => {
  it("draws a d100 as a tens d10 and a units d10", () => {
    expect(shown(100, 47)).toEqual(["die d10 40", "die d10 7"]);
    expect(shown(100, 7)).toEqual(["die d10 00", "die d10 7"]);
    expect(shown(100, 30)).toEqual(["die d10 30", "die d10 0"]);
    expect(shown(100, 100)).toEqual(["die d10 00", "die d10 0"]);
  });

  it("draws the standard dice as their own solids", () => {
    expect(shown(6, 4)).toEqual(["die d6 4"]);
    expect(shown(10, 10)).toEqual(["die d10 10"]);
  });

  it("draws any other die as a chip numbered from 1", () => {
    expect(shown(7, 5)).toEqual(["chip d7 5"]);
    expect(shown(3, 1)).toEqual(["chip d3 1"]);
  });
});
