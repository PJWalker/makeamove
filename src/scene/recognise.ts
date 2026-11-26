import { polygonFrame } from "./geometry";
import type { Point } from "./grid";
import { distanceToSegment, STRIDE } from "./stroke";
import type { ShapeGeometry, Transform } from "./types";

/*
 * Recognising a basic shape in a pen stroke: a straight line, a circle or
 * ellipse, a rectangle or square, a cone (an isosceles triangle), or a
 * polygon of up to six corners. Tolerances are fractions of the stroke's size, so a
 * shape is recognised the same at any zoom.
 */

export type RecognisedShape = ShapeGeometry & Transform;

/** How far off its chord a stroke may wander and still be a line. */
const LINE_TOLERANCE = 0.05;
/** How near its start a stroke must end to be closed. */
const CLOSED_GAP = 0.3;
/** How far a closed stroke may stray on average from a circle, rectangle or cone and still be it. */
const BASIC_FIT = 0.05;
/** How far a closed stroke may stray on average from any other polygon and still be it: closer, as it's less likely meant. */
const POLYGON_FIT = 0.02;
/** How far a corner may be off a straight edge before it counts as one. */
const CORNER_TOLERANCE = 0.07;
/** The sharpest bend that's still a straight edge, in degrees. */
const STRAIGHT_DEGREES = 28;
/** How far from square a rectangle's corners may be, in degrees. */
const SQUARE_SLACK_DEGREES = 25;
/** How near an axis (or a diagonal, for a line) a shape snaps onto it, in degrees. */
const AXIS_SNAP_DEGREES = 7;
/** How much longer than its chord a line's path may be, with the hand's wobble. */
const LINE_PATH_SLACK = 1.3;
/** How far back from its end to look for where a closed stroke passed its start, as a fraction of the stroke. */
const OVERSHOOT_REACH = 0.3;
/** How alike an ellipse's axes are for it to be a circle. */
const ROUND = 0.25;
/** How alike a rectangle's sides are for it to be a square. */
const SQUARE = 0.2;
/** How alike an isosceles triangle's two sides are. */
const ISOSCELES = 0.15;
const MAX_CORNERS = 6;
const TRIANGLE = 3;
const QUADRILATERAL = 4;

const HALF_TURN_DEGREES = 180;
const radians = (degrees: number) => (degrees * Math.PI) / HALF_TURN_DEGREES;
const STRAIGHT = radians(STRAIGHT_DEGREES);
const SQUARE_SLACK = radians(SQUARE_SLACK_DEGREES);
const AXIS_SNAP = radians(AXIS_SNAP_DEGREES);
const QUARTER_TURN = Math.PI / 2;
const EIGHTH_TURN = QUARTER_TURN / 2;

/**
 * The basic shape a stroke (flat world [x, y, pressure, …]) looks like, in
 * the world, or null if it's freehand or smaller than `minSize` world px.
 */
export function recogniseShape(stroke: number[], minSize: number): RecognisedShape | null {
  const pts: Point[] = [];
  for (let index = 0; index + 1 < stroke.length; index += STRIDE)
    pts.push({ x: stroke[index]!, y: stroke[index + 1]! });
  if (pts.length <= 1) return null;
  const size = Math.max(extent(pts, 0).length, extent(pts, QUARTER_TURN).length);
  if (size < minSize) return null;
  const first = pts[0]!;
  const last = pts.at(-1)!;
  if (distance(first, last) > CLOSED_GAP * size) return lineThrough(pts);
  return closedShape(trimOvershoot(pts), size);
}

/** A straight line from the stroke's start to its end, if it keeps to that. */
function lineThrough(pts: Point[]): RecognisedShape | null {
  const a = pts[0]!;
  const b = pts.at(-1)!;
  const length = distance(a, b);
  const straight = pts.every(
    (p) => distanceToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= LINE_TOLERANCE * length,
  );
  if (!straight || pathLength(pts) > length * LINE_PATH_SLACK) return null;
  const rot = snapAngle(Math.atan2(b.y - a.y, b.x - a.x), EIGHTH_TURN);
  const c = midpoint(a, b);
  return { shape: "line", x: c.x, y: c.y, w: length, h: 1, rot };
}

/**
 * A closed stroke's ellipse or polygon, whichever it keeps closer to, if
 * it fits. Circles, rectangles and cones fit loosely; other polygons must
 * be drawn closely, as they're less often meant.
 */
