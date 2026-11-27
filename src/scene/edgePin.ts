import type { Point } from "./grid";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How far to move a span starting at `start` to bring it inside the span from
 * `from` for `room`; a span bigger than the room keeps its start in.
 */
export function shiftInside(start: number, size: number, from: number, room: number): number {
  //@ verify
  //@ requires size >= 0 && room >= 0
  //@ ensures start + \result >= from
  //@ ensures size <= room ==> start + \result + size <= from + room
  //@ ensures start >= from && start + size <= from + room ==> \result === 0
  //@ ensures start < from ==> start + \result === from
  //@ ensures start >= from && start + size > from + room ==> start + \result + size === from + room || start + \result === from
  if (start < from) return from - start;
  const over = start + size - (from + room);
  return over > 0 ? -Math.min(over, start - from) : 0;
}

/** How far to move a box, in px, to bring it inside a viewport; a box bigger than it keeps its top left in. */
export function pinInside(box: Box, viewport: Box): Point {
  return {
    x: shiftInside(box.x, box.w, viewport.x, viewport.w),
    y: shiftInside(box.y, box.h, viewport.y, viewport.h),
  };
}

/** The union of some boxes: the smallest box holding them all. */
export function unionRect(boxes: Box[]): Box {
  //@ verify
  //@ requires boxes.length > 0
  //@ ensures forall(i: nat, i < boxes.length ==> \result.x <= boxes[i].x && \result.y <= boxes[i].y && boxes[i].x + boxes[i].w <= \result.x + \result.w && boxes[i].y + boxes[i].h <= \result.y + \result.h)
  //@ ensures exists(i: nat, i < boxes.length && boxes[i].x === \result.x)
  //@ ensures exists(i: nat, i < boxes.length && boxes[i].y === \result.y)
  //@ ensures exists(i: nat, i < boxes.length && boxes[i].x + boxes[i].w === \result.x + \result.w)
  //@ ensures exists(i: nat, i < boxes.length && boxes[i].y + boxes[i].h === \result.y + \result.h)
  let left = boxes[0]!.x;
  let top = boxes[0]!.y;
  let right = boxes[0]!.x + boxes[0]!.w;
  let bottom = boxes[0]!.y + boxes[0]!.h;
  for (let k = 1; k < boxes.length; k++) {
    //@ invariant 1 <= k && k <= boxes.length
    //@ invariant forall(i: nat, i < k ==> left <= boxes[i].x && top <= boxes[i].y && boxes[i].x + boxes[i].w <= right && boxes[i].y + boxes[i].h <= bottom)
    //@ invariant exists(i: nat, i < k && boxes[i].x === left)
    //@ invariant exists(i: nat, i < k && boxes[i].y === top)
    //@ invariant exists(i: nat, i < k && boxes[i].x + boxes[i].w === right)
    //@ invariant exists(i: nat, i < k && boxes[i].y + boxes[i].h === bottom)
    //@ decreases boxes.length - k
    const box = boxes[k]!;
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.w);
    bottom = Math.max(bottom, box.y + box.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * A little triangle on the edge of a box, pointing toward something outside it:
 * its tip, then the two corners of its base. None when the target is inside the box.
 */
export function pointerToward(box: Box, target: Point, size = 10, gap = 4): Point[] | null {
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
