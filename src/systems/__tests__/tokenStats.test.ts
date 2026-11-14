import { describe, expect, it } from "vite-plus/test";
import { listSystems } from "..";
import type { CharacterView } from "../../features/characters/types";
import { HP_COLOURS, hpColour, tokenStatValue } from "../tokenStats";

describe("hit point bars", () => {
  it("colours by how much of the maximum is left", () => {
    expect(hpColour(10, 10)).toBe(HP_COLOURS.healthy);
    expect(hpColour(5, 10)).toBe(HP_COLOURS.hurt);
    expect(hpColour(2, 10)).toBe(HP_COLOURS.critical);
  });
});

describe("a token's stats", () => {
  const character = {
    kind: "pc",
    resources: { hp: 7 },
    data: { stress: 3 },
  } as unknown as CharacterView;
  const derived = { values: { maxHp: 10, maxStress: 9 } } as never;

  it("say where on the character each value is kept, so they can be changed from the token", () => {
    const stats = listSystems().flatMap((system) => system.tokenStats(character, derived));
    expect(stats.length).toBeGreaterThan(0);
    for (const stat of stats) expect(tokenStatValue(character, stat)).toBe(stat.value);
  });
});
