import { describe, expect, it } from "vitest";
import { dungeonWorld as dw } from "../dungeon-world";
import { derive } from "../../features/characters/store";
import type { CharacterView } from "../../features/characters/types";
import {
  canPayMove,
  performMove,
  planMove,
  resolveDifficulty,
} from "../../features/characters/moves";
import { parse } from "../../features/dice/notation";

const char = (over: Partial<CharacterView> = {}): CharacterView => ({
  id: "c1",
  kind: "pc",
  name: "Ayla",
  owner: "me",
  scores: { str: 16, dex: 9, con: 12, int: 8, wis: 13, cha: 6 },
  data: {
    classId: "fighter",
    level: 1,
    race: "",
    alignment: "",
    xp: 0,
    coin: 0,
    hpBonus: 0,
  },
  resources: { hp: 10 },
  conditions: [],
  durations: {},
  modifiers: {},
  fields: {},
  inventory: [],
  learned: [],
  ...over,
});
const move = (id: string) => dw.actions.find((m) => m.id === id)!;
const seq = (...vals: number[]) => {
  let i = 0;
  if (!vals.length) throw new RangeError("Dice fixture needs at least one result");
  return () => vals[i++ % vals.length]!;
};

describe("planMove", () => {
  it("aggregates resource costs and rejects an unaffordable combination before rolling", () => {
    const action = {
      ...move("spout-lore"),
      steps: [
        {
          kind: "check" as const,
          outcomes: {},
          rollBonuses: [
            { id: "first", label: "First", valueField: "first", cost: { resource: "hope", by: 1 } },
            {
              id: "second",
              label: "Second",
              valueField: "second",
              cost: { resource: "hope", by: 1 },
            },
          ],
        },
      ],
    };
    const character = char({ data: { first: 2, second: 2 }, resources: { hope: 1 } });
    const choice = { rollBonuses: ["first", "second"] };
    const plan = planMove(dw, action, character, derive(character, dw), choice);
    expect(plan.resources).toEqual([{ id: "hope", by: -2 }]);
    expect(canPayMove(character, plan)).toBe(false);
    expect(() =>
      performMove(dw, action, character, derive(character, dw), choice, () => {
        throw new Error("Dice should not roll");
      }),
    ).toThrow("Not enough resources");
  });

  it("lets systems turn bonuses into dice while preserving spending and raw results", () => {
    const system = {
      ...dw,
      checkRoll: (formula: string) => {
        const count = parse(formula).reduce(
          (sum, term) => sum + (term.kind === "flat" ? term.sign * term.value : 0),
          0,
        );
        return count > 0 ? `${count}d6kh1` : "2d6kl1";
      },
      result: (
        _total: number,
        _natural: number[],
        rolled?: import("../../features/dice/notation").Roll,
      ) => {
        const first = rolled?.terms[0];
        return first?.kind === "dice" && first.dice.filter((die) => die.value === 6).length > 1
          ? "strong"
          : "weak";
      },
    };
    const c = char({ modifiers: { forward: 1 } });
    const result = performMove(
      system,
      move("hack-and-slash"),
      c,
      derive(c, system),
      {},
      seq(6, 6, 2),
    );
    expect(result.roll?.formula).toBe("3d6kh1");
    expect(result.roll?.total).toBe(6);
    expect(result.result).toBe("strong");
    expect(result.spent).toEqual(["forward"]);
  });

  it("adds the stat modifier with a label", () => {
    const c = char();
    expect(planMove(dw, move("hack-and-slash"), c, derive(c, dw)).formula).toBe("2d6+2[STR]");
  });

  it("applies debilities, forward and ongoing", () => {
    const c = char({ conditions: ["weak"], modifiers: { forward: 1, ongoing: -1 } });
    expect(planMove(dw, move("hack-and-slash"), c, derive(c, dw)).formula).toBe(
      "2d6+2[STR]-1[Weak]+1[Forward]-1[Ongoing]",
    );
  });

  it("uses the chosen stat for Defy Danger and the bond for Aid", () => {
    const c = char();
    const d = derive(c, dw);
    expect(planMove(dw, move("defy-danger"), c, d, { stat: "wis" }).formula).toBe("2d6+1[WIS]");
    expect(planMove(dw, move("aid-or-interfere"), c, d, { ask: 1 }).formula).toBe("2d6+1[Bond]");
  });

  it("keeps the stat at +0, so the roll shows which stat it used", () => {
    const c = char();
    expect(planMove(dw, move("defy-danger"), c, derive(c, dw), { stat: "dex" }).formula).toBe(
      "2d6+0[DEX]",
    );
  });
});

