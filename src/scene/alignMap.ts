/*
 * Lining a map up with the scene's grid. The GM drags a box over some of the
 * map's own cells and says how many cells it covers each way; the map is
 * then scaled, keeping its shape, and moved so the box's corner lands on a
 * grid point and its cells match the grid's.
 *
 * All in world px. The grid's pitch is how far apart its points are each
 * way: a square's side both ways, or a hex's width and its row height.
 */

/** A point. */
export interface Spot {
  x: number; //@ type real
  y: number; //@ type real
}

/** A box's corner nearest the origin, and its size. */
export interface Box {
  x: number; //@ type real
  y: number; //@ type real
  w: number; //@ type real
  h: number; //@ type real
}

/** How far apart the grid's points are each way. */
export interface Pitch {
  w: number; //@ type real
  h: number; //@ type real
}

/** How many of the map's cells a box covers each way. */
export interface Cells {
  across: number;
  down: number;
}

/** A map's centre and size. Its rotation doesn't change: scaling evenly keeps it. */
export interface Frame {
  x: number; //@ type real
  y: number; //@ type real
  w: number; //@ type real
  h: number; //@ type real
}

/** Scaling by `s` about `from`, and moving `from` to `to`. */
export interface Move {
  from: Spot;
  to: Spot;
  s: number; //@ type real
}

/** The box a drag from `a` to `b` makes, whichever way it went. */
export function boxFrom(a: Spot, b: Spot): Box {
  //@ verify
  //@ ensures \result.w >= 0 && \result.h >= 0
  //@ ensures \result.x === Math.min(a.x, b.x) && \result.y === Math.min(a.y, b.y)
  //@ ensures \result.x + \result.w === Math.max(a.x, b.x) && \result.y + \result.h === Math.max(a.y, b.y)
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x, b.x) - x, h: Math.max(a.y, b.y) - y };
}

/**
 * How much to scale the map by so `box` covers `cells` of a grid whose
 * points are `pitch` apart. The map keeps its shape, so a box drawn a
 * little off can't stretch it: the errors across and down cancel out, and
 * if the box has the cells' shape both sides fit exactly.
 */
export function alignScale(box: Box, cells: Cells, pitch: Pitch): number {
  //@ verify
  //@ type \result real
  //@ requires box.w > 0 && box.h > 0 && pitch.w > 0 && pitch.h > 0 && cells.across >= 1 && cells.down >= 1
  //@ ensures \result > 0
  //@ ensures (box.w * \result - cells.across * pitch.w) + (box.h * \result - cells.down * pitch.h) === 0
  //@ ensures box.w * cells.down * pitch.h === box.h * cells.across * pitch.w ==> box.w * \result === cells.across * pitch.w && box.h * \result === cells.down * pitch.h
  return (cells.across * pitch.w + cells.down * pitch.h) / (box.w + box.h);
}

/**
 * The map's frame after `move`. Every point of the map moves the same way,
 * so the map's own cells keep lining up with the box drawn over them.
 */
export function alignFrame(map: Frame, move: Move): Frame {
  //@ verify
  //@ requires move.s > 0 && map.w > 0 && map.h > 0
  //@ ensures \result.w > 0 && \result.h > 0
  //@ ensures \result.w === map.w * move.s && \result.h === map.h * move.s
  //@ ensures \result.x - \result.w / 2 === move.to.x + (map.x - map.w / 2 - move.from.x) * move.s
  //@ ensures \result.x + \result.w / 2 === move.to.x + (map.x + map.w / 2 - move.from.x) * move.s
  //@ ensures \result.y - \result.h / 2 === move.to.y + (map.y - map.h / 2 - move.from.y) * move.s
  //@ ensures \result.y + \result.h / 2 === move.to.y + (map.y + map.h / 2 - move.from.y) * move.s
  const { from, to, s } = move;
  return {
    x: to.x + (map.x - from.x) * s,
    y: to.y + (map.y - from.y) * s,
    w: map.w * s,
    h: map.h * s,
  };
}

/**
 * A first guess at how many cells `box` covers, for a grid whose points
 * are `pitch` apart: going by its shape alone, one cell along its shorter
 * side, so a box over a single cell needs no correcting.
 */
export function guessCells(box: Box, pitch: Pitch): Cells {
  //@ verify
  //@ requires box.w > 0 && box.h > 0 && pitch.w > 0 && pitch.h > 0
  //@ ensures \result.across >= 1 && \result.down >= 1
  //@ ensures \result.across === 1 || \result.down === 1
  const across = box.w / pitch.w / (box.h / pitch.h);
  if (across >= 1) return { across: Math.max(1, Math.round(across)), down: 1 };
  return { across: 1, down: Math.max(1, Math.round(1 / across)) };
}
