import { describe, expect, it } from "vite-plus/test";

import { rank, scoreAction } from "../search";
import type { Action } from "../types";
import { command } from "../types";

const testCommand = command({
  id: "test.action",
  params: (value): value is undefined => value === undefined,
  title: "Test",
  run: () => {},
});

const act = (id: string, title: string, extra: Partial<Action> = {}): Action => ({
  id,
  command: testCommand,
  params: undefined,
  kind: "command",
  title,
  source: "Core",
  available: true,
  run: () => {},
  ...extra,
});

const hs = act("move:hs", "Hack and Slash", {
  kind: "move",
  aliases: ["H&S", "melee"],
  tags: ["fight"],
});
const volley = act("move:volley", "Volley", { kind: "move" });
const ping = act("tool:ping", "Ping", { kind: "tool" });
const fit = act("cmd:fit", "Fit to scene");

describe("scoreAction", () => {
  it("matches misspellings and ranks exact results higher", () => {
    expect(scoreAction(act("x", "Strike"), "strkie")).toBeGreaterThan(0);
    expect(rank([act("typo", "Strkie"), act("exact", "Strike")], "strike")[0]!.id).toBe("exact");
  });

  it("matches aliases and tags, and needs every word to match", () => {
    expect(scoreAction(hs, "melee")).toBeGreaterThan(0);
    expect(scoreAction(hs, "h&s")).toBeGreaterThan(0);
    expect(scoreAction(hs, "fight")).toBeGreaterThan(0);
    expect(scoreAction(hs, "hack volley")).toBe(0);
  });

  it("finds letters in order as a last resort", () => {
    expect(scoreAction(hs, "hs")).toBeGreaterThan(0);
    expect(scoreAction(volley, "xz")).toBe(0);
  });

  it("ignores case and accents", () => {
    expect(scoreAction(act("x", "Café"), "CAFE")).toBeGreaterThan(0);
  });
});

describe("rank", () => {
  const all = [fit, ping, hs, volley];

  it("does not narrow results based on a leading character", () => {
    expect(rank(all, "/ping").map((a) => a.id)).toContain("tool:ping");
  });

  it("shows recents then own moves when nothing is typed", () => {
    const mine = { ...volley, mine: true };
    expect(
      rank([fit, ping, hs, mine], "", { recent: ["tool:ping", "gone"] }).map((a) => a.id),
    ).toEqual(["tool:ping", "move:volley"]);
  });

  it("ranks the selected character, recents and available actions higher", () => {
    const a = act("a", "Strike");
    const b = act("b", "Strike", { mine: true });
    expect(rank([a, b], "strike")[0]!.id).toBe("b");
    expect(rank([a, act("c", "Strike")], "strike", { recent: ["c"] })[0]!.id).toBe("c");
    const off = act("d", "Strike", { available: "No character selected" });
    expect(rank([off, a], "strike")[0]!.id).toBe("a");
    expect(rank([off], "strike")).toHaveLength(1);
  });

  it("keeps registration order for ties", () => {
    expect(rank([act("1", "Roll"), act("2", "Roll")], "roll").map((a) => a.id)).toEqual(["1", "2"]);
  });
});
