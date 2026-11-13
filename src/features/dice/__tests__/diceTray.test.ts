import { describe, expect, it } from "vite-plus/test";
import { Quaternion, Vec3 } from "cannon-es";
import { simulateDice, type DieHull } from "../../../table/diePhysics";

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
      const poses = frames.map((poses) => poses[frame]!).filter((pose) => pose.captured);
      for (const [index, a] of poses.entries())
        for (const b of poses.slice(index + 1))
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(1.1);
    }
  });

  it("reports when dice strike something, for the sound of the roll", () => {
    expect(frames.flat().some((pose) => (pose.impact ?? 0) > 2.5)).toBe(true);
  });
});
