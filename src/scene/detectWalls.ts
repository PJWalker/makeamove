import { fromLocal } from "./geometry";
import { snapToLattice } from "./grid";
import type { Grid, Point } from "./grid";
import type { Transform } from "./types";
import { wallBetween, wallEnds } from "./vision";
import { simplifyPath } from "./wallTrace";
import type { Corner } from "./wallTrace";

/*
 * Finding the walls in a map's image. The image is shrunk to a few samples
 * per grid cell and split into dark and light, around a threshold that best
 * separates its shades (Otsu's). Specks too small to be walls go; then the
 * outline between dark and light is traced along the samples' edges,
 * simplified (see wallTrace.ts), placed on the map and snapped to the grid.
 * Either side of the outline may be the wall: a dark line on a light floor
 * gives a wall on each side, a lit room in a dark cave one round it.
 */

/** An image's brightness, 0–255 a sample, row by row. */
export interface Shades {
  width: number;
  height: number;
  data: Uint8Array;
}

/** How the GM tunes detection: each from 1 to 9, 5 by default. */
export interface DetectSettings {
  /** How dark a shade has to be to count as wall; higher counts paler shades. */
  darkness: number;
  /** How small a feature is still found, and how closely walls follow it. */
  detail: number;
}

export const DEFAULT_DETECT: DetectSettings = { darkness: 5, detail: 5 };
export const DETECT_MIN = 1;
export const DETECT_MAX = 9;

/** Samples of the image to each grid cell. */
export const SAMPLES_PER_CELL = 6;
/** The most samples along an image's longer side. */
export const MAX_SAMPLES = 1024;

const LEVELS = 256;
/** How far each step of darkness moves the threshold, in shades. */
const DARKNESS_STEP = 14;
/** At each step of detail: how far a wall may stray from the outline, in samples (squared). */
const TOLERANCE2 = [16, 12, 9, 6, 4, 3, 2, 1, 1];
/** At each step of detail: the smallest feature kept, in cells. */
const MIN_AREA = [2, 1.2, 0.8, 0.5, 0.3, 0.2, 0.12, 0.06, 0.03];
/** How close, as a share of a cell, a wall's end must be to a grid corner to snap to it. */
const SNAP_REACH = 0.25;
const HALF = 0.5;

const R = 0.299;
const G = 0.587;
const B = 0.114;

/** The brightness of RGBA pixels; transparent ones count as dark, as unmapped space. */
export function shadesOf(rgba: Uint8ClampedArray, width: number, height: number): Shades {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const o = index * 4;
    const alpha = rgba[o + 3]! / (LEVELS - 1);
    data[index] = Math.round((R * rgba[o]! + G * rgba[o + 1]! + B * rgba[o + 2]!) * alpha);
  }
  return { width, height, data };
}

/** The threshold that best splits the shades in two (Otsu's method): those at or below it are dark. */
export function otsu({ data }: Shades): number {
  const counts = new Float64Array(LEVELS);
  for (const v of data) counts[v]!++;
  let sum = 0;
  for (let v = 0; v < LEVELS; v++) sum += v * counts[v]!;
  let below = 0;
  let belowSum = 0;
  let best = 0;
  let bestSpread = -1;
  for (let t = 0; t < LEVELS; t++) {
    below += counts[t]!;
    belowSum += t * counts[t]!;
    const above = data.length - below;
    if (below === 0 || above === 0) continue;
    const gap = belowSum / below - (sum - belowSum) / above;
    const spread = below * above * gap * gap;
    if (spread > bestSpread) {
      bestSpread = spread;
      best = t;
    }
  }
  return best;
}

/** Which samples are wall: 1 for dark, 0 for light. */
export function darkMask(shades: Shades, threshold: number): Uint8Array {
  return shades.data.map((v) => (v <= threshold ? 1 : 0));
}

/** A grid of samples' size. */
export interface Size {
  width: number;
  height: number;
}

/** The samples beside sample `index`, up, down, left and right, within the image. */
function neighbours(index: number, { width, height }: Size): number[] {
  const x = index % width;
  const y = (index - x) / width;
  const next: number[] = [];
  if (x > 0) next.push(index - 1);
  if (x < width - 1) next.push(index + 1);
  if (y > 0) next.push(index - width);
  if (y < height - 1) next.push(index + width);
  return next;
}

