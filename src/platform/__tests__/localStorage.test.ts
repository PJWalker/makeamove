import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isObject } from "../../lib/guards";
import { getStorageJson, setStorageJson } from "../localStorage";

const isPoint = (v: unknown): v is { x: number } =>
  isObject<{ x?: unknown }>(v) && typeof v.x === "number";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getStorageJson", () => {
  it("reads what was saved, when it passes the guard", () => {
    setStorageJson("point", { x: 3 });
    expect(getStorageJson("point", isPoint, null)).toEqual({ x: 3 });
  });

  it("reads the fallback when nothing is saved", () => {
    expect(getStorageJson("point", isPoint, null)).toBeNull();
  });

  it("ignores a saved value of the wrong shape, naming it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setStorageJson("point", { x: "three" });
    expect(getStorageJson("point", isPoint, null)).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain("point");
    expect(localStorage.getItem("point")).toBe('{"x":"three"}');
  });

  it("ignores saved text that isn't JSON", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("point", "{oops");
    expect(getStorageJson("point", isPoint, null)).toBeNull();
  });
});
