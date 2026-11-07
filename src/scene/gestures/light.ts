import { snapPoint, type Point } from "../grid";
import { HANDLE_SIZE } from "../render/handles";
import { lightTool } from "../tools";
import { AREA_COLOURS, type AreaTone } from "../types";
import type { ToolContext, ToolPress } from "./types";
import { snapWallPoint } from "./wall";

/** A new lamp's size, in cells: its shadows' softness. Resizing the lamp makes them softer or sharper. */
const LAMP_SIZE = 0.6;

/** A new light: bright for 4 cells (20 ft on a 5 ft grid), dim for 4 more, warm. */
const LIGHT_DEFAULT = (cell: number) => ({
  bright: cell * 4,
  dim: cell * 8,
  colour: "#ffd27a",
});

/**
 * The Lights tool (the GM's), placing: a click puts down a lamp, or the next
 * corner of an area of solid light or dark. Its select mode is the Select tool's.
 */
export const light: ToolPress = (c, e, world) => {
  if (!c.gm) return null;
  const mode = lightTool.value;
  if (mode === "light" || mode === "dark") {
    c.area.add(mode, world, e);
    return null;
  }
  const grid = c.renderer.grid;
  const at = grid.type === "square" && !e.altKey ? snapPoint(grid, world, 1) : world;
  c.scene.add({
    type: "light",
    layer: "over",
    x: at.x,
    y: at.y,
    w: grid.size * LAMP_SIZE,
    h: grid.size * LAMP_SIZE,
    rot: 0,
    ...LIGHT_DEFAULT(grid.size),
  });
  return null;
};

/** The corners of an area of solid light or dark being placed, a click at a time. */
export class AreaDraft {
  private draft: { tone: AreaTone; points: Point[] } | null = null;

  constructor(private readonly c: ToolContext) {}

  get active() {
    return !!this.draft;
  }

  /**
   * A click while placing an area: its next corner, snapped like a wall's end.
   * A click on its first corner, or a double click, closes it.
   */
  add(tone: AreaTone, world: Point, e: PointerEvent) {
    const p = snapWallPoint(this.c, world, e);
    if (this.draft?.tone !== tone) this.draft = { tone, points: [] };
    const pts = this.draft.points;
    const first = pts[0];
    const cam = this.c.renderer.camera;
    const onFirst =
      first && Math.hypot((first.x - p.x) * cam.zoom, (first.y - p.y) * cam.zoom) <= HANDLE_SIZE;
    if (pts.length >= 3 && (onFirst || this.c.pressCount >= 2)) {
      this.finish();
      return;
    }
    const last = pts[pts.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);
    this.preview(world, e);
  }

  /** Show the area so far, with its next corner at the pointer. */
  preview(p: Point, e: { altKey: boolean }) {
    if (!this.draft) return;
    const r = this.c.renderer;
    r.draft = {
      kind: "polygon",
      points: [...this.draft.points, snapWallPoint(this.c, p, e)],
      colour: AREA_COLOURS[this.draft.tone],
      layer: "over",
    };
    r.invalidate("overlay");
  }

  /** Stop placing the area, without putting it down. */
  cancel() {
    if (!this.draft) return;
    this.draft = null;
    this.c.renderer.draft = null;
    this.c.renderer.invalidate("overlay");
  }

  /** Put down the area being placed, if it has at least three corners. */
  finish() {
    const area = this.draft;
    this.draft = null;
    this.c.renderer.draft = null;
    this.c.renderer.invalidate("overlay");
    if (!area || area.points.length < 3) return;
    const xs = area.points.map((p) => p.x);
    const ys = area.points.map((p) => p.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs));
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys));
    const points = area.points.flatMap((p) => [p.x - x, p.y - y]);
    this.c.scene.add({
      type: "area",
      layer: "over",
      x,
      y,
      w,
      h,
      rot: 0,
      tone: area.tone,
      points,
      bw: w,
      bh: h,
    });
  }
}
