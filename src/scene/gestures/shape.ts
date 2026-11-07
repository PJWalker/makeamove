import { tokensCovered } from "../geometry";
import type { Point } from "../grid";
import { formatDistance } from "../measure";
import { pen, SHAPE_WIDTH, shapeTool, TEMPLATE_STYLE } from "../tools";
import type { ShapeKind, Transform } from "../types";
import type { Gesture, ToolContext, ToolPress } from "./types";

/** An action's area waiting to be placed: its shape and size in world px, and who to tell. */
export interface Placement {
  shape: ShapeKind;
  /** A radius, a side, or a length. */
  length: number;
  /** A line's width. */
  width: number;
  onPlaced: (placed: { id: string; covered: string[] } | null) => void;
}

type Keys = { shiftKey: boolean; altKey: boolean };

/** The Shapes tool: drag out the chosen shape, its size shown as it goes. */
export const shape: ToolPress = (c, e, world) => dragShape(c, e, world, shapeTool.value, null);

/**
 * Drag out a shape from where `e` pressed. With `fixed`, it's an action's area
 * being placed: its size is set, the drag only aims it, and once it's down the
 * placement hears which tokens it covers.
 */
export function dragShape(
  c: ToolContext,
  e: PointerEvent,
  world: Point,
  kind: ShapeKind,
  fixed: Placement | null,
): Gesture {
  const start = snapShapePoint(c, world, kind, e);
  const style = () => (fixed ? TEMPLATE_STYLE : { ...pen.value, width: SHAPE_WIDTH });
  const show = (p: Point, e: Keys) => {
    const { label, ...t } = shapeFrom(c, start, kind, fixed, p, e);
    const { colour, width, layer } = style();
    c.renderer.draft = { kind: "shape", shape: kind, t, colour, width, layer, label };
    c.renderer.invalidate("overlay", "presence");
  };
  show(world, e);
  return {
    kind: "shape",
    move: (e, world) => show(world, e),
    end(e) {
      c.renderer.draft = null;
      c.renderer.invalidate("overlay", "presence");
      const world = c.toWorld(e.clientX, e.clientY);
      const { label: _label, ...t } = shapeFrom(c, start, kind, fixed, world, e);
      if (!fixed && (t.w < 4 || t.h < 4)) return;
      const { colour, width, layer } = style();
      const id = c.scene.add({
        type: "shape",
        shape: kind,
        colour,
        width,
        layer,
        ...t,
        ...(fixed ? { template: true } : {}),
      })[0]!;
      if (fixed) {
        c.placing.value = null;
        const tokens = c.allElements().filter((el) => el.type === "token");
        fixed.onPlaced({ id, covered: tokensCovered({ ...t, shape: kind }, tokens) });
      }
    },
  };
}

/** Where a shape starts: a grid corner for squares, a cell centre or corner for the rest (Alt places freely). */
function snapShapePoint(c: ToolContext, p: Point, shape: ShapeKind, e: PointerEvent): Point {
  const grid = c.renderer.grid;
  if (grid.type !== "square" || e.altKey) return p;
  const half = grid.size / 2;
  const step = shape === "rect" ? grid.size : half;
  return {
    x: grid.offsetX + Math.round((p.x - grid.offsetX) / step) * step,
    y: grid.offsetY + Math.round((p.y - grid.offsetY) / step) * step,
  };
}

/**
 * The shape a drag from `s` to `p` makes: a square corner to corner, a
 * circle from its centre, a line or cone from its origin. Lengths round to
 * whole grid steps; a placed area has its size fixed and only aims.
 */
function shapeFrom(
  c: ToolContext,
  s: Point,
  shape: ShapeKind,
  fixed: Placement | null,
  p: Point,
  e: Keys,
): Transform & { label: string } {
  const grid = c.renderer.grid;
  const step = grid.type === "none" || e.altKey ? 0 : grid.size;
  const round = (n: number) => (step ? Math.max(step, Math.round(n / step) * step) : n);
  const units = (n: number) => formatDistance(grid, (n / grid.size) * grid.unit);
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  if (shape === "circle") {
    const r = fixed ? fixed.length : round(Math.hypot(dx, dy));
    return {
      x: s.x,
      y: s.y,
      w: 2 * r,
      h: 2 * r,
      rot: 0,
      label: `${units(r)} radius`,
    };
  }
  if (shape === "rect") {
    if (fixed)
      return {
        x: s.x,
        y: s.y,
        w: fixed.length,
        h: fixed.length,
        rot: 0,
        label: units(fixed.length),
      };
    let w = round(Math.abs(dx));
    let h = round(Math.abs(dy));
    if (e.shiftKey) w = h = Math.max(w, h);
    return {
      x: s.x + (Math.sign(dx) * w) / 2,
      y: s.y + (Math.sign(dy) * h) / 2,
      w,
      h,
      rot: 0,
      label: `${units(w)} × ${units(h)}`,
    };
  }
  // Lines and cones run from the start towards the pointer.
  const angle = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) : 0;
  const rot = e.shiftKey ? Math.round(angle / (Math.PI / 4)) * (Math.PI / 4) : angle;
  const len = fixed ? fixed.length : round(Math.hypot(dx, dy));
  const thick = shape === "cone" ? len : fixed ? fixed.width : grid.size;
  return {
    x: s.x + (Math.cos(rot) * len) / 2,
    y: s.y + (Math.sin(rot) * len) / 2,
    w: len,
    h: thick,
    rot,
    label: units(len),
  };
}
