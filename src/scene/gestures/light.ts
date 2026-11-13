import { snapPoint } from "../grid";
import { AREA_COLOURS, type AreaTone } from "../types";
import type { PolygonPlan, ToolContext, ToolPress } from "./types";

/** A new lamp's size, in cells: its shadows' softness. Resizing the lamp makes them softer or sharper. */
const LAMP_SIZE = 0.6;

/** A new light: bright for 4 cells (20 ft on a 5 ft grid), dim for 4 more, warm. */
const LIGHT_DEFAULT = (cell: number) => ({
  bright: cell * 4,
  dim: cell * 8,
  colour: "#ffd27a",
});

/**
 * The Lights tool (the GM's): a click puts down a lamp, or the next corner of
 * an area of solid light or dark. The Select tool picks them, with Lights on.
 */
export const light: ToolPress = (c, e, world) => {
  if (!c.gm) return null;
  const mode = c.tools.lightTool.value;
  if (mode !== "lamp") {
    c.polygon.add(areaPlan(c, mode), world, e);
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

/** An area of solid light or dark, placed a corner at a time. */
function areaPlan(c: ToolContext, tone: AreaTone): PolygonPlan {
  const colour = AREA_COLOURS[tone];
  return {
    key: `area:${tone}`,
    // The inside at 15% opacity.
    paint: { stroke: colour, fill: `${colour}26` },
    width: 2,
    layer: "over",
    place: (frame) => c.scene.add({ type: "area", layer: "over", tone, ...frame }),
  };
}
