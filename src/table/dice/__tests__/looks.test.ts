import { describe, expect, it } from "vite-plus/test";
import { looksOf } from "../looks";

/** How each piece of a die of `sides` that rolled `rolled` is drawn: its form, sides and the face it shows. */
const drawn = ({ sides, rolled }: { sides: number; rolled: number }) =>
  looksOf(sides, rolled, "red").map(
    (look) => `${look.form} d${String(look.sides)} ${look.label(look.shown)}`,
  );

describe("how a die is drawn", () => {
  it("draws a d100 as a tens d10 and a units d10", () => {
    expect(drawn({ sides: 100, rolled: 47 })).toEqual(["die d10 40", "die d10 7"]);
    expect(drawn({ sides: 100, rolled: 7 })).toEqual(["die d10 00", "die d10 7"]);
    expect(drawn({ sides: 100, rolled: 30 })).toEqual(["die d10 30", "die d10 0"]);
    expect(drawn({ sides: 100, rolled: 100 })).toEqual(["die d10 00", "die d10 0"]);
  });

  it("draws the standard dice as their own solids", () => {
    expect(drawn({ sides: 6, rolled: 4 })).toEqual(["die d6 4"]);
    expect(drawn({ sides: 10, rolled: 10 })).toEqual(["die d10 10"]);
  });

  it("draws any other die as a chip numbered from 1", () => {
    expect(drawn({ sides: 7, rolled: 5 })).toEqual(["chip d7 5"]);
    expect(drawn({ sides: 2, rolled: 2 })).toEqual(["chip d2 2"]);
  });
});
