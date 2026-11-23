import { describe, expect, it } from "vite-plus/test";
import { postedSince } from "../types";

describe("which messages play their arrival", () => {
  const openedAt = "0000000500:0000:pat";
  it("plays it for a message posted after the log was opened", () => {
    expect(postedSince({ hlc: "0000000600:0000:kim" }, openedAt)).toBe(true);
  });
  it("doesn't for an older message loaded as the log is scrolled back", () => {
    expect(postedSince({ hlc: "0000000100:0000:kim" }, openedAt)).toBe(false);
  });
});