describe("performMove", () => {
  it("resolves fixed, derived, prompted, and target difficulties consistently", () => {
    const derived = derive(char(), dw);
    expect(resolveDifficulty({ kind: "fixed", value: 12 }, derived, 99)).toBe(12);
    expect(resolveDifficulty({ kind: "derived", value: "maxHp" }, derived)).toBe(22);
    expect(resolveDifficulty({ kind: "prompt", prompt: "Difficulty", initial: 13 }, derived)).toBe(
      13,
    );
    expect(resolveDifficulty({ kind: "target", value: "ac" }, derived, 14)).toBe(14);
    expect(resolveDifficulty({ kind: "target", value: "ac" }, derived, 14, 17)).toBe(17);
    expect(() => resolveDifficulty({ kind: "fixed", value: NaN }, derived)).toThrow("finite");
    expect(() =>
      resolveDifficulty({ kind: "prompt", prompt: "Difficulty", min: 1 }, derived, 0),
    ).toThrow("range");
  });

  it("uses a prompted default even when the caller omits the choice", () => {
    const system = {
      ...dw,
      result: (
        total: number,
        _natural: number[],
        _roll: unknown,
        context?: { difficulty?: number },
      ) => (total >= (context?.difficulty ?? 0) ? "strong" : "miss"),
    };
    const action = {
      ...move("spout-lore"),
      steps: [
        {
          kind: "check" as const,
          difficulty: { kind: "prompt" as const, prompt: "Difficulty", initial: 13 },
          outcomes: { strong: "Success.", miss: "Failure." },
        },
      ],
    };
    const character = char();
    expect(
      performMove(system, action, character, derive(character, system), {}, seq(6, 6)).result,
    ).toBe("miss");
  });

  it("uses an entered target difficulty for both outcome and hit status", () => {
    const action = {
      ...move("hack-and-slash"),
      steps: [
        {
          kind: "check" as const,
          difficulty: { kind: "target" as const, value: "ac" },
          outcomes: { strong: "Success.", weak: "Mixed.", miss: "Failure." },
        },
      ],
    };
    const character = char();
    const result = performMove(
      dw,
      action,
      character,
      derive(character, dw),
      { difficulty: 15 },
      seq(6, 6),
      { targets: [{ id: "unknown", name: "Unknown defense" }] },
    );
    expect(result.targets?.[0]).toMatchObject({ against: 15, hit: false });
    expect(result.suggestions).toEqual([]);
  });

  it("passes a check difficulty to system result rules without adding it to the formula", () => {
    let seen: { action?: string; difficulty?: number } = {};
    const system = {
      ...dw,
      result: (
        total: number,
        _natural: number[],
        _roll?: import("../../features/dice/notation").Roll,
        context?: { action: { id: string }; difficulty?: number },
      ) => {
        seen = {
          ...(context?.action.id ? { action: context.action.id } : {}),
          ...(context?.difficulty !== undefined ? { difficulty: context.difficulty } : {}),
        };
        return total >= (context?.difficulty ?? 0) ? "strong" : "miss";
      },
    };
    const action = {
      ...move("spout-lore"),
      steps: [
        {
          kind: "check" as const,
          difficulty: { kind: "prompt" as const, prompt: "Difficulty", initial: 13 },
          outcomes: { strong: "Success.", weak: "Mixed.", miss: "Failure." },
        },
      ],
    };
    const c = char();
    const result = performMove(system, action, c, derive(c, system), { difficulty: 13 }, seq(6, 6));
    expect(result.roll?.formula).toBe("2d6");
    expect(result.result).toBe("miss");
    expect(seen).toEqual({ action: "spout-lore", difficulty: 13 });
  });

  it("bands the total and offers follow-ups", () => {
    const c = char();
    const d = derive(c, dw);
    const hit = performMove(dw, move("hack-and-slash"), c, d, {}, seq(6, 6));
    expect(hit.result).toBe("strong");
    expect(hit.suggestions.map((s) => s.id)).toContain("damage");
    expect(hit.suggestions.find((s) => s.id === "damage")).toMatchObject({
      label: "Roll damage (d10)",
      roll: { formula: "d10", comment: "Damage" },
    });
    const miss = performMove(dw, move("hack-and-slash"), c, d, {}, seq(1, 1));
    expect(miss.roll!.total).toBe(4);
    expect(miss.result).toBe("miss");
    expect(miss.suggestions.find((s) => s.id === "xp")).toMatchObject({
      label: "Mark XP",
      bump: { field: "xp", by: 1 },
    });
  });

  it("reads out moves that do not roll", () => {
    const c = char();
    const r = performMove(
      dw,
      dw.actions.find((m) => !m.steps.length)!,
      c,
      derive(c, dw),
    );
    expect(r.roll).toBeUndefined();
    expect(r.outcome).not.toBe("");
  });
});

describe("spending modifiers", () => {
  it("uses up forward on a roll, but not ongoing", () => {
    const c = char({ modifiers: { forward: 2, ongoing: 1 } });
    const r = performMove(dw, move("hack-and-slash"), c, derive(c, dw), {}, seq(3, 3));
    expect(r.spent).toEqual(["forward"]);
  });
});

describe("derive", () => {
  it("computes HP, load and damage from class and scores", () => {
    const d = derive(char(), dw);
    expect(d.values.maxHp).toBe(22);
    expect(d.values.maxLoad).toBe(14);
    expect(d.values.damage).toBe(10);
  });
});
