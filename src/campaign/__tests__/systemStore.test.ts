import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { isNumber } from "../../data/guards";
import { rootOf } from "../../data/schema";
import { campaignShape } from "../schema";
import { pairKey, SystemData } from "../systemStore";

describe("system data stores", () => {
  it("creates its map on the first write, never on a read", () => {
    const { ext } = rootOf(new Y.Doc(), campaignShape);
    const store = new SystemData(ext, () => "test").store("store", isNumber);
    expect(store.get("a")).toBeUndefined();
    expect(store.has("a")).toBe(false);
    expect(store.values()).toEqual([]);
    expect(ext.has("test")).toBe(false);

    store.set("a", 1);
    store.set("b", 2);
    expect(ext.get("test")?.get("stores")?.has("store")).toBe(true);
    expect(store.get("a")).toBe(1);
    expect(store.values().sort((left, right) => left - right)).toEqual([1, 2]);
    store.delete("a");
    expect(store.has("a")).toBe(false);
  });

  it("keys a pair the same way round", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
});
