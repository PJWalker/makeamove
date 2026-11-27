export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which edge or corner is being dragged: compass points, n = top. */
export type ResizeDir = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

export const RESIZE_DIRS: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** The cursor for resizing from each edge or corner. */
export const RESIZE_CURSORS: Record<ResizeDir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

export const MIN_W = 260;
export const MIN_H = 200;

/**
 * The window's new rectangle after dragging edge(s) `dir` by (dx, dy) pixels
 * from where the drag started (`start` is the rectangle at that moment).
 *
 * Dragging east/south grows w/h. Dragging west/north moves x/y as well, so the
 * opposite edge stays put. Neither side may shrink below MIN_W / MIN_H.
 * Deltas are rounded first, so a whole-pixel `start` gives a whole-pixel
 * result and the fixed edges land exactly where they were.
 */
export function resizeRect(start: Rect, dir: ResizeDir, dx: number, dy: number): Rect {
  //@ verify
  //@ ensures (dir === "n" || dir === "s") ? \result.w === start.w : \result.w >= MIN_W
  //@ ensures (dir === "e" || dir === "w") ? \result.h === start.h : \result.h >= MIN_H
  //@ ensures (dir === "e" || dir === "w") ==> \result.y === start.y && \result.h === start.h
  //@ ensures (dir === "n" || dir === "s") ==> \result.x === start.x && \result.w === start.w
  //@ ensures (dir === "e" || dir === "ne" || dir === "se" || dir === "n" || dir === "s") ==> \result.x === start.x
  //@ ensures (dir === "s" || dir === "se" || dir === "sw" || dir === "e" || dir === "w") ==> \result.y === start.y
  //@ ensures (dir === "w" || dir === "nw" || dir === "sw") ==> \result.x + \result.w === start.x + start.w
  //@ ensures (dir === "n" || dir === "ne" || dir === "nw") ==> \result.y + \result.h === start.y + start.h
  const rdx = Math.round(dx);
  const rdy = Math.round(dy);
  let { x, y, w, h } = start;
  if (dir === "e" || dir === "ne" || dir === "se") w = Math.max(MIN_W, start.w + rdx);
  if (dir === "s" || dir === "se" || dir === "sw") h = Math.max(MIN_H, start.h + rdy);
  // Clamp first, then place the moving edge, so the opposite edge never drifts.
  if (dir === "w" || dir === "nw" || dir === "sw") {
    w = Math.max(MIN_W, start.w - rdx);
    x = start.x + start.w - w;
  }
  if (dir === "n" || dir === "ne" || dir === "nw") {
    h = Math.max(MIN_H, start.h - rdy);
    y = start.y + start.h - h;
  }
  return { x, y, w, h };
}
