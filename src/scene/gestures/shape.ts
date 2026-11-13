import { tokensCovered } from "../geometry";
import type { Point } from "../grid";
import { formatDistance } from "../measure";
import { SHAPE_WIDTH, TEMPLATE_STYLE, type SceneTools } from "../tools";
import type {
  DraggedShapeKind,
  Layer,
  ShapeGeometry,
  ShapeKind,
  ShapePaint,
  Transform,
} from "../types";
import type { Gesture, Placement, ToolContext, ToolPress } from "./types";

type Keys = { shiftKey: boolean; altKey: boolean };

/**
 * The Shapes tool: drag out the chosen shape, its size shown as it goes, or
 * click a polygon's corners one at a time.
 */
export const shape: ToolPress = (c, e, world) => {
  const style = shapeStyle(c.tools);
  return placeShape(c, e, world, c.tools.shapeTool.value, {
    key: "shape",
    style,
    place: (geo) => c.scene.add({ type: "shape", ...style, ...geo }),
  });
};

/** How the Shapes tool paints a shape. */
const shapeStyle = (tools: SceneTools): ShapeStyle => ({
  ...tools.shapePaint.value,
  width: SHAPE_WIDTH,
  layer: tools.pen.value.layer,
});

/** How a shape shows while it's placed: its paint, outline width in world px, and the layer it goes in. */
export type ShapeStyle = ShapePaint & { width: number; layer: Layer };

/** Something put down in the outline of a shape: a shape, or an effect's zone. */
export interface ShapePlan {
  /** Which sort of thing this is: a polygon's click for another sort starts afresh. */
  key: string;
  style: ShapeStyle;
  place(geo: Transform & ShapeGeometry): void;
}

/**
 * A press with a tool that puts things down in the outline of a shape: drag
 * out the shape (the gesture that does), or click a polygon's next corner.
 */
export function placeShape(
  c: ToolContext,
  e: PointerEvent,
  world: Point,
  kind: ShapeKind,
  plan: ShapePlan,
): Gesture | null {
  if (kind !== "polygon")
    return dragShape(c, e, world, kind, {
      style: plan.style,
      place: (t) => plan.place({ ...t, shape: kind }),
    });
  c.polygon.add(
    {
      key: plan.key,
      paint: plan.style,
      width: plan.style.width,
      layer: plan.style.layer,
      place: (frame) => plan.place({ shape: "polygon", ...frame }),
    },
    world,
    e,
  );
  return null;
}

/** What a dragged shape becomes. With `fixed`, it's an action's area: its size is set, and the drag only aims it. */
export interface DragPlan {
  style: ShapeStyle;
  fixed?: Placement;
  place(t: Transform): void;
}

/** An action's area being placed: once it's down, the placement hears which tokens it covers. */
export function placementPlan(c: ToolContext, fixed: Placement): DragPlan {
  return {
    style: TEMPLATE_STYLE,
    fixed,
    place: (t) => {
      const id = c.scene.add({
        type: "shape",
        shape: fixed.shape,
        ...TEMPLATE_STYLE,
        ...t,
        template: true,
      })[0]!;
      c.placing.value = null;
      const tokens = c.allElements().filter((el) => el.type === "token");
      fixed.onPlaced({ id, covered: tokensCovered({ ...t, shape: fixed.shape }, tokens) });
    },
  };
}

/** Drag out a shape from where `e` pressed, and put it down as `plan` says. */
export function dragShape(
  c: ToolContext,
  e: PointerEvent,
  world: Point,
  kind: DraggedShapeKind,
  plan: DragPlan,
): Gesture {
  const start = snapShapePoint(c, world, kind, e);
  const fixed = plan.fixed ?? null;
  const show = (p: Point, e: Keys) => {
    const { label, ...t } = shapeFrom(c, start, kind, fixed, p, e);
    const { width, layer, ...paint } = plan.style;
    c.renderer.draft = { kind: "shape", shape: kind, t, paint, width, layer, label };
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
      plan.place(t);
    },
  };
}

/** Where a shape starts: a grid corner for squares, a cell centre or corner for the rest (Alt places freely). */
function snapShapePoint(c: ToolContext, p: Point, shape: DraggedShapeKind, e: PointerEvent): Point {
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
  shape: DraggedShapeKind,
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
