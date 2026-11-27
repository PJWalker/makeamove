import { describe, expect, it } from "vite-plus/test";
import { commaListOf } from "../list";

// Splitting and joining round trip, proved in commaList.ts.
describe("stored comma lists", () => {
  it("reads any stored value, dropping blanks", () => {
    expect(commaListOf("a,,b")).toEqual(["a", "b"]);
    expect(commaListOf("")).toEqual([]);
    expect(commaListOf(undefined)).toEqual([]);
    expect(commaListOf(0)).toEqual(["0"]);
  });
});
