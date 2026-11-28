import { boxFrom } from "../alignMap";
import type { Box } from "../alignMap";
import type { Point } from "../grid";
import { TEMPLATE_STYLE } from "../tools";
import type { Gesture, ToolContext } from "./types";

/** Screen px a box must be each way to count: anything smaller was a click. */
const MIN_BOX = 4;
const HALF = 0.5;

/**
 * Lining a map up with the grid: drag a box over some of the map's own
 * cells, freely, not snapped to the scene's grid. `drawn` hears the box.
 */
export default function alignBox(c: ToolContext, start: Point, drawn: (box: Box) => void): Gesture {
  const boxTo = (p: Point) => boxFrom(start, p);
  const show = (p: Point) => {
    const box = boxTo(p);
    const { width, layer, ...paint } = TEMPLATE_STYLE;
    c.renderer.draft = {
      kind: "shape",
      shape: "rect",
      t: { x: box.x + box.w * HALF, y: box.y + box.h * HALF, w: box.w, h: box.h, rot: 0 },
      paint,
      width,
      layer,
    };
    c.renderer.invalidate("overlay", "presence");
  };
  show(start);
  return {
    kind: "align",
    cursor: "crosshair",
    move: (_, world) => {
      show(world);
    },
    end(e) {
      c.renderer.draft = null;
      c.renderer.invalidate("overlay", "presence");
      const box = boxTo(c.toWorld(e.clientX, e.clientY));
      const { zoom } = c.renderer.camera;
      if (box.w * zoom < MIN_BOX || box.h * zoom < MIN_BOX) return;
      drawn(box);
    },
  };
}