function closedShape(pts: Point[], size: number): RecognisedShape | null {
  const fits = (miss: Miss, tolerance: number) => miss.mean / size <= tolerance;
  const ellipse = fitEllipse(pts);
  const polygon = fitPolygon(pts, size);
  // Which it is goes by the worst miss: an ellipse misses a rectangle's corners by far more than a polygon cuts a circle's curves.
  if (fits(ellipse.miss, BASIC_FIT) && (!polygon || ellipse.miss.worst <= polygon.miss.worst)) return ellipse.shape;
  if (!polygon) return null;
  const basic = basicPolygon(polygon.corners);
  if (basic && fits(polygon.miss, BASIC_FIT)) return basic;
  return fits(polygon.miss, POLYGON_FIT) ? polygonShape(polygon.corners) : null;
}

/** Corners as a cone or a rectangle, if they make one. */
function basicPolygon(corners: Point[]): RecognisedShape | null {
  if (corners.length === TRIANGLE) return cone(corners);
  if (corners.length === QUADRILATERAL) return rectangle(corners);
  return null;
}

/** How far a stroke strays from a shape: on average, and at worst. */
interface Miss {
  mean: number;
  worst: number;
}

/** A miss from each point's distance off a shape. */
function missOf(distances: number[]): Miss {
  let sum = 0;
  let worst = 0;
  for (const d of distances) {
    sum += d;
    worst = Math.max(worst, d);
  }
  return { mean: sum / distances.length, worst };
}

/** The ellipse through a closed stroke's extents along its main axes, and how far the stroke strays from it. */
function fitEllipse(pts: Point[]): { shape: RecognisedShape; miss: Miss } {
  const mean = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mean.x) * (p.x - mean.x);
    syy += (p.y - mean.y) * (p.y - mean.y);
    sxy += (p.x - mean.x) * (p.y - mean.y);
  }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2;
  const u = extent(pts, angle);
  const v = extent(pts, angle + QUARTER_TURN);
  const a = u.length / 2;
  const b = v.length / 2;
  const centre = fromAxes(angle, (u.min + u.max) / 2, (v.min + v.max) / 2);
  const miss = missOf(
    pts.map((p) => {
      const l = toAxes(angle, { x: p.x - centre.x, y: p.y - centre.y });
      return (Math.abs(Math.hypot(l.x / a, l.y / b) - 1) * (a + b)) / 2;
    }),
  );
  const round = Math.abs(a - b) <= ROUND * Math.max(a, b);
  const shape: RecognisedShape = round
    ? { shape: "circle", x: centre.x, y: centre.y, w: a + b, h: a + b, rot: 0 }
    : { shape: "circle", x: centre.x, y: centre.y, w: u.length, h: v.length, rot: snapAngle(angle, QUARTER_TURN) };
  return { shape, miss };
}

