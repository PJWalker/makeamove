import { DEFAULT_GRID } from "../scene/grid";
import type { SceneLighting } from "../scene/sceneDoc";
import type { NewElement } from "../scene/types";

/*
 * The tutorial's tiny dungeon: an entrance hall lit by a torch, a corridor,
 * and a dark treasure room behind a shut door, with a gap in its far wall
 * for the GM to close. Laid out in grid cells on the default square grid.
 *
 *   0     6  9     14
 *   ┌─────┐  ┌─────┐   0
 *   │ ☺   └──┤ g   │
 *   │  🔥   ──┤door  gap
 *   │     ┌──┤ $   │
 *   └─────┘  └─────┘   5
 */

const CELL = DEFAULT_GRID.size;
const STONE = "#5b5348";
const FLOOR = { stroke: "#00000000", fill: `${STONE}ff`, width: 0 };

/** A cell corner, in world px. */
const at = (cx: number, cy: number) => ({ x: cx * CELL, y: cy * CELL });

/** A wall (or door) from one cell corner to another. */
function wall(from: [number, number], to: [number, number], door?: { open: boolean }): NewElement {
  const a = at(...from);
  const b = at(...to);
  return {
    type: "wall",
    layer: "over",
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    w: Math.hypot(b.x - a.x, b.y - a.y),
    h: 6,
    rot: Math.atan2(b.y - a.y, b.x - a.x),
    // The door stays unlocked, for the GM to pick and open.
    ...(door ? { door: true, open: door.open } : { locked: true }),
  };
}

/** A room's floor, from its top-left cell corner, so many cells across and down. */
function floor([left, top]: [number, number], [across, down]: [number, number]): NewElement {
  return {
    type: "shape",
    shape: "rect",
    layer: "map",
    ...at(left + across / 2, top + down / 2),
    w: across * CELL,
    h: down * CELL,
    rot: 0,
    ...FLOOR,
    locked: true,
  };
}

/** A token a cell across, in the cell (cx, cy), showing one of the bundled icons. */
function token(
  [cx, cy]: [number, number],
  look: { name: string; icon: string; colour: string },
): NewElement {
  return {
    type: "token",
    layer: "token",
    ...at(cx + 0.5, cy + 0.5),
    w: CELL,
    h: CELL,
    rot: 0,
    ...look,
    style: "disc",
  };
}

/** A room's name, written on its floor. */
function label(cx: number, cy: number, text: string): NewElement {
  const w = 220;
  const h = 32;
  return {
    type: "text",
    layer: "under",
    ...at(cx, cy),
    w,
    h,
    bw: w,
    bh: h,
    rot: 0,
    text,
    colour: "#e8dcc4",
    size: 22,
    font: "display",
    bold: true,
    italic: false,
    locked: true,
  };
}

/** The pieces steps point at, by name; the tutorial remembers which element each became. */
export const PIECE_KEYS = ["hero", "goblin", "treasure", "door", "torch"] as const;
export type PieceKey = (typeof PIECE_KEYS)[number];

export const PIECES: Record<PieceKey, NewElement> = {
  hero: token([1, 2], { name: "Hero", icon: "sword", colour: "#3d7dca" }),
  goblin: token([12, 1], { name: "Goblin", icon: "dagger", colour: "#7a9e3c" }),
  treasure: token([12, 3], { name: "Treasure", icon: "bag", colour: "#c9a227" }),
  door: wall([9, 2], [9, 3], { open: false }),
  torch: {
    type: "light",
    layer: "over",
    ...at(3, 2.5),
    w: CELL * 0.6,
    h: CELL * 0.6,
    rot: 0,
    bright: CELL * 3,
    dim: CELL * 5,
    colour: "#ffb35c",
    flicker: true,
  },
};

/** Everything else: floors, walls and labels, locked so they stay put while the player tries things. */
export const DECOR: readonly NewElement[] = [
  floor([0, 0], [6, 5]),
  floor([6, 2], [3, 1]),
  floor([9, 0], [5, 5]),
  label(3, 0.5, "Entrance Hall"),
  label(11.5, 0.5, "Treasure Room"),
  // The entrance hall, open to the corridor on the east.
  wall([0, 0], [6, 0]),
  wall([6, 0], [6, 2]),
  wall([6, 3], [6, 5]),
  wall([6, 5], [0, 5]),
  wall([0, 5], [0, 0]),
  // The corridor.
  wall([6, 2], [9, 2]),
  wall([6, 3], [9, 3]),
  // The treasure room, behind the door, with a gap in its east wall.
  wall([9, 0], [14, 0]),
  wall([14, 0], [14, 2]),
  wall([14, 3], [14, 5]),
  wall([14, 5], [9, 5]),
  wall([9, 5], [9, 3]),
  wall([9, 2], [9, 0]),
];

/** Dark where the torch doesn't reach, so lights and doors show what they do. */
export const LIGHTING: SceneLighting = { enabled: true, darkness: 0.6, vision: false };
