import { describe, expect, it } from "vite-plus/test";
import { arrange } from "../stacking";
import type { Arrangement } from "../stacking";
import type { Layer, SceneElement } from "../types";

/** A square drawing at x, at an order in its layer. */
const at = (
  id: string,
  { x, z, layer = "over" }: { x: number; z: string; layer?: Layer },
): SceneElement => ({
  id,
  type: "drawing",
  layer,
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
});

/** The ids of each layer, bottom to top, after arranging. */
function after(
  elements: SceneElement[],
  ids: string[],
  how: Arrangement,
): Partial<Record<Layer, string[]>> {
  const patches = new Map(arrange(elements, ids, how));
  const placed = elements.map((element) => ({ ...element, ...patches.get(element.id) }));
  // Each has its own order, so none compare equal.
  placed.sort((a, b) => (a.z < b.z ? -1 : 1));
  const out: Partial<Record<Layer, string[]>> = {};
  for (const element of placed) (out[element.layer] ??= []).push(element.id);
  return out;
}

const overlapping = [
  at("a", { x: 0, z: "a0" }),
  at("b", { x: 2, z: "a1" }),
  at("c", { x: 4, z: "a2" }),
  at("d", { x: 6, z: "a3" }),
];

describe("stepping forward and backward", () => {
  it("brings forward past the next element above it", () => {
    expect(after(overlapping, ["a"], { to: "forward" }).over).toEqual(["b", "a", "c", "d"]);
  });

  it("sends backward past the next element below it", () => {
    expect(after(overlapping, ["c"], { to: "backward" }).over).toEqual(["a", "c", "b", "d"]);
  });

  it("steps past only what it overlaps", () => {
    const apart = [
      at("a", { x: 0, z: "a0" }),
      at("far", { x: 500, z: "a1" }),
      at("b", { x: 2, z: "a2" }),
    ];
    expect(after(apart, ["a"], { to: "forward" }).over).toEqual(["far", "b", "a"]);
  });

  it("leaves the topmost element where it is when brought forward", () => {
    expect(arrange(overlapping, ["d"], { to: "forward" })).toEqual([]);
  });
});

describe("arranging several elements", () => {
  it("keeps several moved elements in their order", () => {
    expect(after(overlapping, ["a", "b"], { to: "forward" }).over).toEqual(["c", "a", "b", "d"]);
    expect(after(overlapping, ["b", "d"], { to: "front" }).over).toEqual(["a", "c", "b", "d"]);
    expect(after(overlapping, ["b", "d"], { to: "back" }).over).toEqual(["b", "d", "a", "c"]);
  });

  it("moves elements into another layer at a place among what's there", () => {
    const els = [
      ...overlapping,
      at("t1", { x: 0, z: "a0", layer: "token" }),
      at("t2", { x: 0, z: "a1", layer: "token" }),
    ];
    const result = after(els, ["b"], { to: "layer", layer: "token", index: 1 });
    expect(result.token).toEqual(["t1", "b", "t2"]);
    expect(result.over).toEqual(["a", "c", "d"]);
  });

  it("only gives new orders to what moved", () => {
    const patches = arrange(overlapping, ["a"], { to: "front" });
    expect(patches.map(([id]) => id)).toEqual(["a"]);
  });
});
