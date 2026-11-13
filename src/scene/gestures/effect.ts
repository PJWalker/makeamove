import { Color } from "pixi.js";
import { placeShape } from "./shape";
import type { ToolPress } from "./types";

/**
 * The Effects tool (the GM's): drag out a zone of weather, cloud or magic in
 * the chosen shape, or click a polygon zone's corners one at a time. The
 * Select tool picks them, with Effects on.
 */
export const effect: ToolPress = (c, e, world) => {
  if (!c.gm) return null;
  const { effect, colour, glow, obscures, shape } = c.tools.effectTool.value;
  const tint = new Color(colour);
  return placeShape(c, e, world, shape, {
    key: `effect:${effect}`,
    // Its outline, and the inside at 15% opacity, as the GM sees it.
    style: {
      stroke: tint.toHex(),
      fill: tint.setAlpha(0.15).toHexa(),
      width: 2,
      layer: "over",
    },
    place: (geo) =>
      c.scene.add({
        type: "effect",
        layer: "over",
        effect,
        colour,
        ...(glow ? { glow } : {}),
        ...(obscures ? { obscures } : {}),
        ...geo,
      }),
  });
};
