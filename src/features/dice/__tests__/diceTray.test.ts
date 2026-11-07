import { describe, expect, it } from "vitest";
import { Quaternion, Vec3 } from "cannon-es";
import {
  DiceHold,
  simulateDice,
  type DieHull,
} from "../../../table/diePhysics";

const cube: DieHull = {
  vertices: [
    [-0.65, -0.65, -0.65],
    [0.65, -0.65, -0.65],
    [0.65, 0.65, -0.65],
    [-0.65, 0.65, -0.65],
    [-0.65, -0.65, 0.65],
    [0.65, -0.65, 0.65],
    [0.65, 0.65, 0.65],
    [-0.65, 0.65, 0.65],
  ],
  faces: [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
};

const tray = { left: 0, top: 0, right: 10, bottom: 6 };

/** How far a cube's lowest face points away from straight down (0 = flat on the floor). */
const tilt = (q: { x: number; y: number; z: number; w: number }) => {
  const rotation = new Quaternion(q.x, q.y, q.z, q.w);
  const normals = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ].map(([x, y, z]) => rotation.vmult(new Vec3(x, y, z)).z);
  return 1 + Math.min(...normals);
};

describe("a roll of several dice in one tray", () => {
  const throws = Array.from({ length: 6 }, (_, index) => ({
    hull: cube,
    seed: `crowd:${index}`,
    delay: index * 90,
  }));
  const frames = simulateDice(tray, throws);
  const last = frames.map((poses) => poses.at(-1)!);

  it("comes to rest with every die flat on the floor of the tray", () => {
    for (const pose of last) {
      expect(pose.captured).toBe(true);
      expect(pose.z).toBeCloseTo(0.65, 1);
      expect(tilt(pose.quaternion)).toBeLessThan(0.01);
    }
  });

  it("never lets two dice pass through each other", () => {
    const length = frames[0]!.length;
    for (let frame = 0; frame < length; frame += 4) {
      const poses = frames
        .map((poses) => poses[frame]!)
        .filter((pose) => pose.captured);
      for (const [index, a] of poses.entries())
        for (const b of poses.slice(index + 1))
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(
            1.1,
          );
    }
  });

  it("reports when dice strike something, for the sound of the roll", () => {
    expect(frames.flat().some((pose) => (pose.impact ?? 0) > 2.5)).toBe(true);
  });
});

describe("dice carried in a tray", () => {
  it("knock into each other instead of overlapping", () => {
    const hold = new DiceHold(
      { left: 0, top: 0, right: 8, bottom: 4 },
      [2, 5].map((x) => ({
        hull: cube,
        x,
        y: 2,
        z: 0.65,
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
      })),
      "tray",
    );
    for (let frame = 0; frame < 240; frame++) {
      if (frame % 10 === 0) hold.jolt(-12, 0);
      hold.step();
      const [a, b] = hold.poses();
      expect(
        Math.hypot(a!.x - b!.x, a!.y - b!.y, a!.z - b!.z),
      ).toBeGreaterThan(1.1);
    }
  });

  it("stay inside the walls of the tray", () => {
    const hold = new DiceHold(
      { left: 0, top: 0, right: 8, bottom: 4 },
      [
        {
          hull: cube,
          x: 4,
          y: 2,
          z: 0.65,
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      "tray",
    );
    for (let frame = 0; frame < 240; frame++) {
      hold.jolt(frame % 20 < 10 ? 30 : -30, frame % 14 < 7 ? 30 : -30);
      hold.step();
      const pose = hold.poses()[0]!;
      expect(pose.x).toBeGreaterThanOrEqual(0.65 - 1e-3);
      expect(pose.x).toBeLessThanOrEqual(8 - 0.65 + 1e-3);
      expect(pose.y).toBeGreaterThanOrEqual(0.65 - 1e-3);
      expect(pose.y).toBeLessThanOrEqual(4 - 0.65 + 1e-3);
    }
  });
});
