import { describe, expect, it } from "vite-plus/test";

import { ADJECTIVES, tokenName } from "../templates";

const goblin = { name: "Goblin" };

describe("naming a template’s tokens", () => {
  it("numbers them after the highest number taken", () => {
    const t = { naming: "number" as const, names: [] };
    expect(tokenName(goblin, t, [])).toBe("Goblin 1");
    expect(tokenName(goblin, t, ["Goblin 1", "Goblin 4", "Ogre 9"])).toBe("Goblin 5");
  });
  it("picks a name from the list that isn’t taken, then numbers them", () => {
    const t = { naming: "list" as const, names: ["Snag", "Grub"] };
    expect(tokenName(goblin, t, ["Snag"])).toBe("Grub");
    expect(tokenName(goblin, t, ["Snag", "Grub"], () => 0)).toBe("Snag 1");
    // An empty list falls back to numbers.
    expect(tokenName(goblin, { naming: "list", names: [] }, [])).toBe("Goblin 1");
  });
  it("puts a random adjective before the name, never one already used", () => {
    const t = { naming: "adjective" as const, names: [] };
    expect(tokenName(goblin, t, [], () => 0)).toBe(`${ADJECTIVES[0]} Goblin`);
    expect(tokenName(goblin, t, [`${ADJECTIVES[0]} Goblin`], () => 0)).toBe(
      `${ADJECTIVES[1]} Goblin`,
    );
  });
});
