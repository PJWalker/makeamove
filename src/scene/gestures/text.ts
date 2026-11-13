import type { Point } from "../grid";
import type { ToolContext, ToolPress } from "./types";

/** The Text tool: a click asks for text to put there. */
export const text: ToolPress = (c, _e, at, screen) => {
  c.onTextRequest?.({ at, screen });
  return null;
};

/** Put text on the map, or change existing text, measured at the size it's drawn. */
export function putText(c: ToolContext, at: Point, text: string, id?: string) {
  const clean = text.trim();
  const old = id ? (c.element(id) ?? undefined) : undefined;
  if (old && old.type !== "text") return;
  if (!clean) {
    if (old) c.scene.remove([old.id]);
    return;
  }
  const size = old?.size ?? Math.round(c.renderer.grid.size * 0.5);
  const colour = old?.colour ?? c.tools.pen.value.colour;
  const m = c.renderer.measureText(clean, colour, size);
  if (old) {
    const k = old.w / old.bw;
    c.scene.update([[old.id, { text: clean, bw: m.w, bh: m.h, w: m.w * k, h: m.h * k }]]);
  } else {
    c.scene.add({
      type: "text",
      layer: c.tools.pen.value.layer,
      text: clean,
      colour,
      size,
      x: at.x,
      y: at.y,
      w: m.w,
      h: m.h,
      bw: m.w,
      bh: m.h,
      rot: 0,
    });
  }
}
