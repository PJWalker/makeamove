import { seededRandom } from "../lib/seededRandom";

/*
 * The cave's rock, as a painter would block it in: arches of stone receding
 * towards a vanishing point, each darker than the one before, a floor running
 * away under them, and loose brush daubs over the lot. The far end is left
 * as bare darkness, where the lobby's interface sits.
 */

/** The picture's own coordinates: the SVG view box. */
export const VIEW = { width: 1600, height: 1000 } as const;

export interface Point {
  x: number;
  y: number;
}

/** One brush stroke. */
export interface Daub {
  points: [Point, Point, Point];
  width: number;
  colour: string;
  opacity: number;
}

export interface Shape {
  d: string;
  colour: string;
}

export interface Rock {
  /** The arches of the tunnel, nearest first; the last is the dark at its end. */
  arches: Shape[];
  /** The floor, to be filled with a gradient that darkens into the distance. */
  floor: string;
  /** Stalactites and stalagmites standing clear of the walls. */
  spikes: Shape[];
  daubs: Daub[];
}

type Rgb = readonly [number, number, number];

const VANISH: Point = { x: 800, y: 420 };
/** The tunnel's half width where it bulges widest, at a scale of one. */
const UNIT = 500;
/** How far the floor lies below the vanishing point, in units. */
const FLOOR = 0.42;
/** The share of a wall, at each end of the arch, that curves in to meet the floor. */
const FOOT = 0.14;
/** The scale of the tunnel's cross-section nearest the viewer, and at its far end. */
const NEAR = 1.9;
const FAR = 0.75;

