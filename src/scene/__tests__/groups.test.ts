import { describe, expect, it } from "vite-plus/test";
import { regroup, withGroups } from "../groups";
import { arrange } from "../stacking";
import type { SceneElement } from "../types";

const at = (
  id: string,
  { x, z, group }: { x: number; z: string; group?: string },
): SceneElement => ({
  id,
  type: "drawing",
  layer: "over",
  z,
  x,
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
  at("a", { x: 0, z: "a0", group: "g" }),
  at("b", { x: 2, z: "a1" }),
  at("c", { x: 4, z: "a2", group: "g" }),
  at("d", { x: 6, z: "a3" }),
];

describe("groups", () => {
  it("are picked whole", () => {
    expect(withGroups(els, ["a"], null)).toEqual(["a", "c"]);
  });

  it("are picked one member at a time while open", () => {
    expect(withGroups(els, ["a"], "g")).toEqual(["a"]);
  });

  it("gather under their topmost member when made", () => {
    const patches = new Map(arrange(els, ["a", "c"], { to: "together" }));
    const order = els
      .map((element) => ({ ...element, ...patches.get(element.id) }))
      .sort((p, q) => (p.z < q.z ? -1 : 1))
      .map((element) => element.id);
    expect(order).toEqual(["b", "a", "c", "d"]);
  });

  it("step forward as one, ending up together", () => {
    const patches = new Map(arrange(els, ["a", "c"], { to: "forward" }));
    const order = els
      .map((element) => ({ ...element, ...patches.get(element.id) }))
      .sort((p, q) => (p.z < q.z ? -1 : 1))
      .map((element) => element.id);
    expect(order).toEqual(["b", "d", "a", "c"]);
  });

  it("are copied as new groups of their own", () => {
    const copies = regroup([{ group: "g" }, { group: "g" }, {}]);
    expect(copies[0]!.group).not.toBe("g");
    expect(copies[1]!.group).toBe(copies[0]!.group);
    expect(copies[2]!.group).toBeUndefined();
  });
});
