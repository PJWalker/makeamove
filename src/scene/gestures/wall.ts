import { snapToLattice, type Point } from "../grid";
import { formatDistance, toUnits } from "../measure";
import type { Transform } from "../types";
import { wallEnds } from "../vision";
import type { ToolContext, ToolPress } from "./types";

type Keys = { altKey: boolean };

/** The Walls tool (the GM's): drag a wall from end to end. Ends snap to other walls' ends, then to grid corners. */
export const wall: ToolPress = (c, e, world) => {
  if (!c.gm) return null;
  const start = snapWallPoint(c, world, e);
  const show = (p: Point, e: Keys) => {
    const t = wallFrom(c, start, p, e);
    const grid = c.renderer.grid;
    c.renderer.draft = {
      kind: "shape",
      shape: "line",
      t: { ...t, h: 3 / c.renderer.camera.zoom },
      paint: { stroke: "#d8e0ffff", fill: "#d8e0ff38" },
      width: 2,
      layer: "over",
      label: formatDistance(grid, toUnits(grid, t.w)),
    };
    c.renderer.invalidate("overlay", "presence");
  };
  show(world, e);
  return {
    kind: "wall",
    move: (e, world) => show(world, e),
    end(e) {
      c.renderer.draft = null;
      c.renderer.invalidate("overlay", "presence");
      const t = wallFrom(c, start, c.toWorld(e.clientX, e.clientY), e);
      if (t.w * c.renderer.camera.zoom >= 4) c.scene.add({ type: "wall", layer: "over", ...t });
    },
  };
};

/** Where a wall ends: on another wall's end if one is near, else on a grid corner (Alt places freely). */
export function snapWallPoint(c: ToolContext, p: Point, e: Keys): Point {
  if (e.altKey) return p;
  const reach = 12 / c.renderer.camera.zoom;
  let best: Point | null = null;
  let bestD = reach;
  for (const element of c.allElements()) {
    if (element.type !== "wall") continue;
    const { a, b } = wallEnds(element);
    for (const q of [a, b]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        best = q;
        bestD = d;
      }
    }
  }
  if (best) return best;
  const grid = c.renderer.grid;
  return grid.type === "square" ? snapToLattice(grid, p, grid.size) : p;
}

/** A wall from where the drag started to (snapped) p. */
function wallFrom(c: ToolContext, start: Point, p: Point, e: Keys): Transform {
  const end = snapWallPoint(c, p, e);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    w: length,
    h: 6,
    rot: Math.atan2(end.y - start.y, end.x - start.x),
  };
}
