import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { pairKey, systemStore } from "../systemStore";

describe("system data stores", () => {
  it("creates its map on the first write, never on a read", () => {
    const systemData = new Y.Doc().getMap<unknown>("systemData");
    const store = systemStore<number>(systemData, "test:store");
    expect(store.get("a")).toBeUndefined();
    expect(store.has("a")).toBe(false);
    expect(store.values()).toEqual([]);
    expect(systemData.has("test:store")).toBe(false);

    store.set("a", 1);
    store.set("b", 2);
    expect(systemData.get("test:store")).toBeInstanceOf(Y.Map);
    expect(store.get("a")).toBe(1);
    expect(store.values().sort()).toEqual([1, 2]);
    store.delete("a");
    expect(store.has("a")).toBe(false);
  });

  it("keys a pair the same way round", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
});
