import type { Rect } from "./camera";
import type { Point } from "./grid";

/** How far to move a box, in px, to bring it inside a viewport; a box bigger than it keeps its top left in. */
export function pinInside(box: Rect, viewport: Rect): Point {
  const shift = (start: number, size: number, from: number, room: number) => {
    if (start < from) return from - start;
    const over = start + size - (from + room);
    return over > 0 ? -Math.min(over, start - from) : 0;
  };
  return {
    x: shift(box.x, box.w, viewport.x, viewport.w),
    y: shift(box.y, box.h, viewport.y, viewport.h),
  };
}

/** The union of some boxes. */
export function unionRect(boxes: Rect[]): Rect {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return {
    x: left,
    y: top,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - left,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - top,
  };
}

/**
 * A little triangle on the edge of a box, pointing toward something outside it:
 * its tip, then the two corners of its base. None when the target is inside the box.
 */
export function pointerToward(box: Rect, target: Point, size = 10, gap = 4): Point[] | null {
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  if (Math.abs(dx) <= box.w / 2 && Math.abs(dy) <= box.h / 2) return null;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  // Where the line toward the target leaves the box.
  const reach = Math.min(
    ux ? box.w / 2 / Math.abs(ux) : Infinity,
    uy ? box.h / 2 / Math.abs(uy) : Infinity,
  );
  const base = { x: centre.x + ux * (reach + gap), y: centre.y + uy * (reach + gap) };
  const half = size * 0.6;
  return [
    { x: base.x + ux * size, y: base.y + uy * size },
    { x: base.x - uy * half, y: base.y + ux * half },
    { x: base.x + uy * half, y: base.y - ux * half },
  ];
}
