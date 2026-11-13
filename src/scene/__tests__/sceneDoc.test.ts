import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { rootOf } from "../../data/schema";
import { sceneShape } from "../schema";

/** An element stored as a scene holds it, as the scene reads it back. */
function readElement(_id: string, fields: Record<string, unknown>) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const doc = new Y.Doc();
  doc.getMap("elements").set("e", new Y.Map(Object.entries(fields)));
  return rootOf(doc, sceneShape).elements.view("e") ?? null;
}
const stored = (fields: Record<string, unknown>) => fields;

const base = {
  layer: "over",
  z: "a",
  locked: false,
  createdBy: "gm",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  rot: 0,
};

describe("reading scene elements", () => {
  it("reads a polygon shape with its corners", () => {
    const m = stored({
      ...base,
      type: "shape",
      shape: "polygon",
      points: [0, 0, 5, 0, 0, 5],
      bw: 10,
      bh: 10,
    });
    expect(readElement("e", m)?.type).toBe("shape");
  });

  it("skips a polygon without its corners, rather than failing to draw the scene", () => {
    expect(readElement("e", stored({ ...base, type: "shape", shape: "polygon" }))).toBeNull();
    expect(
      readElement(
        "e",
        stored({
          ...base,
          type: "effect",
          effect: "fog",
          shape: "polygon",
          points: [0, 0],
          bw: 10,
          bh: 10,
        }),
      ),
    ).toBeNull();
  });

  it("reads shapes that have no corners of their own", () => {
    expect(readElement("e", stored({ ...base, type: "shape", shape: "circle" }))?.type).toBe(
      "shape",
    );
  });
});
