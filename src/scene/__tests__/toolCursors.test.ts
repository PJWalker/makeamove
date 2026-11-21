import { describe, expect, it } from "vite-plus/test";
import { toolCursor, type CursorSettings } from "../toolCursors";
import type { ToolId } from "../tools";
import { EFFECTS, SHAPES } from "../types";

/** The SVG inside a cursor's `url("data:…")`. */
function svgOf(cursor: string) {
  const m = /^url\("data:image\/svg\+xml,(.*)"\) (\d+) (\d+), (\w+)$/.exec(cursor);
  if (!m) throw new Error(`Not an image cursor: ${cursor}`);
  return { svg: decodeURIComponent(m[1]!), hotspot: [+m[2]!, +m[3]!], fallback: m[4] };
}

const settings: CursorSettings = { shape: "rect", effect: "fog" };
const cursor = (tool: ToolId, mac = true, s = settings) => toolCursor(tool, s, mac);

describe("toolCursor", () => {
  it("keeps the standard cursor where it already says what the tool does", () => {
    expect(cursor("select")).toBe("default");
    expect(cursor("pan")).toBe("grab");
    expect(cursor("text")).toBe("text");
    // The eraser draws its own ring on the canvas.
    expect(cursor("erase")).toBe("none");
  });

  const drawn: ToolId[] = ["draw", "shape", "wall", "light", "effect", "ruler", "ping"];

  it("draws its own cursor for each other tool, each different", () => {
    const svgs = drawn.map((t) => svgOf(cursor(t)).svg);
    expect(new Set(svgs).size).toBe(drawn.length);
  });

  it("shows the shape the Shapes tool draws", () => {
    const svgs = SHAPES.map((s) => svgOf(cursor("shape", true, { ...settings, shape: s.id })).svg);
    expect(new Set(svgs).size).toBe(SHAPES.length);
  });

  it("shows the effect the Effects tool puts down", () => {
    const svgs = EFFECTS.map(
      (e) => svgOf(cursor("effect", true, { ...settings, effect: e.id })).svg,
    );
    expect(new Set(svgs).size).toBe(EFFECTS.length);
  });

  it("aims a ping from the radar's centre", () => {
    expect(svgOf(cursor("ping")).hotspot).toEqual([16, 16]);
  });

  it("falls back to a crosshair while an image cursor can't show", () => {
    for (const t of drawn) expect(svgOf(cursor(t)).fallback).toBe("crosshair");
  });

  it("aims the pen from its tip, low on the left", () => {
    const [x, y] = svgOf(cursor("draw")).hotspot;
    expect(x).toBeLessThan(8);
    expect(y).toBeGreaterThan(24);
  });

  it("is black outlined in white on a Mac, and white outlined in black elsewhere", () => {
    for (const t of drawn) {
      const mac = svgOf(cursor(t, true)).svg;
      const win = svgOf(cursor(t, false)).svg;
      expect(mac).toMatch(/color="#000"/);
      expect(mac).toMatch(/flood-color="#fff"/);
      expect(win).toMatch(/color="#fff"/);
      expect(win).toMatch(/flood-color="#000"/);
    }
  });
});
