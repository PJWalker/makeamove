import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isString } from "../../lib/guards";
import { choiceOf, listOf } from "../localDoc";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listOf", () => {
  const read = listOf(isString, "names", ["default"]);

  it("reads the fallback when nothing is stored", () => {
    expect(read(undefined)).toEqual(["default"]);
  });

  it("ignores something that isn't a list, saying so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(read({ not: "a list" })).toEqual(["default"]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("names");
  });

  it("leaves out only the items that can't be read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(read(["a", 1, "b", null])).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("names");
  });

  it("reads a good list quietly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(read(["a", "b"])).toEqual(["a", "b"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("choiceOf", () => {
  const read = choiceOf(["lamp", "light", "dark"], "lamp", "light tool");

  it("reads a known choice", () => {
    expect(read("dark")).toBe("dark");
  });

  it("reads the fallback when nothing is stored", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(read(undefined)).toBe("lamp");
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores an unknown choice, saying so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(read("torch")).toBe("lamp");
    expect(warn.mock.calls[0]?.[0]).toContain("light tool");
  });
});
