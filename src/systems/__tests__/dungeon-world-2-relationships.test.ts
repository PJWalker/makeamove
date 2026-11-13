import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { advanceBond, bondBetween, bondsFor, forgeBond } from "../dungeon-world-2/bondStore";
import {
  layoutWeb,
  relationshipNotes,
  relationshipsOf,
  relationshipWeb,
  removeRelationship,
  setRelationship,
  setRelationshipDepth,
} from "../../features/characters/relationships";
import { rootOf } from "../../data/schema";
import { campaignShape } from "../../campaign/schema";
import { SystemData } from "../../campaign/systemStore";

function cast(...ids: string[]) {
  const root = rootOf(new Y.Doc(), campaignShape);
  for (const id of ids) root.characters.set(id, {});
  return root.characters;
}

/** A campaign's system data, in the same document as the characters. */
const systemDataOf = (chars: ReturnType<typeof cast>) =>
  new SystemData(rootOf(chars.y.doc!, campaignShape).ext, () => "dungeon-world-2");

/** Give a character the rich-text notes for one relationship. */
const writeNotes = (chars: ReturnType<typeof cast>, from: string, to: string) =>
  chars.get(from)!.ensure("texts").ensure(relationshipNotes(to));
const notesOf = (chars: ReturnType<typeof cast>, from: string, to: string) =>
  chars.get(from)!.get("texts")?.get(relationshipNotes(to));
const xpOf = (chars: ReturnType<typeof cast>, id: string) =>
  chars.get(id)!.get("ext")?.get("dungeon-world-2")?.get("data")?.get("xp");
const awardXp = (chars: ReturnType<typeof cast>) => (id: string, xp: number) => {
  const data = chars.get(id)!.ensure("ext").ensure("dungeon-world-2").ensure("data");
  data.set("xp", Number(data.get("xp") ?? 0) + xp);
};

describe("relationships", () => {
  it("are one-way, labelled, and gone with their notes when removed", () => {
    const chars = cast("ayla", "brom", "cass");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Resents");
    setRelationship(chars, "ayla", "ayla", "Loves");
    expect(relationshipsOf(chars, "ayla")).toEqual([{ to: "brom", label: "Trusts", depth: 0 }]);
    setRelationshipDepth(chars, "ayla", "brom", 2, 3);
    setRelationship(chars, "ayla", "brom", "Trusts deeply");
    expect(relationshipsOf(chars, "ayla")).toEqual([
      { to: "brom", label: "Trusts deeply", depth: 2 },
    ]);
    writeNotes(chars, "ayla", "brom");
    removeRelationship(chars, "ayla", "brom");
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(notesOf(chars, "ayla", "brom")).toBeUndefined();
  });

  it("keeps relationship Depth directional and clamps it to the beta track", () => {
    const chars = cast("ayla", "brom");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Resents");
    setRelationshipDepth(chars, "ayla", "brom", 8, 3);
    expect(relationshipsOf(chars, "ayla")[0]?.depth).toBe(3);
    expect(relationshipsOf(chars, "brom")[0]?.depth).toBe(0);
    setRelationshipDepth(chars, "ayla", "brom", -1, 3);
    expect(relationshipsOf(chars, "ayla")[0]?.depth).toBe(0);
  });

  it("forges a shared Bond only after both Depth tracks reach three", () => {
    const chars = cast("ayla", "brom");
    const systemData = systemDataOf(chars);
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3, 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "comrades", awardXp(chars))).toBe(false);
    setRelationshipDepth(chars, "brom", "ayla", 3, 3);
    writeNotes(chars, "ayla", "brom");
    writeNotes(chars, "brom", "ayla");

    expect(forgeBond(systemData, chars, "brom", "ayla", "comrades", awardXp(chars))).toBe(true);
    expect(bondBetween(systemData, "brom", "ayla")).toEqual({
      first: "ayla",
      second: "brom",
      type: "comrades",
      advancedMoves: [],
    });
    expect(bondsFor(systemData, "ayla")).toHaveLength(1);
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(relationshipsOf(chars, "brom")).toEqual([]);
    expect(notesOf(chars, "ayla", "brom")).toBeUndefined();
    expect(notesOf(chars, "brom", "ayla")).toBeUndefined();
  });

  it("tracks Bond advances once and resets them when a pair forges a different Bond", () => {
    const chars = cast("ayla", "brom");
    const systemData = systemDataOf(chars);
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3, 3);
    setRelationshipDepth(chars, "brom", "ayla", 3, 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "comrades", awardXp(chars))).toBe(true);
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3, 3);
    expect(advanceBond(systemData, chars, "brom", "ayla", "back-to-back")).toBe(false);
    setRelationshipDepth(chars, "brom", "ayla", 3, 3);
    writeNotes(chars, "ayla", "brom");
    writeNotes(chars, "brom", "ayla");
    expect(advanceBond(systemData, chars, "brom", "ayla", "back-to-back")).toBe(true);
    expect(advanceBond(systemData, chars, "ayla", "brom", "back-to-back")).toBe(false);
    expect(bondBetween(systemData, "ayla", "brom")?.advancedMoves).toEqual(["back-to-back"]);
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(notesOf(chars, "ayla", "brom")).toBeUndefined();

    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3, 3);
    setRelationshipDepth(chars, "brom", "ayla", 3, 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "rivals", awardXp(chars))).toBe(true);
    expect(bondBetween(systemData, "ayla", "brom")?.advancedMoves).toEqual([]);
    expect(xpOf(chars, "ayla")).toBe(1);
    expect(xpOf(chars, "brom")).toBe(1);
  });

  it("leave out characters that are gone or not shown", () => {
    const chars = cast("ayla", "brom", "cass");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "ayla", "cass", "Fears");
    chars.delete("cass");
    expect(relationshipsOf(chars, "ayla").map((r) => r.to)).toEqual(["brom"]);
    expect(relationshipWeb(chars, ["ayla"])).toEqual([]);
  });

  it("lays the web out inside the box, keeping fixed nodes where they are", () => {
    const ids = ["a", "b", "c", "d"];
    const edges = [{ from: "a", to: "b", label: "" }];
    const pos = layoutWeb(ids, edges, { width: 500, height: 300, fixed: { d: { x: 50, y: 50 } } });
    expect(pos.d).toEqual({ x: 50, y: 50 });
    const point = (id: string) => {
      const value = pos[id];
      if (!value) throw new Error(`Missing test position ${id}`);
      return value;
    };
    for (const id of ids) {
      expect(point(id).x).toBeGreaterThanOrEqual(40);
      expect(point(id).x).toBeLessThanOrEqual(460);
    }
    // Related characters end up closer than unrelated ones.
    const dist = (p: string, q: string) =>
      Math.hypot(point(p).x - point(q).x, point(p).y - point(q).y);
    expect(dist("a", "b")).toBeLessThan(dist("a", "c"));
  });
});
