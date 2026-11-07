import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Die } from "../../features/dice/notation";
import { RollDie, dieTitle } from "../RollDie";

const titleOf = (die: Die) =>
  /title="([^"]*)"/.exec(
    renderToStaticMarkup(
      <RollDie die={die} index={0} arriving={false} mine seed="s" colour="#445" />,
    ),
  )?.[1];

describe("a rolled die's tooltip", () => {
  it("shows the value rolled, not the size of the die", () => {
    expect(titleOf({ sides: 20, value: 7, kept: true })).toBe("7");
    expect(titleOf({ sides: 6, value: 3, kept: true })).toBe("3");
  });

  it("never names the die's size", () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100])
      expect(dieTitle({ sides, value: 2, kept: true })).not.toContain(`d${sides}`);
  });

  it("notes when the die exploded or was dropped", () => {
    expect(titleOf({ sides: 6, value: 6, kept: true, exploded: true })).toBe("6, exploded");
    expect(titleOf({ sides: 6, value: 1, kept: false })).toBe("1, dropped");
  });
});
