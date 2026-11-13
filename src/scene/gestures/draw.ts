import { finishStroke, STRIDE } from "../stroke";
import { coalesced, type ToolPress } from "./types";

/** The Pen: a freehand stroke, pressure-sensitive with a stylus, in the pen's colour, width and layer. */
export const draw: ToolPress = (c, e, world) => {
  const { colour, layer } = c.tools.pen.value;
  // The pen's width is in screen px; the stroke keeps the world width it had when drawn.
  const width = c.tools.pen.value.width / c.renderer.camera.zoom;
  const points: number[] = [];
  const add = (e: PointerEvent, p: { x: number; y: number }) => {
    const n = points.length;
    // Skip points closer than half a screen px to the last one.
    if (
      n >= STRIDE &&
      Math.hypot(p.x - points[n - STRIDE]!, p.y - points[n - STRIDE + 1]!) *
        c.renderer.camera.zoom <
        0.5
    )
      return;
    points.push(p.x, p.y, e.pointerType === "pen" ? e.pressure : 0.5);
    c.renderer.draft = { points, colour, width, layer };
  };
  add(e, world);
  return {
    kind: "draw",
    move(e) {
      for (const [ev, p] of coalesced(c, e)) add(ev, p);
      c.updateOverlay();
    },
    end() {
      if (points.length) {
        const geo = finishStroke(points, width);
        c.scene.add({ type: "drawing", layer, colour, width, ...geo });
      }
      c.renderer.draft = null;
    },
  };
};
