import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  advanceBond,
  bondBetween,
  bondsFor,
  forgeBond,
  layoutWeb,
  relationshipsOf,
  relationshipWeb,
  removeRelationship,
  setRelationship,
  setRelationshipDepth,
} from "../relationships";

function cast(...ids: string[]) {
  const characters = new Y.Doc().getMap<Y.Map<any>>("characters");
  for (const id of ids) characters.set(id, new Y.Map());
  return characters;
}

describe("relationships", () => {
  it("are one-way, labelled, and gone with their notes when removed", () => {
    const chars = cast("ayla", "brom", "cass");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Resents");
    setRelationship(chars, "ayla", "ayla", "Loves");
    expect(relationshipsOf(chars, "ayla")).toEqual([{ to: "brom", label: "Trusts", depth: 0 }]);
    setRelationshipDepth(chars, "ayla", "brom", 2);
    setRelationship(chars, "ayla", "brom", "Trusts deeply");
    expect(relationshipsOf(chars, "ayla")).toEqual([
      { to: "brom", label: "Trusts deeply", depth: 2 },
    ]);
    chars.get("ayla")!.set("text:rel:brom", new Y.XmlFragment());
    removeRelationship(chars, "ayla", "brom");
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(chars.get("ayla")!.has("text:rel:brom")).toBe(false);
  });

  it("keeps relationship Depth directional and clamps it to the beta track", () => {
    const chars = cast("ayla", "brom");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Resents");
    setRelationshipDepth(chars, "ayla", "brom", 8);
    expect(relationshipsOf(chars, "ayla")[0]?.depth).toBe(3);
    expect(relationshipsOf(chars, "brom")[0]?.depth).toBe(0);
    setRelationshipDepth(chars, "ayla", "brom", -1);
    expect(relationshipsOf(chars, "ayla")[0]?.depth).toBe(0);
  });

  it("forges a shared Bond only after both Depth tracks reach three", () => {
    const chars = cast("ayla", "brom");
    const systemData = chars.doc!.getMap("systemData");
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "comrades")).toBe(false);
    setRelationshipDepth(chars, "brom", "ayla", 3);
    chars.get("ayla")!.set("text:rel:brom", new Y.XmlFragment());
    chars.get("brom")!.set("text:rel:ayla", new Y.XmlFragment());

    expect(forgeBond(systemData, chars, "brom", "ayla", "comrades")).toBe(true);
    expect(bondBetween(systemData, "brom", "ayla")).toEqual({
      first: "ayla",
      second: "brom",
      type: "comrades",
      advancedMoves: [],
    });
    expect(bondsFor(systemData, "ayla")).toHaveLength(1);
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(relationshipsOf(chars, "brom")).toEqual([]);
    expect(chars.get("ayla")!.has("text:rel:brom")).toBe(false);
    expect(chars.get("brom")!.has("text:rel:ayla")).toBe(false);
  });

  it("tracks Bond advances once and resets them when a pair forges a different Bond", () => {
    const chars = cast("ayla", "brom");
    const systemData = chars.doc!.getMap("systemData");
    for (const id of ["ayla", "brom"]) {
      const data = new Y.Map<any>();
      data.set("xp", 0);
      chars.get(id)!.set("data", data);
    }
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3);
    setRelationshipDepth(chars, "brom", "ayla", 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "comrades")).toBe(true);
    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3);
    expect(advanceBond(systemData, chars, "brom", "ayla", "back-to-back")).toBe(false);
    setRelationshipDepth(chars, "brom", "ayla", 3);
    chars.get("ayla")!.set("text:rel:brom", new Y.XmlFragment());
    chars.get("brom")!.set("text:rel:ayla", new Y.XmlFragment());
    expect(advanceBond(systemData, chars, "brom", "ayla", "back-to-back")).toBe(true);
    expect(advanceBond(systemData, chars, "ayla", "brom", "back-to-back")).toBe(false);
    expect(bondBetween(systemData, "ayla", "brom")?.advancedMoves).toEqual(["back-to-back"]);
    expect(relationshipsOf(chars, "ayla")).toEqual([]);
    expect(chars.get("ayla")!.has("text:rel:brom")).toBe(false);

    setRelationship(chars, "ayla", "brom", "Trusts");
    setRelationship(chars, "brom", "ayla", "Respects");
    setRelationshipDepth(chars, "ayla", "brom", 3);
    setRelationshipDepth(chars, "brom", "ayla", 3);
    expect(forgeBond(systemData, chars, "ayla", "brom", "rivals")).toBe(true);
    expect(bondBetween(systemData, "ayla", "brom")?.advancedMoves).toEqual([]);
    expect(chars.get("ayla")!.get("data").get("xp")).toBe(1);
    expect(chars.get("brom")!.get("data").get("xp")).toBe(1);
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
