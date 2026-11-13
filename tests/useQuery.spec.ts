import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import * as Y from "yjs";
import { store, type ReadonlyStore } from "../src/lib/store";
import { LocalDoc } from "../src/data/localDoc";
import { useQuery } from "../src/ui/useQuery";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Render `read` in a component; returns what it last rendered and how many times it rendered. */
function mount<T>(read: () => T) {
  const seen = { value: undefined as T | undefined, renders: 0 };
  function Probe() {
    seen.value = read();
    seen.renders++;
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  return { seen, unmount: () => act(() => root.unmount()) };
}

test("reads a Yjs type and re-renders only when the selected value changes", async () => {
  const doc = new Y.Doc();
  const map = doc.getMap<string>("m");
  map.set("name", "Gwen");
  const { seen, unmount } = mount(() => useQuery(map, (m) => m.get("name")));
  expect(seen.value).toBe("Gwen");
  const renders = seen.renders;

  await act(async () => map.set("other", "x"));
  expect(seen.renders).toBe(renders);

  await act(async () => map.set("name", "Pat"));
  expect(seen.value).toBe("Pat");
  expect(seen.renders).toBe(renders + 1);
  unmount();
  doc.destroy();
});

test("sees changes nested deep inside the type", async () => {
  const doc = new Y.Doc();
  const outer = doc.getMap<Y.Map<number>>("outer");
  const inner = new Y.Map<number>();
  outer.set("a", inner);
  const { seen, unmount } = mount(() => useQuery(outer, (o) => o.get("a")?.get("hp") ?? 0));
  await act(async () => inner.set("hp", 7));
  expect(seen.value).toBe(7);
  unmount();
  doc.destroy();
});

test("reads a store, and a local document's values, by themselves", () => {
  const count = store(1);
  const local = LocalDoc.inMemory();
  const pen = local.value("pen", (v) => (typeof v === "string" ? v : "gold"));
  const { seen, unmount } = mount(() => [useQuery(count), useQuery(pen)] as const);
  expect(seen.value).toEqual([1, "gold"]);
  act(() => count.set(2));
  act(() => pen.set("red"));
  expect(seen.value).toEqual([2, "red"]);
  expect(local.ui.get("pen")).toBe("red");
  unmount();
  local.destroy();
});

test("a missing source reads as undefined, or as what select makes of nothing", () => {
  const missing = null as ReadonlyStore<number> | null;
  const { seen, unmount } = mount(() => [useQuery(missing), useQuery(null, () => 3)] as const);
  expect(seen.value).toEqual([undefined, 3]);
  unmount();
});

test("stops observing the type once nothing reads it", () => {
  const doc = new Y.Doc();
  const map = doc.getMap<string>("m");
  const { unmount } = mount(() => useQuery(map, (m) => m.size));
  expect(map._dEH.l.length).toBe(1);
  unmount();
  expect(map._dEH.l.length).toBe(0);
  doc.destroy();
});
