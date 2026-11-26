import alignToGrid from "../gridAlign";
import { recogniseShape } from "../recognise";
import { finishStroke, STRIDE } from "../stroke";
import { coalesced  } from "./types";
import type {ToolPress} from "./types";

/** The least size, in screen px, a stroke needs to be recognised as a shape. */
const LEAST_SHAPE = 24;
/** The closest, in screen px, a stroke's points come to each other. */
const POINT_SPACING = 0.5;
/** The pressure a stroke has without a stylus. */
const NO_PRESSURE = 0.5;
/** "#rrggbb", a colour without its opacity. */
const OPAQUE_HEX = 7;

/**
 * The Pen: a freehand stroke, pressure-sensitive with a stylus, in the pen's
 * colour, width and layer. A stroke that looks like a basic shape (a line,
 * circle, rectangle, cone or polygon) is neatened into that shape, lined
 * up with the grid if it's nearly lined up (Alt draws it where it is);
 * undo turns it back into the stroke as drawn.
 */
export const draw: ToolPress = (c, e, world) => {
  const { colour, layer } = c.tools.pen.value;
  // The pen's width is in screen px; the stroke keeps the world width it had when drawn.
  const width = c.tools.pen.value.width / c.renderer.camera.zoom;
  const points: number[] = [];
  const add = (e: PointerEvent, p: { x: number; y: number }) => {
    const n = points.length;
    // Skip points too close to the last one.
    if (
      n >= STRIDE &&
      Math.hypot(p.x - points[n - STRIDE]!, p.y - points[n - STRIDE + 1]!) *
        c.renderer.camera.zoom <
        POINT_SPACING
    )
      return;
    points.push(p.x, p.y, e.pointerType === "pen" ? e.pressure : NO_PRESSURE);
    c.renderer.draft = { points, colour, width, layer };
  };
  add(e, world);
  return {
    kind: "draw",
    move(e) {
      for (const [event, p] of coalesced(c, e)) add(event, p);
      c.updateOverlay();
    },
    end(up) {
      c.renderer.draft = null;
      if (points.length === 0) return;
      const [id] = c.scene.add({ type: "drawing", layer, colour, width, ...finishStroke(points, width) });
      const recognised = recogniseShape(points, LEAST_SHAPE / c.renderer.camera.zoom);
      if (id && recognised) {
        const shape = up.altKey ? recognised : alignToGrid(recognised, c.renderer.grid);
        const stroke = colour.length === OPAQUE_HEX ? `${colour}ff` : colour;
        const fill = `${colour.slice(0, OPAQUE_HEX)}00`;
        c.scene.replace(id, { type: "shape", layer, stroke, fill, width, ...shape });
      }
    },
  };
};