/**
 * Fill in patches smaller than `minArea` samples with what surrounds them:
 * first specks of dark, then holes of light.
 */
export function despeckle(mask: Uint8Array, size: Size, minArea: number) {
  for (const kind of [1, 0]) {
    const seen = new Uint8Array(mask.length);
    /** The patch of samples like `start` joined to it; it grows as it's read. */
    const patchFrom = (start: number) => {
      const patch = [start];
      seen[start] = 1;
      for (const index of patch)
        for (const n of neighbours(index, size)) {
          if (seen[n] || mask[n] !== kind) continue;
          seen[n] = 1;
          patch.push(n);
        }
      return patch;
    };
    for (let start = 0; start < mask.length; start++) {
      if (seen[start] || mask[start] !== kind) continue;
      const patch = patchFrom(start);
      if (patch.length < minArea) for (const index of patch) mask[index] = 1 - kind;
    }
  }
}

/** Edges between corners of samples, by the corner each leaves from; corners are numbered row by row. */
interface Edges {
  /** Across a row of corners: one more than the samples. */
  stride: number;
  out: Map<number, number[]>;
  /** How many edges arrive at each corner. */
  into: Map<number, number>;
}

/** Every edge between a dark sample and a light one, running with the dark on its right. */
function outlineEdges(mask: Uint8Array, { width, height }: Size): Edges {
  const stride = width + 1;
  const edges: Edges = { stride, out: new Map(), into: new Map() };
  const dark = (x: number, y: number) => mask[y * width + x] === 1;
  const add = (from: Corner, to: Corner) => {
    const a = from.y * stride + from.x;
    const b = to.y * stride + to.x;
    const list = edges.out.get(a);
    if (list) list.push(b);
    else edges.out.set(a, [b]);
    edges.into.set(b, (edges.into.get(b) ?? 0) + 1);
  };
  for (let y = 1; y < height; y++)
    for (let x = 0; x < width; x++) {
      const above = dark(x, y - 1);
      if (above === dark(x, y)) continue;
      const [l, r] = [
        { x, y },
        { x: x + 1, y },
      ];
      if (above) add(r, l);
      else add(l, r);
    }
  for (let y = 0; y < height; y++)
    for (let x = 1; x < width; x++) {
      const left = dark(x - 1, y);
      if (left === dark(x, y)) continue;
      const [t, b] = [
        { x, y },
        { x, y: y + 1 },
      ];
      if (left) add(t, b);
      else add(b, t);
    }
  return edges;
}

/** How far a path turns right going from `a` through `b` to `c`. */
const turn = (a: Corner, b: Corner, c: Corner) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

/** Follow edges from corner `start` until they run out, using each once. */
function walk(edges: Edges, start: number): Corner[] {
  const { stride, out } = edges;
  const corner = (id: number): Corner => ({ x: id % stride, y: Math.floor(id / stride) });
  const path = [corner(start)];
  let at = start;
  for (let list = out.get(at); list?.length; list = out.get(at)) {
    const from = path.at(-2);
    // Turning right first, so loops that touch at a corner stay apart.
    if (from && list.length > 1) {
      const here = corner(at);
      list.sort((p, q) => turn(from, here, corner(q)) - turn(from, here, corner(p)));
    }
    at = list.shift()!;
    path.push(corner(at));
  }
  return path;
}

/**
 * The outline between dark and light samples, as paths along the samples'
 * edges, each with the dark on its right. Paths that reach the image's edge
 * stop there (its border is no wall); the rest are loops, first point repeated last.
 */
export function traceOutlines(mask: Uint8Array, size: Size): Corner[][] {
  const edges = outlineEdges(mask, size);
  const paths: Corner[][] = [];
  // Paths from the image's edge first, where more edges leave a corner than arrive; then the loops left over.
  const starts = [...edges.out].flatMap(([id, list]) =>
    Array.from({ length: Math.max(0, list.length - (edges.into.get(id) ?? 0)) }, () => id),
  );
  for (const id of starts) if (edges.out.get(id)?.length) paths.push(walk(edges, id));
  for (const [id, list] of edges.out) while (list.length > 0) paths.push(walk(edges, id));
  return paths;
}

