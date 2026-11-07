import { describe, expect, it } from "vitest";
import { commaListOf, formatCommaList, parseCommaList } from "../list";

describe("comma-list encoding", () => {
  it("preserves empty entries, ordering, and duplicates", () => {
    const values = ["first", "", "first", "last"];
    expect(parseCommaList(formatCommaList(values))).toEqual(values);
    expect(parseCommaList("")).toEqual([""]);
  });
});

describe("stored comma lists", () => {
  it("reads any stored value, dropping blanks", () => {
    expect(commaListOf("a,,b")).toEqual(["a", "b"]);
    expect(commaListOf("")).toEqual([]);
    expect(commaListOf(undefined)).toEqual([]);
    expect(commaListOf(0)).toEqual(["0"]);
  });
});