/** A closed stroke's corners, and how far the stroke strays from the polygon through them; null with too many or too few corners. */
function fitPolygon(pts: Point[], size: number): { corners: Point[]; miss: Miss } | null {
  const first = pts[0]!;
  let far = 0;
  for (const [index, p] of pts.entries()) if (distance(p, first) > distance(pts[far]!, first)) far = index;
  const tolerance = CORNER_TOLERANCE * size;
  const loop = [
    ...simplify(pts.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplify([...pts.slice(far), first], tolerance).slice(0, -1),
  ];
  const corners = dropStraight(loop);
  if (corners.length < TRIANGLE || corners.length > MAX_CORNERS) return null;
  const miss = missOf(
    pts.map((p) => {
      let d = Infinity;
      for (const [index, a] of corners.entries()) {
        const b = corners[(index + 1) % corners.length]!;
        d = Math.min(d, distanceToSegment(p.x, p.y, a.x, a.y, b.x, b.y));
      }
      return d;
    }),
  );
  return { corners, miss };
}

/** A triangle as a cone, if it's isosceles: from its apex to the middle of its base. */
function cone(corners: Point[]): RecognisedShape | null {
  for (const [index, apex] of corners.entries()) {
    const b = corners[(index + 1) % TRIANGLE]!;
    const c = corners.at(index - 1)!;
    const ab = distance(apex, b);
    const ac = distance(apex, c);
    if (Math.abs(ab - ac) > ISOSCELES * Math.max(ab, ac)) continue;
    const base = midpoint(b, c);
    const centre = midpoint(apex, base);
    const rot = snapAngle(Math.atan2(base.y - apex.y, base.x - apex.x), EIGHTH_TURN);
    return { shape: "cone", x: centre.x, y: centre.y, w: distance(apex, base), h: distance(b, c), rot };
  }
  return null;
}

/** Four corners as a rectangle, if they're all near square: a square, if its sides are near alike. */
function rectangle(corners: Point[]): RecognisedShape | null {
  if (corners.some((_, index) => Math.abs(cornerAngle(corners, index) - QUARTER_TURN) > SQUARE_SLACK))
    return null;
  // The edges' mean direction, folded onto a quarter turn.
  let sx = 0;
  let sy = 0;
  for (const [index, a] of corners.entries()) {
    const b = corners[(index + 1) % QUADRILATERAL]!;
    const angle = QUADRILATERAL * Math.atan2(b.y - a.y, b.x - a.x);
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  const rot = snapAngle(Math.atan2(sy, sx) / QUADRILATERAL, QUARTER_TURN);
  // Each side sits midway between the two corners nearest it.
  const side = (angle: number) => {
    const along = corners.map((p) => toAxes(angle, p).x).toSorted((a, b) => a - b);
    return { min: (along[0]! + along[1]!) / 2, max: (along[2]! + along.at(-1)!) / 2 };
  };
  const u = side(rot);
  const v = side(rot + QUARTER_TURN);
  const centre = fromAxes(rot, (u.min + u.max) / 2, (v.min + v.max) / 2);
  const w = u.max - u.min;
  const h = v.max - v.min;
  if (Math.abs(w - h) > SQUARE * Math.max(w, h)) return { shape: "rect", x: centre.x, y: centre.y, w, h, rot };
  return { shape: "rect", x: centre.x, y: centre.y, w: (w + h) / 2, h: (w + h) / 2, rot };
}

const polygonShape = (corners: Point[]): RecognisedShape => ({ shape: "polygon", ...polygonFrame(corners) });

/** Where a closed stroke overshoots its start, cut it back to where it comes closest. */
function trimOvershoot(pts: Point[]): Point[] {
  const first = pts[0]!;
  let best = pts.length - 1;
  for (let index = Math.floor(pts.length * (1 - OVERSHOOT_REACH)); index < pts.length; index++)
    if (distance(pts[index]!, first) < distance(pts[best]!, first)) best = index;
  return pts.slice(0, best + 1);
}

/** Ramer–Douglas–Peucker: the points an open path can't do without, to within `tolerance`. */
function simplify(pts: Point[], tolerance: number): Point[] {
  const a = pts[0]!;
  const b = pts.at(-1)!;
  let worst = 0;
  let at = 0;
  for (let index = 1; index < pts.length - 1; index++) {
    const d = distanceToSegment(pts[index]!.x, pts[index]!.y, a.x, a.y, b.x, b.y);
    if (d > worst) {
      worst = d;
      at = index;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)];
}

/** A closed loop without the corners it barely bends at, the flattest first. */
function dropStraight(loop: Point[]): Point[] {
  const out = [...loop];
  while (out.length > TRIANGLE) {
    let flattest = -1;
    let bend = STRAIGHT;
    for (let index = 0; index < out.length; index++) {
      const turn = Math.PI - cornerAngle(out, index);
      if (turn < bend) {
        bend = turn;
        flattest = index;
      }
    }
    if (flattest < 0) break;
    out.splice(flattest, 1);
  }
  return out;
}

/** The inside angle at a loop's corner, 0 to π. */
function cornerAngle(loop: Point[], index: number): number {
  const p = loop[index]!;
  const a = loop[(index + loop.length - 1) % loop.length]!;
  const b = loop[(index + 1) % loop.length]!;
  const turn = Math.atan2(a.y - p.y, a.x - p.x) - Math.atan2(b.y - p.y, b.x - p.x);
  return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
}

/** An angle in (-π, π], snapped onto the nearest multiple of `step` if it's within AXIS_SNAP of it. */
function snapAngle(angle: number, step: number): number {
  const snapped = Math.round(angle / step) * step;
  const result = Math.abs(angle - snapped) <= AXIS_SNAP ? snapped : angle;
  // Normalised, and never -0.
  return Math.atan2(Math.sin(result), Math.cos(result)) || 0;
}

/** How far points reach along a direction: their least and greatest projection, and the span between. */
function extent(pts: Point[], angle: number) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const along = toAxes(angle, p).x;
    min = Math.min(min, along);
    max = Math.max(max, along);
  }
  return { min, max, length: max - min };
}

const toAxes = (angle: number, p: Point): Point => ({
  x: p.x * Math.cos(angle) + p.y * Math.sin(angle),
  y: -p.x * Math.sin(angle) + p.y * Math.cos(angle),
});

const fromAxes = (angle: number, u: number, v: number): Point => ({
  x: u * Math.cos(angle) - v * Math.sin(angle),
  y: u * Math.sin(angle) + v * Math.cos(angle),
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function centroid(pts: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function pathLength(pts: Point[]): number {
  let length = 0;
  for (let index = 1; index < pts.length; index++) length += distance(pts[index - 1]!, pts[index]!);
  return length;
}
