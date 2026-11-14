import type { Rect } from "./camera";

import type { Point } from "./grid";
import { distanceToSegment, distanceToStroke } from "./stroke";
import { isPlainToken, type SceneElement, type ShapeGeometry, type Transform } from "./types";

/** p in the element's own frame: origin at its centre, unrotated, unscaled. */
export function toLocal(t: Transform, p: Point): Point {
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const c = Math.cos(-t.rot);
  const s = Math.sin(-t.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function fromLocal(t: Transform, p: Point): Point {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  return { x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c };
}

/** Corners in world space: top-left, top-right, bottom-right, bottom-left. */
export function corners(t: Transform): Point[] {
  const hw = t.w / 2;
  const hh = t.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => fromLocal(t, p));
}

/** Axis-aligned bounds of one or more elements. */
export function bounds(ts: readonly Transform[]): Rect | null {
  if (!ts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of ts) {
    for (const c of corners(t)) {
      x0 = Math.min(x0, c.x);
      y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x);
      y1 = Math.max(y1, c.y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const contains = (outer: Rect, inner: Rect) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** A shape's outline in its own frame (see ShapeKind) at the size w × h, as points around it. */
export function shapeOutline(geo: ShapeGeometry, w: number, h: number): Point[] {
  const hw = w / 2;
  const hh = h / 2;
  switch (geo.shape) {
    case "rect":
    case "line":
      return [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    case "cone":
      return [
        { x: -hw, y: 0 },
        { x: hw, y: -hh },
        { x: hw, y: hh },
      ];
    case "circle": {
      const n = 48;
      return Array.from({ length: n }, (_, i) => ({
        x: hw * Math.cos((i / n) * Math.PI * 2),
        y: hh * Math.sin((i / n) * Math.PI * 2),
      }));
    }
    case "polygon": {
      const sx = w / geo.bw;
      const sy = h / geo.bh;
      const out: Point[] = [];
      for (let i = 0; i < geo.points.length; i += 2)
        out.push({ x: geo.points[i]! * sx, y: geo.points[i + 1]! * sy });
      return out;
    }
  }
}

/** Whether world point p is inside a shape, grown by `margin` world px (a circle's or a cone's edge counts as in). */
export function shapeCovers(el: Transform & ShapeGeometry, p: Point, margin = 0): boolean {
  const l = toLocal(el, p);
  if (el.shape === "circle") {
    const rx = el.w / 2 + margin;
    const ry = el.h / 2 + margin;
    return (l.x * l.x) / (rx * rx) + (l.y * l.y) / (ry * ry) <= 1;
  }
  if (el.shape === "cone") {
    // Within its length, and within the widening wedge.
    const t = (l.x + el.w / 2) / el.w;
    return (
      t >= -margin / el.w &&
      t <= 1 + margin / el.w &&
      Math.abs(l.y) <= (el.h / 2) * Math.max(0, t) + margin
    );
  }
  if (el.shape === "polygon") {
    const poly = shapeOutline(el, el.w, el.h);
    return (
      insidePolygon(poly, l) ||
      poly.some((a, i) => {
        const b = poly[(i + 1) % poly.length]!;
        return distanceToSegment(l.x, l.y, a.x, a.y, b.x, b.y) <= margin;
      })
    );
  }
  return Math.abs(l.x) <= el.w / 2 + margin && Math.abs(l.y) <= el.h / 2 + margin;
}

/**
 * The tokens an area covers: those with their centre in it, or any of their
 * edge within it (a token half in a cone is caught).
 */
export function tokensCovered(
  area: Transform & ShapeGeometry,
  tokens: (Transform & { id: string })[],
): string[] {
  return tokens.flatMap((t) => {
    const r = Math.min(t.w, t.h) / 2;
    // The centre, and eight points just inside the token's edge.
    const samples = [
      { x: t.x, y: t.y },
      ...Array.from({ length: 8 }, (_, i) => ({
        x: t.x + r * 0.8 * Math.cos((i * Math.PI) / 4),
        y: t.y + r * 0.8 * Math.sin((i * Math.PI) / 4),
      })),
    ];
    return samples.some((p) => shapeCovers(area, p)) ? [t.id] : [];
  });
}

/** Whether world point p touches the element, within `tolerance` world px. */
export function hits(el: SceneElement, p: Point, tolerance = 0): boolean {
  const l = toLocal(el, p);
  const hw = el.w / 2;
  const hh = el.h / 2;
  switch (el.type) {
    case "map":
      return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= hh + tolerance;
    case "token":
      if (isPlainToken(el))
        return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= hh + tolerance;
      return Math.hypot(l.x, l.y) <= Math.min(hw, hh) + tolerance;
    case "drawing": {
      if (Math.abs(l.x) > hw + tolerance || Math.abs(l.y) > hh + tolerance) return false;
      const sx = el.w / el.bw;
      const sy = el.h / el.bh;
      const scale = (sx + sy) / 2;
      const d = distanceToStroke(el.points, l.x / sx, l.y / sy) * scale;
      return d <= (el.width / 2) * scale + tolerance;
    }
    case "shape":
      return shapeCovers(el, p, tolerance + el.width / 2);
    case "effect":
      return shapeCovers(el, p, tolerance);
    case "text":
      return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= hh + tolerance;
    case "wall":
      // Along its length, within a few px of the line.
      return Math.abs(l.x) <= hw + tolerance && Math.abs(l.y) <= Math.max(hh, 4) + tolerance;
    case "light":
      return Math.hypot(l.x, l.y) <= Math.min(hw, hh) + tolerance;
    case "area":
      return insidePolygon(areaPolygon(el), p);
  }
}

/** Whether p is inside a polygon (even-odd). */
export function insidePolygon(poly: Point[], p: Point): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** A shape's outline in the world, at its size and rotation. */
export function shapePolygon(el: Transform & ShapeGeometry): Point[] {
  return shapeOutline(el, el.w, el.h).map((p) => fromLocal(el, p));
}

/** An area's corners in the world, at its size and rotation. */
export function areaPolygon(el: Transform & { points: number[]; bw: number; bh: number }): Point[] {
  if (el.points.length % 2 !== 0) throw new RangeError("Area points must be coordinate pairs");
  const sx = el.w / el.bw;
  const sy = el.h / el.bh;
  const out: Point[] = [];
  for (let i = 0; i < el.points.length; i += 2)
    out.push(fromLocal(el, { x: el.points[i]! * sx, y: el.points[i + 1]! * sy }));
  return out;
}

export type Corner = 0 | 1 | 2 | 3;
export const CORNER_SIGNS: readonly [Point, Point, Point, Point] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

/**
 * Resize by dragging `corner` to world point p, keeping the opposite corner
 * where it is. With `keepAspect` the shape scales uniformly.
 */
export function resizeFromCorner(
  t: Transform,
  corner: Corner,
  p: Point,
  keepAspect: boolean,
  min = 8,
): Transform {
  const sign = CORNER_SIGNS[corner];
  const opposite = { x: (-sign.x * t.w) / 2, y: (-sign.y * t.h) / 2 };
  const l = toLocal(t, p);
  let w = Math.max(min, (l.x - opposite.x) * sign.x);
  let h = Math.max(min, (l.y - opposite.y) * sign.y);
  if (keepAspect) {
    const k = Math.max(w / t.w, h / t.h);
    w = Math.max(min, t.w * k);
    h = Math.max(min, t.h * k);
  }
  const centre = fromLocal(t, {
    x: opposite.x + (sign.x * w) / 2,
    y: opposite.y + (sign.y * h) / 2,
  });
  return { ...t, x: centre.x, y: centre.y, w, h };
}

/** Rotation that points the element's top towards p, optionally in steps. */
export function rotationTowards(t: Transform, p: Point, stepDeg = 0): number {
  let rot = Math.atan2(p.y - t.y, p.x - t.x) + Math.PI / 2;
  if (stepDeg) {
    const step = (stepDeg * Math.PI) / 180;
    rot = Math.round(rot / step) * step;
  }
  // Normalise to (-π, π].
  rot = Math.atan2(Math.sin(rot), Math.cos(rot));
  return Math.abs(rot) < 1e-9 ? 0 : rot;
}