const VOID: Rgb = [6, 6, 10];
const NEAR_ROCK: Rgb = [104, 76, 52];
const WALL_PAINTS: [Rgb, ...Rgb[]] = [
  [122, 90, 56],
  [96, 68, 46],
  [74, 56, 50],
  [62, 52, 62],
  [150, 112, 68],
  [44, 34, 36],
];
const FLOOR_PAINTS: [Rgb, ...Rgb[]] = [
  [112, 84, 56],
  [84, 62, 44],
  [58, 46, 42],
  [138, 104, 66],
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const css = (c: Rgb) => `rgb(${c.map(Math.round).join(" ")})`;
const round = (n: number) => Math.round(n * 10) / 10;
const at = ({ x, y }: Point) => `${round(x)} ${round(y)}`;

/** The tunnel's cross-section: from the foot of the left wall, over the roof, to the foot of the right. */
function section(u: number): Point {
  if (u > 0.5) {
    const mirrored = section(1 - u);
    return { x: -mirrored.x, y: mirrored.y };
  }
  if (u < FOOT) {
    const rise = u / FOOT;
    return { x: -(0.78 + 0.22 * Math.sin((rise * Math.PI) / 2)), y: FLOOR * (1 - rise) };
  }
  const angle = ((u - FOOT) / (1 - 2 * FOOT)) * Math.PI;
  return { x: -Math.cos(angle), y: -1.1 * Math.sin(angle) ** 0.8 };
}

/** The cross-section's scale at a depth from 0 (nearest) to 1 (the far end), evenly spaced in distance. */
const scaleAt = (depth: number) => 1 / (1 / NEAR + depth * (1 / FAR - 1 / NEAR));

function project(u: number, depth: number, swell = 1): Point {
  const p = section(u);
  const size = scaleAt(depth) * UNIT * swell;
  return { x: VANISH.x + p.x * size, y: VANISH.y + p.y * size };
}

/** A closed curve through the points' midpoints, so the outline has no corners. */
function smooth(points: Point[]): string {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return "";
  const curve = points.slice(1, -1).map((point, i) => {
    const next = points[i + 2] ?? last;
    return `Q${at(point)} ${at({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 })}`;
  });
  return `M${at(first)}${curve.join("")}L${at(last)}Z`;
}

const ARCHES = 9;
const ARCH_STEPS = 44;

function arch(index: number, random: () => number): Shape {
  const depth = index / (ARCHES - 1);
  const ripples = Array.from({ length: 4 }, () => ({
    size: 0.012 + random() * 0.026,
    waves: 2 + random() * 8,
    phase: random() * Math.PI * 2,
  }));
  const points = Array.from({ length: ARCH_STEPS + 1 }, (_, step) => {
    const u = step / ARCH_STEPS;
    const swell = ripples.reduce(
      (sum, r) => sum + r.size * Math.sin(u * r.waves * Math.PI * 2 + r.phase),
      1,
    );
    return project(u, depth, swell);
  });
  const colour = index === ARCHES - 1 ? VOID : mix(NEAR_ROCK, VOID, depth ** 0.75);
  return { d: smooth(points), colour: css(colour) };
}

const pick = <T>(list: readonly [T, ...T[]], random: () => number) =>
  list[Math.floor(random() * list.length)] ?? list[0];

/** A stroke following the rock's strata around the arch. */
function wallDaub(random: () => number): Daub {
  const depth = random() ** 0.85 * 0.93;
  const u = random();
  const reach = (0.02 + random() * 0.05) * (random() < 0.5 ? -1 : 1);
  const swell = 1.02 + random() * 0.1;
  const end = Math.min(1, Math.max(0, u + reach));
  const size = scaleAt(depth);
  // The roof is furthest from the torches, so it's painted darkest.
  const roof = Math.sin(u * Math.PI) ** 3 * 0.35;
  const shade = Math.min(0.95, depth ** 0.9 * 0.85 + roof);
  return {
    points: [
      project(u, depth, swell),
      project((u + end) / 2, depth, swell + (random() - 0.5) * 0.05),
      project(end, depth + (random() - 0.5) * 0.03, swell),
    ],
    width: size * (9 + random() * 20),
    colour: css(mix(pick(WALL_PAINTS, random), VOID, shade)),
    opacity: 0.35 + random() * 0.5,
  };
}

/** A stroke lying across the floor, smaller and darker the further away it is. */
function floorDaub(random: () => number): Daub {
  const far = VANISH.y + FLOOR * UNIT * FAR;
  const y = far + (VIEW.height + 20 - far) * (0.04 + 0.96 * random() ** 1.2);
  const size = (y - VANISH.y) / (FLOOR * UNIT);
  const halfWidth = Math.min(0.78 * size * UNIT, VIEW.width / 2 + 60);
  const x = VANISH.x + (random() * 2 - 1) * halfWidth;
  const length = size * (14 + random() * 44);
  const tilt = (random() - 0.5) * size * 5;
  const shade = Math.min(0.92, 1 - ((y - far) / (VIEW.height - far)) ** 0.8);
  return {
    points: [
      { x: x - length, y: y - tilt },
      { x, y: y + (random() - 0.5) * size * 4 },
      { x: x + length, y: y + tilt },
    ],
    width: size * (3 + random() * 7),
    colour: css(mix(pick(FLOOR_PAINTS, random), VOID, shade)),
    opacity: 0.3 + random() * 0.45,
  };
}

/** The floor between the feet of the walls, from the far end out past the bottom of the picture. */
function floor(): string {
  const left = project(0, 1);
  const right = project(1, 1);
  const stretch = (VIEW.height + 60 - VANISH.y) / (left.y - VANISH.y);
  const out = (p: Point) => ({
    x: VANISH.x + (p.x - VANISH.x) * stretch,
    y: VANISH.y + (p.y - VANISH.y) * stretch,
  });
  return `M${at(left)}L${at(right)}L${at(out(right))}L${at(out(left))}Z`;
}

/** Where each spike is rooted, how long it is (negative hangs from the roof), and how deep in the cave. */
const SPIKES: { x: number; y: number; length: number; depth: number }[] = [
  { x: 92, y: -10, length: -250, depth: 0.25 },
  { x: 205, y: -10, length: -150, depth: 0.4 },
  { x: 318, y: -10, length: -205, depth: 0.5 },
  { x: 420, y: 20, length: -110, depth: 0.7 },
  { x: 1190, y: 30, length: -95, depth: 0.72 },
  { x: 1296, y: -10, length: -190, depth: 0.5 },
  { x: 1408, y: -10, length: -130, depth: 0.4 },
  { x: 1516, y: -10, length: -270, depth: 0.25 },
  { x: 352, y: 668, length: 92, depth: 0.55 },
  { x: 428, y: 612, length: 48, depth: 0.75 },
  { x: 1232, y: 640, length: 70, depth: 0.65 },
  { x: 1306, y: 690, length: 112, depth: 0.5 },
];

function spike(root: (typeof SPIKES)[number], random: () => number): Shape {
  const { x, y, length, depth } = root;
  const half = Math.abs(length) * (0.16 + random() * 0.08);
  const lean = (random() - 0.5) * half;
  const tip = { x: x + lean, y: y + -length };
  const waist = y - length * 0.45;
  return {
    d:
      `M${at({ x: x - half, y })}` +
      `Q${at({ x: x - half * 0.35, y: waist })} ${at(tip)}` +
      `Q${at({ x: x + half * 0.45, y: waist })} ${at({ x: x + half, y })}Z`,
    colour: css(mix(mix(NEAR_ROCK, VOID, 0.45), VOID, depth * 0.8)),
  };
}

export function paintRock(): Rock {
  const random = seededRandom("the lost barrows");
  return {
    arches: Array.from({ length: ARCHES }, (_, index) => arch(index, random)),
    floor: floor(),
    spikes: SPIKES.map((root) => spike(root, random)),
    daubs: [
      ...Array.from({ length: 150 }, () => floorDaub(random)),
      ...Array.from({ length: 460 }, () => wallDaub(random)),
    ],
  };
}

export const daubPath = ({ points: [from, bend, to] }: Daub) =>
  `M${at(from)}Q${at(bend)} ${at(to)}`;
