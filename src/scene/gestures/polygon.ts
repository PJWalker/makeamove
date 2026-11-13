import type { Point } from "../grid";
import { HANDLE_SIZE } from "../render/handles";
import type { PolygonFrame, PolygonPlan, ToolContext } from "./types";
import { snapWallPoint } from "./wall";

/** The frame around a polygon's corners in the world. */
export function polygonFrame(corners: Point[]): PolygonFrame {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const h = Math.max(1, Math.max(...ys) - Math.min(...ys));
  return {
    x,
    y,
    w,
    h,
    rot: 0,
    points: corners.flatMap((p) => [p.x - x, p.y - y]),
    bw: w,
    bh: h,
  };
}

/** The corners of a polygon being placed, a click at a time. */
export class PolygonDraft {
  private draft: { plan: PolygonPlan; points: Point[] } | null = null;

  constructor(private readonly c: ToolContext) {}

  get active() {
    return !!this.draft;
  }

  /**
   * A click while placing a polygon: its next corner, snapped like a wall's end.
   * A click on its first corner, or a double click, closes it.
   */
  add(plan: PolygonPlan, world: Point, e: PointerEvent) {
    const p = snapWallPoint(this.c, world, e);
    if (this.draft?.plan.key !== plan.key) this.draft = { plan, points: [] };
    this.draft.plan = plan;
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

  /** Show the polygon so far, with its next corner at the pointer. */
  preview(p: Point, e: { altKey: boolean }) {
    if (!this.draft) return;
    const { plan, points } = this.draft;
    const r = this.c.renderer;
    r.draft = {
      kind: "polygon",
      points: [...points, snapWallPoint(this.c, p, e)],
      paint: plan.paint,
      width: plan.width,
      layer: plan.layer,
    };
    r.invalidate("overlay");
  }

  /** Stop placing the polygon, without putting it down. */
  cancel() {
    if (!this.draft) return;
    this.draft = null;
    this.c.renderer.draft = null;
    this.c.renderer.invalidate("overlay");
  }

  /** Put down the polygon being placed, if it has at least three corners. */
  finish() {
    const draft = this.draft;
    this.draft = null;
    this.c.renderer.draft = null;
    this.c.renderer.invalidate("overlay");
    if (!draft || draft.points.length < 3) return;
    draft.plan.place(polygonFrame(draft.points));
  }
}
