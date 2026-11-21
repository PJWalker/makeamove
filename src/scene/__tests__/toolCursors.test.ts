import { describe, expect, it } from "vite-plus/test";
import { toolCursor } from "../toolCursors";
import type { ToolId } from "../tools";

/** The SVG inside a cursor's `url("data:…")`. */
function svgOf(cursor: string) {
  const m = /^url\("data:image\/svg\+xml,(.*)"\) (\d+) (\d+), (\w+)$/.exec(cursor);
  if (!m) throw new Error(`Not an image cursor: ${cursor}`);
  return { svg: decodeURIComponent(m[1]!), hotspot: [+m[2]!, +m[3]!], fallback: m[4] };
}

describe("toolCursor", () => {
  it("keeps the standard cursor where it already says what the tool does", () => {
    expect(toolCursor("select", true)).toBe("default");
    expect(toolCursor("pan", true)).toBe("grab");
    expect(toolCursor("text", true)).toBe("text");
    // The eraser draws its own ring on the canvas.
    expect(toolCursor("erase", true)).toBe("none");
  });

  const drawn: ToolId[] = ["draw", "shape", "wall", "light", "effect", "ruler", "ping"];

  it("draws its own cursor for each other tool, each different", () => {
    const svgs = drawn.map((t) => svgOf(toolCursor(t, true)).svg);
    expect(new Set(svgs).size).toBe(drawn.length);
  });

  it("falls back to a crosshair while an image cursor can't show", () => {
    for (const t of drawn) expect(svgOf(toolCursor(t, true)).fallback).toBe("crosshair");
  });

  it("aims the pen from its tip, low on the left", () => {
    const [x, y] = svgOf(toolCursor("draw", true)).hotspot;
    expect(x).toBeLessThan(8);
    expect(y).toBeGreaterThan(24);
  });

  it("is black outlined in white on a Mac, and white outlined in black elsewhere", () => {
    for (const t of drawn) {
      const mac = svgOf(toolCursor(t, true)).svg;
      const win = svgOf(toolCursor(t, false)).svg;
      expect(mac).toMatch(/color="#000"/);
      expect(mac).toMatch(/flood-color="#fff"/);
      expect(win).toMatch(/color="#fff"/);
      expect(win).toMatch(/flood-color="#000"/);
    }
  });
});
