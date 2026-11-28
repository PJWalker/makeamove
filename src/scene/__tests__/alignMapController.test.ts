import { describe, expect, it, vi } from "vite-plus/test";
import { setup, token } from "./controllerHarness";
import type { Fire } from "./controllerHarness";

vi.mock("../../platform/device", () => ({ device: { value: { id: "x" } } }));
vi.mock("../../media/images", () => ({
  importImage: vi.fn(),
  imageColour: vi.fn(() => Promise.resolve(null)),
}));

const alignedMap = {
  ...token("map", 100, 100),
  type: "map",
  layer: "map",
  w: 200,
  h: 200,
  image: { hash: "h" },
};
const near = (n: number): unknown => expect.closeTo(n);
const drag = (fire: Fire, from: [number, number], to: [number, number]) => {
  fire("pointerdown", ...from);
  fire("pointermove", ...to);
  fire("pointerup", ...to);
};

describe("aligning a map to the grid", () => {
  it("makes a box drawn over one of the map's squares one grid square, on the grid", () => {
    const { c, renderer, scene, fire } = setup([alignedMap]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [60, 60], [10, 10]);
    // 50 px squares become 70 px, about the box's corner, which moves to the grid point (0, 0).
    expect(scene.update).toHaveBeenLastCalledWith([
      ["map", { x: near(126), y: near(126), w: near(280), h: near(280) }],
    ]);
    expect(c.aligning.value?.drawn?.cells).toEqual({ across: 1, down: 1 });
  });

  it("lines it up again from how it was when told the box covers more squares", () => {
    const { c, renderer, scene, fire } = setup([alignedMap]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [10, 10], [60, 60]);
    c.setAlignCells({ across: 2, down: 2 });
    expect(scene.update).toHaveBeenLastCalledWith([
      ["map", { x: near(252), y: near(252), w: near(560), h: near(560) }],
    ]);
  });

  it("stops when the map is no longer the selection", () => {
    const { c } = setup([alignedMap]);
    c.alignMap("map");
    c.select([]);
    expect(c.aligning.value).toBeNull();
  });
});

describe("aligning a map that changes meanwhile", () => {
  it("stops when the map is locked", () => {
    const els: object[] = [alignedMap];
    const { c, change } = setup(els);
    c.alignMap("map");
    els[0] = { ...alignedMap, locked: true };
    change();
    expect(c.aligning.value).toBeNull();
  });

  it("carries on after its own move, and stops after anything else moves the map", () => {
    const els: object[] = [alignedMap];
    const { c, renderer, fire, change } = setup(els);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [60, 60], [10, 10]);
    els[0] = { ...alignedMap, ...c.aligning.value?.drawn?.placed };
    change();
    expect(c.aligning.value?.mapId).toBe("map");
    // Undone, say: back where it was.
    els[0] = alignedMap;
    change();
    expect(c.aligning.value).toBeNull();
  });

  it("stops on Escape while the box is being drawn, without moving the map", () => {
    const { c, renderer, scene, fire } = setup([alignedMap]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    fire("pointerdown", 10, 10);
    fire("pointermove", 60, 60);
    c.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    fire("pointerup", 60, 60);
    expect(c.aligning.value).toBeNull();
    expect(scene.update).not.toHaveBeenCalled();
  });
});

describe("stretching a map to fit the grid", () => {
  it("stretches a map slightly to fit a box over several squares each way", () => {
    const { c, renderer, scene, fire } = setup([alignedMap]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [10, 10], [160, 163]);
    c.setAlignCells({ across: 3, down: 3 });
    expect(scene.update).toHaveBeenLastCalledWith([
      ["map", { x: near(126), y: near(123.53), w: near(280), h: near(274.51) }],
    ]);
  });

  it("stretches a map turned on its side along its own sides", () => {
    const { c, renderer, scene, fire } = setup([{ ...alignedMap, rot: Math.PI / 2 }]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [10, 10], [160, 163]);
    c.setAlignCells({ across: 3, down: 3 });
    expect(scene.update).toHaveBeenLastCalledWith([
      ["map", { x: near(126), y: near(123.53), w: near(274.51), h: near(280) }],
    ]);
  });

  it("keeps a map's shape when fitting the box would stretch it much", () => {
    const { c, renderer, scene, fire } = setup([alignedMap]);
    renderer.grid = { type: "square", size: 70, offsetX: 0, offsetY: 0 };
    c.alignMap("map");
    drag(fire, [10, 10], [160, 170]);
    c.setAlignCells({ across: 3, down: 3 });
    expect(scene.update).toHaveBeenLastCalledWith([
      ["map", { x: near(121.94), y: near(121.94), w: near(270.97), h: near(270.97) }],
    ]);
  });
});
