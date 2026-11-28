import type { Point } from "../grid";
import type { SceneElement, TextElement, TextLook } from "../types";
import type { ToolContext, ToolPress } from "./types";

/** The Text tool: a press on text edits it, and anywhere else asks for new text there. */
export const text: ToolPress = (c, _e, at) => {
  const under = c.hitTest(at);
  c.onTextRequest?.(under?.type === "text" ? editRequest(under) : { at });
  return null;
};

/** A request to edit text that's on the map. */
export const editRequest = (element: TextElement) => ({
  at: { x: element.x, y: element.y },
  id: element.id,
});

/** Text's size laid out as it looks, scaled as it is now. */
export function fitText(c: ToolContext, element: Partial<TextLook> & TextElement) {
  const m = c.renderer.measureText(element);
  const k = element.w / element.bw;
  return { bw: m.w, bh: m.h, w: m.w * k, h: m.h * k };
}

/** A patch for `el`, with its size fitted to its words and style when it's text. */
export function fitPatch<P extends object>(c: ToolContext, element: SceneElement, patch: P) {
  return element.type === "text" ? { ...patch, ...fitText(c, { ...element, ...patch }) } : patch;
}

/** How new text looks: in the Text tool's style and the pen's colour, sized to the grid. */
export const newTextLook = (c: ToolContext, text: string): TextLook => ({
  ...c.tools.textStyle.value,
  text,
  colour: c.tools.pen.value.colour,
  size: Math.round(c.renderer.grid.size * 0.5),
});

/** Put text on the map in the Text tool's style, or change existing text's words. */
export function putText(c: ToolContext, at: Point, text: string, id?: string) {
  const clean = text.trim();
  const old = id ? (c.element(id) ?? undefined) : undefined;
  if (old && old.type !== "text") return;
  if (old) {
    if (clean) c.scene.update([[old.id, fitPatch(c, old, { text: clean })]]);
    else c.scene.remove([old.id]);
    return;
  }
  if (!clean) return;
  const look = newTextLook(c, clean);
  const m = c.renderer.measureText(look);
  c.scene.add({
    type: "text",
    layer: c.tools.penLayer(c.gm),
    ...look,
    x: at.x,
    y: at.y,
    w: m.w,
    h: m.h,
    bw: m.w,
    bh: m.h,
    rot: 0,
  });
}
