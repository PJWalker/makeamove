/* eslint-disable @typescript-eslint/no-magic-numbers */
/*
 * A 3D Gaussian splat: a soft, coloured ellipsoid. A cloud of them, packed
 * into one Float32Array by `pack`, is what splatCloud.ts draws.
 */

export type Vec3 = readonly [number, number, number];

/** How a splat moves, worked out on the GPU each frame. */
export const MOTION = {
  still: 0,
  /** Rises from where it sits, cooling and shrinking, then starts again: a tongue of flame. */
  flame: 1,
  /** Circles its light. */
  orbit: 2,
  /** Drifts slowly upwards, fading in and out: dust in the air. */
  drift: 3,
  /** Rises and spreads, thinning out: smoke. */
  smoke: 4,
  /** Swells where it hangs, then falls to the floor: a drip of water. */
  drip: 5,
  /** A subtle full-body idle, separate from environmental motion. */
  idle: 6,
} as const;
export type Motion = (typeof MOTION)[keyof typeof MOTION];

export interface Splat {
  at: Vec3;
  /** Its three principal axes, each as long as one standard deviation. */
  axes: readonly [Vec3, Vec3, Vec3];
  /** Linear RGB. */
  colour: Vec3;
  opacity: number;
  /** Which way its surface faces, for lighting. */
  facing: Vec3;
  /** A glowing splat gives off its own colour, added to what's behind it; the rest are lit by the lights. */
  glow: boolean;
  /** The light it belongs to, whose flicker it shares and whose wandering it follows. */
  light?: number | undefined;
  motion: Motion;
  /** Where in its motion's cycle it starts, from 0 to 1. */
  phase: number;
}

/**
 * Each splat packs into a row of STRIDE numbers: its centre (3), its
 * covariance's xx, xy, xz, yy, yz, zz (6), colour and opacity (4), facing (3),
 * motion, light + 1 (0 for none) and phase (3), and glow (1).
 */
export const STRIDE = 20;

/** A splat's covariance from its axes: xx, xy, xz, yy, yz, zz. */
function covariance([[ax, ay, az], [bx, by, bz], [cx, cy, cz]]: Splat["axes"]) {
  return [
    ax * ax + bx * bx + cx * cx,
    ax * ay + bx * by + cx * cy,
    ax * az + bx * bz + cx * cz,
    ay * ay + by * by + cy * cy,
    ay * az + by * bz + cy * cz,
    az * az + bz * bz + cz * cz,
  ];
}

export function pack(splats: readonly Splat[]): Float32Array {
  const data = new Float32Array(splats.length * STRIDE);
  let row = 0;
  for (const { at, axes, colour, opacity, facing, motion, light, phase, glow } of splats) {
    data.set(at, row);
    data.set(covariance(axes), row + 3);
    data.set(colour, row + 9);
    data[row + 12] = opacity;
    data.set(facing, row + 13);
    data[row + 16] = motion;
    data[row + 17] = (light ?? -1) + 1;
    data[row + 18] = phase;
    data[row + 19] = glow ? 1 : 0;
    row += STRIDE;
  }
  return data;
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, by: number): Vec3 => [a[0] * by, a[1] * by, a[2] * by];
export const times = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** Two directions at right angles to `normal` and each other, the first as near to `along` as it can be. */
export function tangents(normal: Vec3, along: Vec3): [Vec3, Vec3] {
  let first = sub(along, scale(normal, dot(along, normal)));
  if (length(first) < 1e-3)
    first = cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  first = normalize(first);
  return [first, cross(normal, first)];
}

/** A linear colour from a CSS hex colour. */
export function hex(code: string): Vec3 {
  const value = Number.parseInt(code.slice(1), 16);
  const channel = (shift: number) => (((value >> shift) & 255) / 255) ** 2.2;
  return [channel(16), channel(8), channel(0)];
}
