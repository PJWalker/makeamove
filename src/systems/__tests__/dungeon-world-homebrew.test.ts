import { md } from "../../macros/markdown.macro" with { type: "macro" };
import { describe, expect, it } from "vitest";
import { plainText } from "../../core/richText";
import * as Y from "yjs";
import { dungeonWorld } from "../dungeon-world";
import { performMove } from "../../features/characters/moves";
import {
  characterView,
  createCharacter,
  derive,
  actionsFor,
} from "../../features/characters/store";
import {
  deleteHomebrew,
  isHomebrew,
  listHomebrew,
  saveGear,
  saveMove,
  withHomebrew,
  type HomebrewEntry,
} from "../../features/homebrew/homebrew";

describe("homebrew", () => {
  const doc = () => new Y.Doc().getMap<HomebrewEntry>("homebrew");

  it("saves gear and moves under their own ids, and edits in place", () => {
    const map = doc();
    const id = saveGear(map, { id: "", name: "Lucky Coin", description: "", weight: 0, tags: [] });
    expect(isHomebrew(id)).toBe(true);
    saveGear(map, { id, name: "Lucky Coin", description: "Shiny.", weight: 0, tags: [] });
    expect(listHomebrew(map)).toMatchObject([
      { id, kind: "gear", item: { description: "Shiny." } },
    ]);
    deleteHomebrew(map, id);
    expect(map.size).toBe(0);
  });

  it("joins the system, so a learned homebrew move rolls with its stat and outcomes", () => {
    const map = doc();
    const id = saveMove(map, {
      id: "",
      name: "Sing the Old Song",
      category: "basic",
      trigger: "When you sing",
      text: md("Roll +CHA."),
      steps: [
        {
          kind: "check",
          stat: "cha",
          outcomes: { strong: md("They listen."), weak: md("Some listen."), miss: md("Silence.") },
        },
      ],
    });
    const system = withHomebrew(dungeonWorld, listHomebrew(map));
    expect(system.actions.at(-1)?.id).toBe(id);
    expect(withHomebrew(dungeonWorld, [])).toBe(dungeonWorld);

    const chars = new Y.Doc().getMap<Y.Map<unknown>>("characters");
    const cid = createCharacter(chars, system, {
      name: "Lux",
      owner: "me",
      scores: { cha: 16 },
      data: { classId: "bard" },
    });
    chars.get(cid)!.set("learned", [id]);
    const c = characterView(cid, chars.get(cid)!, system);
    const move = actionsFor(c, system, derive(c, system)).find((a) => a.id === id)!;
    const r = performMove(system, move, c, derive(c, system), {}, () => 5);
    expect(r.roll?.total).toBe(12);
    expect(plainText(r.outcome)).toBe("They listen.");
  });
});
