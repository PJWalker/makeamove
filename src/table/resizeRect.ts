export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Which edge or corner is being dragged: compass points, n = top. */
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/** The cursor for resizing from each edge or corner. */
export const RESIZE_CURSORS: Record<ResizeDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

export const MIN_W = 260
export const MIN_H = 200

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
  dx = Math.round(dx)
  dy = Math.round(dy)
  let { x, y, w, h } = start
  if (dir.includes('e')) w = Math.max(MIN_W, start.w + dx)
  if (dir.includes('s')) h = Math.max(MIN_H, start.h + dy)
  // Clamp first, then place the moving edge, so the opposite edge never drifts.
  if (dir.includes('w')) {
    w = Math.max(MIN_W, start.w - dx)
    x = start.x + start.w - w
  }
  if (dir.includes('n')) {
    h = Math.max(MIN_H, start.h - dy)
    y = start.y + start.h - h
  }
  return { x, y, w, h }
}
