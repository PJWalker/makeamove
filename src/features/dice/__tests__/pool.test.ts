import { describe, expect, it } from "vite-plus/test";
import { roll } from "../notation";
import { chipText, poolFormula, type TrayPick } from "../pool";

const d = (...sides: number[]): TrayPick[] => sides.map((s) => ({ kind: "die", sides: s }));
const plus: TrayPick = { kind: "modifier", value: 1 };
const minus: TrayPick = { kind: "modifier", value: -1 };

describe("dice pool", () => {
  it("groups dice by type, in the order first picked", () => {
    expect(poolFormula(d(20))).toBe("1d20");
    expect(poolFormula(d(20, 20))).toBe("2d20");
    expect(poolFormula(d(20, 6, 20, 4))).toBe("2d20+1d6+1d4");
  });
  it("adds the tokens' net modifier after the dice", () => {
    expect(poolFormula([...d(20), plus, plus])).toBe("1d20+2");
    expect(poolFormula([minus, ...d(6, 6)])).toBe("2d6-1");
    expect(poolFormula([...d(8), plus, minus])).toBe("1d8");
  });
  it("rolls tokens on their own as a number, or nothing when they cancel", () => {
    expect(poolFormula([plus])).toBe("1");
    expect(poolFormula([minus, minus])).toBe("-2");
    expect(poolFormula([plus, minus])).toBe("");
  });
  it("adds each stat as a labelled number after the modifier", () => {
    const str: TrayPick = { kind: "stat", stat: "STR", value: 2 };
    const dex: TrayPick = { kind: "stat", stat: "DEX", value: -1 };
    expect(poolFormula([...d(20), str, plus])).toBe("1d20+1+2[STR]");
    expect(poolFormula([dex])).toBe("-1[DEX]");
    expect(roll(poolFormula([...d(6), str, dex]), () => 4).total).toBe(5);
  });
  it("writes a chip's face with its sign, under its label", () => {
    expect(chipText(1)).toBe("+1");
    expect(chipText(-2)).toBe("−2");
    expect(chipText(0, "WIS")).toBe("WIS\n+0");
  });
  it("makes formulas the roller understands", () => {
    expect(roll(poolFormula([...d(8, 8, 6), minus]), () => 1).total).toBe(2);
    expect(roll(poolFormula([minus, minus])).total).toBe(-2);
  });
});
