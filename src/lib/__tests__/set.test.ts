import { describe, expect, it } from "vitest";
import { toggleSetValue } from "../set";

describe("toggleSetValue", () => {
  it("returns a new set with the value toggled", () => {
    const original = new Set(["open"]);

    const closed = toggleSetValue(original, "open");
    const reopened = toggleSetValue(closed, "open");

    expect([...closed]).toEqual([]);
    expect([...reopened]).toEqual(["open"]);
    expect([...original]).toEqual(["open"]);
  });
});
