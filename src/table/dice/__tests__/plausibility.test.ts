import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vite-plus/test";
import { simulateDice } from "../physics";
import type { DieHull, DiePose } from "../physics";
import { shapeFor } from "../shapes";

/*
 * The dice physics runs on floating point, which the proofs can't model, so
 * its physical plausibility is checked here instead, over rolls of every die
 * shape. Only the motion that's seen is held to these rules: the part after
 * a die is over its tray (before that, it's drawn flying straight from the hand).
 */

const TRAY = { left: 0, top: 0, right: 10, bottom: 6 };
const SHAPES = [4, 6, 8, 10, 12, 20];
const DICE_PER_ROLL = 6;
const COLUMNS = 3;
const SPACING = { x: 3, y: 2 };
const MARGIN = 2;
const THROW_GAP_MS = 90;
/** Furthest a die may move in one physics step: 60 units/s, faster than any throw. */
const MAX_STEP = 0.5;
/**
 * A die hitting the floor hard dips into it for a frame or so (up to about
 * 0.12 units now, a die being about 1.3 across), but never this far.
 */
const DEEPEST_SINK = 0.15;
/** How many frames just before the dice settle into their slots are checked for stillness. */
const STILL_FRAMES = 10;
const STILL_MOTION = 0.05;
const HALF = 0.5;

const rolls = SHAPES.map((sides) => {
  const throws = Array.from({ length: DICE_PER_ROLL }, (_, index) => ({
    hull: shapeFor(sides).hull,
    seed: `plausible:${String(sides)}:${String(index)}`,
    delay: index * THROW_GAP_MS,
    target: {
      x: MARGIN + (index % COLUMNS) * SPACING.x,
      y: MARGIN + Math.floor(index / COLUMNS) * SPACING.y,
    },
  }));
  return { sides, throws, frames: simulateDice(TRAY, throws) };
});

/** The frames of a die's roll that are seen: from when it's over its tray. */
const seen = (poses: DiePose[]) => poses.slice(poses.findIndex((pose) => pose.captured));
const distance = (a: DiePose, b: DiePose) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
/** How high the lowest corner of a die is off the floor. */
const clearance = (hull: DieHull, { z, quaternion: q }: DiePose) => {
  const rotation = new Quaternion(q.x, q.y, q.z, q.w);
  return (
    z +
    Math.min(...hull.vertices.map(([x, y, h]) => new Vector3(x, y, h).applyQuaternion(rotation).z))
  );
};
/** All the motion in `frames` between two frame numbers. */
function motion(frames: DiePose[][], from: number, to: number) {
  let total = 0;
  for (const poses of frames)
    for (let index = Math.max(1, from); index < to; index++)
      total += distance(poses[index - 1]!, poses[index]!);
  return total;
}

describe.each(rolls)("a roll of d$sides", ({ throws, frames }) => {
  it("has every die in every frame, none appearing, vanishing or doubling", () => {
    expect(frames).toHaveLength(throws.length);
    const { length } = frames[0]!;
    for (const poses of frames) expect(poses).toHaveLength(length);
  });

  it("only ever gives finite positions and unit rotations", () => {
    for (const pose of frames.flat()) {
      for (const n of [pose.x, pose.y, pose.z, pose.home]) expect(Number.isFinite(n)).toBe(true);
      const { x, y, z, w } = pose.quaternion;
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1);
    }
  });

  it("keeps a die in its tray, and never lets it fall through the floor, once it's over it", () => {
    for (const [index, poses] of frames.entries()) {
      const after = seen(poses);
      expect(after.length).toBeGreaterThan(0);
      for (const pose of after) {
        expect(pose.captured).toBe(true);
        expect(pose.x).toBeGreaterThanOrEqual(TRAY.left);
        expect(pose.x).toBeLessThanOrEqual(TRAY.right);
        expect(pose.y).toBeGreaterThanOrEqual(TRAY.top);
        expect(pose.y).toBeLessThanOrEqual(TRAY.bottom);
        expect(clearance(throws[index]!.hull, pose)).toBeGreaterThan(-DEEPEST_SINK);
      }
    }
  });

  it("moves continuously, never jumping from one place to another", () => {
    for (const poses of frames) {
      const after = seen(poses);
      for (const [index, pose] of after.slice(1).entries())
        expect(distance(after[index]!, pose)).toBeLessThan(MAX_STEP);
    }
  });

  it("loses its motion as it settles, and ends in its slot", () => {
    const allOver = Math.max(...frames.map((poses) => poses.findIndex((pose) => pose.captured)));
    const finishing = Math.min(...frames.map((poses) => poses.findIndex((pose) => pose.home > 0)));
    const middle = Math.round((allOver + finishing) * HALF);
    expect(motion(frames, middle, finishing)).toBeLessThan(motion(frames, allOver, middle));
    // Before its finishing move into its slot, every die has all but stopped.
    expect(motion(frames, finishing - STILL_FRAMES, finishing)).toBeLessThan(STILL_MOTION);
    for (const poses of frames) expect(poses.at(-1)!.home).toBe(1);
  });
});
