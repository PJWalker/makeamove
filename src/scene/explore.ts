import { bounds } from "./geometry";
import { cellOr } from "./grid";
import type { Grid, Point } from "./grid";
import type { SceneElement } from "./types";
import { blocked, sightPolygon, sightSegments } from "./vision";
import type { Box, Segment } from "./vision";

/*
 * Exploring, for fog of war: as characters move, what they see from each
 * place they stop on or pass through is remembered (see SceneDoc.explore).
 * Places are kept a half cell apart, keyed by where they are, so whichever
 * device records a place, it's recorded once.
 */

/** A cell's size on a scene without a grid, in px. */
const NO_GRID_CELL = 70;
/** How many places a character's sight is remembered from across each cell. */
const PLACES_PER_CELL = 2;

const placeSize = (grid: Grid) => cellOr(grid, NO_GRID_CELL) / PLACES_PER_CELL;

/** The key of the place `p` is in. */
export function exploreKey(grid: Grid, p: Point): string {
  const size = placeSize(grid);
  return `${String(Math.floor(p.x / size))},${String(Math.floor(p.y / size))}`;
}

/** How far a character can see on a scene without maps to bound it, in cells. */
const OPEN_SIGHT = 30;

/** How far sight reaches from `from`: the scene's maps, or a way round it if there are none. */
export function sightBox(elements: readonly SceneElement[], from: Point, grid: Grid): Box {
  const maps = bounds(elements.filter((element) => element.type === "map"));
  const r = cellOr(grid, NO_GRID_CELL) * OPEN_SIGHT;
  const around = { x: from.x - r, y: from.y - r, w: r + r, h: r + r };
  if (!maps) return around;
  // Reaching the token, even off the maps.
  const x0 = Math.min(maps.x, from.x - 1);
  const y0 = Math.min(maps.y, from.y - 1);
  const x1 = Math.max(maps.x + maps.w, from.x + 1);
  const y1 = Math.max(maps.y + maps.h, from.y + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The most places remembered along one move. */
const MAX_STEPS = 64;

/** The places along a move from a to b, a half cell apart; just b if a wall is in the way. */
export function placesAlong(grid: Grid, [a, b]: [Point, Point], walls: Segment[]): Point[] {
  if (blocked(a, b, walls)) return [b];
  const steps = Math.min(MAX_STEPS, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / placeSize(grid)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = steps === 0 ? 1 : index / steps;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

/** Where explorers have been, and which places are remembered already. */
interface Exploring {
  grid: Grid;
  known: (key: string) => boolean;
  /** Where each explorer was last seen; updated as they're seen again. */
  last: Map<string, Point>;
}

/** What `explorers` see from the places they've moved through since they were last seen, that aren't known yet, by key. */
export function newSights(
  elements: readonly SceneElement[],
  explorers: readonly SceneElement[],
  { grid, known, last }: Exploring,
): Map<string, number[]> {
  const sights = new Map<string, number[]>();
  const walls = sightSegments(elements);
  for (const element of explorers) {
    const at = { x: element.x, y: element.y };
    const before = last.get(element.id);
    last.set(element.id, at);
    for (const p of before ? placesAlong(grid, [before, at], walls) : [at]) {
      const key = exploreKey(grid, p);
      if (known(key) || sights.has(key)) continue;
      sights.set(key, sightPolygon(p, walls, sightBox(elements, p, grid)));
    }
  }
  return sights;
}