/** A loop turned to start on a corner, so its seam doesn't fall mid wall. */
function fromACorner(path: Corner[]): Corner[] {
  const first = path[0]!;
  const last = path.at(-1)!;
  const n = path.length - 1;
  if (first.x !== last.x || first.y !== last.y || n < 2) return path;
  const ring = path.slice(0, -1);
  const at = ring.findIndex((b, k) => turn(ring[(k + n - 1) % n]!, b, ring[(k + 1) % n]!) !== 0);
  if (at <= 0) return path;
  const turned = [...ring.slice(at), ...ring.slice(0, at)];
  return [...turned, turned[0]!];
}

/** A setting's step, from 0. */
const level = (v: number) => Math.min(DETECT_MAX, Math.max(DETECT_MIN, Math.round(v))) - DETECT_MIN;

/** The simplified outline of a map's walls, in samples. */
export function outlinePaths(
  shades: Shades,
  settings: DetectSettings,
  samplesPerCell: number,
): Corner[][] {
  const darkness = level(settings.darkness);
  const detail = level(settings.detail);
  const threshold = otsu(shades) + (darkness - level(DEFAULT_DETECT.darkness)) * DARKNESS_STEP;
  const mask = darkMask(shades, threshold);
  despeckle(mask, shades, MIN_AREA[detail]! * samplesPerCell * samplesPerCell);
  return traceOutlines(mask, shades).map((path) => {
    const loop = fromACorner(path);
    return simplifyPath(loop, TOLERANCE2[detail]!).map((k) => loop[k]!);
  });
}

/** Where the image's samples lie: the map's place, and how many samples it was cut into. */
export interface SampledMap extends Size {
  frame: Transform;
}

/** What else on the scene new walls fit to: its grid, and the walls already there. */
export interface WallSetting {
  grid: Grid;
  existing: readonly Transform[];
}

/** A wall's ends, rounded to compare: the same either way round. */
function segmentKey(a: Point, b: Point): string {
  const [p, q] = [a, b].map((c) => `${String(Math.round(c.x))},${String(Math.round(c.y))}`);
  return p! < q! ? `${p!} ${q!}` : `${q!} ${p!}`;
}

const COLLINEAR = 1e-6;

/** Whether going from `a` through `b` to `c` carries straight on. */
function straight(a: Point, b: Point, c: Point): boolean {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const cross = ux * vy - uy * vx;
  return (
    Math.abs(cross) <= COLLINEAR * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0
  );
}

/** Points along a path, without repeats, and without the middle of any straight run. */
function joinRuns(points: Point[]): Point[] {
  const joined: Point[] = [];
  for (const p of points) {
    const last = joined.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) continue;
    const before = joined.at(-2);
    if (before && last && straight(before, last, p)) joined.pop();
    joined.push(p);
  }
  return joined;
}

/**
 * The walls along outline paths on a map: placed on the map, with their ends
 * snapped to nearby grid corners on a square grid, straight runs joined,
 * and none twice or where a wall already is.
 */
export function wallsAlong(
  paths: Corner[][],
  map: SampledMap,
  { grid, existing }: WallSetting,
): Transform[] {
  const { frame, width, height } = map;
  const reach = grid.type === "square" ? grid.size * SNAP_REACH : 0;
  const place = (c: Corner): Point => {
    const p = fromLocal(frame, {
      x: (c.x / width - HALF) * frame.w,
      y: (c.y / height - HALF) * frame.h,
    });
    const q = snapToLattice(grid, p, grid.size);
    return reach && Math.hypot(q.x - p.x, q.y - p.y) <= reach ? q : p;
  };
  const seen = new Set(
    existing.map((t) => {
      const { a, b } = wallEnds(t);
      return segmentKey(a, b);
    }),
  );
  const walls: Transform[] = [];
  for (const path of paths) {
    const points = joinRuns(path.map((c) => place(c)));
    for (let k = 1; k < points.length; k++) {
      const [a, b] = [points[k - 1]!, points[k]!];
      const key = segmentKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      walls.push(wallBetween(a, b));
    }
  }
  return walls;
}
