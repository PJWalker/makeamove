import { Color } from "pixi.js";
import { FOG_COLOURS } from "../types";
import { placeShape } from "./shape";
import type { ToolPress } from "./types";

/**
 * The Fog of War tool (the GM's): drag out a shape that's always revealed to
 * players, or always hidden from them, or click a polygon's corners one at a
 * time. The Select tool picks them, with Fog of War on.
 */
export const fog: ToolPress = (c, e, world) => {
  if (!c.gm) return null;
  const { force, shape } = c.tools.fogTool.value;
  const tint = new Color(FOG_COLOURS[force]);
  return placeShape(c, e, world, shape, {
    key: `fog:${force}`,
    style: {
      stroke: tint.toHex(),
      fill: tint.setAlpha(0.15).toHexa(),
      width: 2,
      layer: "over",
    },
    place: (geo) => c.scene.add({ type: "fog", layer: "over", force, ...geo }),
  });
};
