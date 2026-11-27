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

/** How much to scale across and down. */
export interface Scales {
  sx: number; //@ type real
  sy: number; //@ type real
}

/** Scaling by `sx` across and `sy` down about `from`, and moving `from` to `to`. */
export interface Move {
  from: Spot;
  to: Spot;
  sx: number; //@ type real
  sy: number; //@ type real
}

/** Fewest cells a box must cover each way before the map may stretch to fit it: a smaller box is too rough a guide. */
export const STRETCH_CELLS = 3;
/** Most the map may stretch one way more than the other, in percent. */
export const MAX_STRETCH = 3;
const PERCENT = 100;

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
 * How much to scale the map by, across and down, so `box` covers `cells`
 * of a grid whose points are `pitch` apart. Conservatively: it keeps its
 * shape (as alignScale says) unless the box covers several cells each way
 * and fitting them exactly needs only a slight stretch, as for a map whose
 * squares were drawn a touch off square.
 */
export function alignScales(box: Box, cells: Cells, pitch: Pitch): Scales {
  //@ verify
  //@ requires box.w > 0 && box.h > 0 && pitch.w > 0 && pitch.h > 0 && cells.across >= 1 && cells.down >= 1
  //@ ensures \result.sx > 0 && \result.sy > 0
  //@ ensures \result.sx * PERCENT <= \result.sy * (PERCENT + MAX_STRETCH) && \result.sy * PERCENT <= \result.sx * (PERCENT + MAX_STRETCH)
  //@ ensures (cells.across < STRETCH_CELLS || cells.down < STRETCH_CELLS) ==> \result.sx === \result.sy
  //@ ensures \result.sx === \result.sy || (box.w * \result.sx === cells.across * pitch.w && box.h * \result.sy === cells.down * pitch.h)
  const s = alignScale(box, cells, pitch);
  if (cells.across < STRETCH_CELLS || cells.down < STRETCH_CELLS) return { sx: s, sy: s };
  const sx = (cells.across * pitch.w) / box.w;
  const sy = (cells.down * pitch.h) / box.h;
  if (sx * PERCENT > sy * (PERCENT + MAX_STRETCH) || sy * PERCENT > sx * (PERCENT + MAX_STRETCH))
    return { sx: s, sy: s };
  return { sx, sy };
}

/**
 * The map's frame after `move`, its sides along the axes. Every point of
 * the map moves the same way, so the map's own cells keep lining up with
 * the box drawn over them.
 */
export function alignFrame(map: Frame, move: Move): Frame {
  //@ verify
  //@ requires move.sx > 0 && move.sy > 0 && map.w > 0 && map.h > 0
  //@ ensures \result.w > 0 && \result.h > 0
  //@ ensures \result.w === map.w * move.sx && \result.h === map.h * move.sy
  //@ ensures \result.x - \result.w / 2 === move.to.x + (map.x - map.w / 2 - move.from.x) * move.sx
  //@ ensures \result.x + \result.w / 2 === move.to.x + (map.x + map.w / 2 - move.from.x) * move.sx
  //@ ensures \result.y - \result.h / 2 === move.to.y + (map.y - map.h / 2 - move.from.y) * move.sy
  //@ ensures \result.y + \result.h / 2 === move.to.y + (map.y + map.h / 2 - move.from.y) * move.sy
  const { from, to, sx, sy } = move;
  return {
    x: to.x + (map.x - from.x) * sx,
    y: to.y + (map.y - from.y) * sy,
    w: map.w * sx,
    h: map.h * sy,
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
