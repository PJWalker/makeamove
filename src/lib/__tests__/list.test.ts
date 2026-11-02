import { describe, expect, it } from "vitest";
import { formatCommaList, parseCommaList } from "../list";

describe("comma-list encoding", () => {
  it("preserves empty entries, ordering, and duplicates", () => {
    const values = ["first", "", "first", "last"];
    expect(parseCommaList(formatCommaList(values))).toEqual(values);
    expect(parseCommaList("")).toEqual([""]);
  });
});
