import { describe, expect, it } from "vite-plus/test";
import { dropArrangement, elementLabel, layerList, rowIds } from "../layerList";
import { arrange } from "../stacking";
import type { Layer, SceneElement } from "../types";

const at = (
  id: string,
  { z, layer = "over", group }: { z: string; layer?: Layer; group?: string },
): SceneElement => ({
  id,
  type: "drawing",
  layer,
  z,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  rot: 0,
  locked: false,
  createdBy: "",
  points: [0, 0, 1],
  colour: "#fff",
  width: 2,
  bw: 10,
  bh: 10,
  ...(group ? { group } : {}),
});

const els = [
  at("map", { z: "a0", layer: "map" }),
  at("a", { z: "a0", group: "g" }),
  at("b", { z: "a1" }),
  at("c", { z: "a2", group: "g" }),
];

describe("the list of what's on a scene", () => {
  it("shows layers and their rows from the top down, a group where its topmost member is", () => {
    const list = layerList(els);
    expect(list.map((s) => s.layer)).toEqual(["over", "token", "under", "map"]);
    expect(list[0]!.rows.map((row) => rowIds(row))).toEqual([["c", "a"], ["b"]]);
    expect(list[3]!.rows.map((row) => rowIds(row))).toEqual([["map"]]);
  });

  it("calls an element by its name, or else by what it is", () => {
    expect(elementLabel(at("a", { z: "a0" }))).toBe("Drawing");
    expect(elementLabel({ ...at("a", { z: "a0" }), name: "Cart tracks" })).toBe("Cart tracks");
  });

  it("drops a row just under the row it's dropped below", () => {
    const how = dropArrangement(els, new Set(["b"]), { layer: "over", under: ["c", "a"] });
    const patches = new Map(arrange(els, ["b"], how));
    const order = els
      .filter((element) => element.layer === "over")
      .map((element) => ({ ...element, ...patches.get(element.id) }))
      .sort((p, q) => (p.z < q.z ? -1 : 1))
      .map((element) => element.id);
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("drops a row just under an open group's heading, over its top member", () => {
    const how = dropArrangement(els, new Set(["b"]), { layer: "over", over: "c" });
    const patches = new Map(arrange(els, ["b"], how));
    const order = els
      .filter((element) => element.layer === "over")
      .map((element) => ({ ...element, ...patches.get(element.id) }))
      .sort((p, q) => (p.z < q.z ? -1 : 1))
      .map((element) => element.id);
    expect(order).toEqual(["a", "c", "b"]);
  });

  it("drops a row at the top of a layer, even an empty one", () => {
    const how = dropArrangement(els, new Set(["b"]), { layer: "token" });
    expect(arrange(els, ["b"], how).map(([id, { layer }]) => [id, layer])).toEqual([
      ["b", "token"],
    ]);
  });
});
