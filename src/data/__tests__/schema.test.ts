import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { Invalid, collection, counter, list, lww, record, rootOf, text, variant } from "../schema";

const isString = (v: unknown): v is string => typeof v === "string";

const shape = {
  meta: record({
    name: lww<string>().or("Untitled"),
    note: lww(isString),
    hits: counter(),
    tags: list<string>(),
    body: text(),
  }),
  people: collection(record({ name: lww<string>().or("Unnamed"), age: lww<number>() })),
  shapes: collection(
    variant("type", { x: lww<number>().or(0) }, { dot: {}, line: { length: lww<number>().or(1) } }),
    "shape",
    (item) => item.readCase() ?? new Invalid("unknown type"),
  ),
  scores: collection(counter()),
};

describe("schema", () => {
  it("reads fallbacks, and ignores values of the wrong kind", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = new Y.Doc();
    const root = rootOf(doc, shape);
    expect(root.meta.get("name")).toBe("Untitled");
    expect(root.meta.get("note")).toBeUndefined();
    doc.getMap("meta").set("name", 7);
    doc.getMap("meta").set("note", 7);
    expect(root.meta.get("name")).toBe("Untitled");
    expect(root.meta.get("note")).toBeUndefined();
    root.meta.get("note");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("writes and reads records in collections", () => {
    const doc = new Y.Doc();
    const root = rootOf(doc, shape);
    root.people.set("a", { name: "Ayla", age: 30 });
    expect(root.people.get("a")?.get("name")).toBe("Ayla");
    root.people.get("a")!.patch({ age: undefined });
    expect(root.people.read()).toEqual({ a: { name: "Ayla" } });
    expect(root.people.get("a")).toBe(root.people.get("a"));
  });

  it("adds up counters, and sets them outright", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const ra = rootOf(a, shape);
    ra.scores.set("hp", 10);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const rb = rootOf(b, shape);
    ra.scores.add("hp", -3);
    rb.scores.add("hp", -2);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(ra.scores.get("hp")).toBe(5);
    expect(rb.scores.get("hp")).toBe(5);
    rb.scores.set("hp", 8);
    expect(rb.scores.get("hp")).toBe(8);
    ra.meta.add("hits", 2);
    expect(ra.meta.get("hits")).toBe(2);
  });

  it("makes containers on demand", () => {
    const root = rootOf(new Y.Doc(), shape);
    expect(root.meta.get("tags")).toBeUndefined();
    root.meta.ensure("tags").push("a");
    expect(root.meta.read()).toEqual({ name: "Untitled", hits: 0, tags: ["a"] });
    expect(root.meta.ensure("body")).toBeInstanceOf(Y.XmlFragment);
  });

  it("reads variants by their case, leaving out items that don't parse", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = new Y.Doc();
    const root = rootOf(doc, shape);
    root.shapes.set("l", { type: "line", x: 2, length: 5 });
    root.shapes.set("d", { type: "dot" });
    const odd = new Y.Map();
    odd.set("type", "blob");
    doc.getMap("shapes").set("b", odd);
    expect(Object.fromEntries(root.shapes.views())).toEqual({
      l: { type: "line", x: 2, length: 5 },
      d: { type: "dot", x: 0 },
    });
    root.shapes.get("l")!.patchCase({ length: 9, nope: 1 });
    expect(root.shapes.view("l")).toEqual({ type: "line", x: 2, length: 9 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
