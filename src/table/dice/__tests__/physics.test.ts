import { describe, expect, it } from "vite-plus/test";
import { Quaternion, Vec3 } from "cannon-es";
import { DiceFlight, discHull, simulateDice } from "../physics";

const cube = {
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

const tray = { left: 0, top: 0, right: 8, bottom: 6 };
const target = { x: 4, y: 3 };
const roll = (seed: string) => simulateDice(tray, [{ hull: cube, seed, target }])[0]!;

/** A cube lying in the tray at `x`, struck along the tray at `vx` once `delay` ms are up. */
const cubeAt = (x: number, vx: number, delay = 0) => ({
  hull: cube,
  seed: `waiting-${String(x)}`,
  target,
  delay,
  state: {
    position: [x, -3, 0.65] as [number, number, number],
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    velocity: [vx, 0, 0] as [number, number, number],
    angularVelocity: [0, 0, 0] as [number, number, number],
  },
});

describe("natural dice flight", () => {
  it("replays exactly from the same shared seed", () => {
    expect(roll("message:0:0")).toEqual(roll("message:0:0"));
  });

  it("tumbles differently with different seeds", () => {
    const first = roll("message:0:0");
    const second = roll("message:0:1");
    expect(first.at(-1)!.quaternion).not.toEqual(second.at(-1)!.quaternion);
    expect(first[60]).not.toEqual(second[60]);
  });

  it("comes to rest flat in its target", () => {
    for (const seed of ["target:0", "target:1", "target:2"]) {
      const rest = roll(seed).at(-1)!;
      expect(rest.captured).toBe(true);
      expect(rest.home).toBe(1);
      expect(rest.x).toBeCloseTo(target.x, 6);
      expect(rest.y).toBeCloseTo(target.y, 6);
      expect(rest.z).toBeCloseTo(0.65, 2);
    }
  });

  it("cannot escape after capture even with a large impulse", () => {
    const flight = new DiceFlight(tray, [
      {
        hull: cube,
        seed: "wall-test",
        target,
        state: {
          position: [4, -3, 0.65],
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
          velocity: [400, 400, 10],
          angularVelocity: [0, 0, 0],
        },
      },
    ]);
    for (let steps = 0; steps < 120; steps++) {
      flight.step();
      const pose = flight.poses()[0]!;
      expect(pose.x).toBeGreaterThanOrEqual(tray.left);
      expect(pose.x).toBeLessThanOrEqual(tray.right);
      expect(pose.y).toBeGreaterThanOrEqual(tray.top);
      expect(pose.y).toBeLessThanOrEqual(tray.bottom);
      expect(pose.captured).toBe(true);
    }
  });

  it("settles a moving die into a stable resting pose", () => {
    const flight = new DiceFlight(
      tray,
      [
        {
          hull: cube,
          seed: "settling-test",
          target,
          state: {
            position: [2, -3, 0.65],
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            velocity: [5, 0, 0],
            angularVelocity: [0, 0, 5],
          },
        },
      ],
      0.1,
    );
    let settled = false;
    for (let step = 0; step < 1200 && !settled; step++) settled = flight.step();

    expect(settled).toBe(true);
    const restingPose = flight.poses()[0]!;
    expect(restingPose.captured).toBe(true);
    expect(restingPose.z).toBeCloseTo(0.65, 2);
    for (let step = 0; step < 60; step++) flight.step();
    expect(flight.poses()[0]).toEqual(restingPose);
  });

  it("uses the client tray bounds without stretching the dice", () => {
    const bounds = { left: 2, top: 3, right: 17, bottom: 7 };
    const frames = simulateDice(bounds, [
      { hull: cube, seed: "wide-tray", target: { x: 9, y: 5 } },
    ])[0]!;
    expect(frames.at(-1)!.captured).toBe(true);
    for (const pose of frames.filter((pose) => pose.captured)) {
      expect(pose.x).toBeGreaterThanOrEqual(bounds.left);
      expect(pose.x).toBeLessThanOrEqual(bounds.right);
      expect(pose.y).toBeGreaterThanOrEqual(bounds.top);
      expect(pose.y).toBeLessThanOrEqual(bounds.bottom);
    }
    expect(frames).not.toEqual(roll("wide-tray"));
  });

  it("transfers momentum between dice in the same world", () => {
    const flight = new DiceFlight(tray, [
      {
        hull: cube,
        seed: "collision-a",
        target,
        state: {
          position: [2, -3, 0.65],
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
          velocity: [8, 0, 0],
          angularVelocity: [0, 0, 0],
        },
      },
      {
        hull: cube,
        seed: "collision-b",
        target,
        state: {
          position: [4, -3, 0.65],
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
          velocity: [0, 0, 0],
          angularVelocity: [0, 0, 0],
        },
      },
    ]);
    let impact = 0;
    for (let step = 0; step < 40; step++) {
      flight.step();
      impact = Math.max(impact, flight.poses()[1]!.impact ?? 0);
    }
    expect(impact).toBeGreaterThan(0.5);
  });

  it("knocks into a die in the tray that hasn't been struck yet", () => {
    const flight = new DiceFlight(tray, [cubeAt(2, 20), cubeAt(4, 0, 1000)]);
    for (let step = 0; step < 60; step++) flight.step();
    const [struck, waiting] = flight.poses();
    expect(waiting!.x).toBeGreaterThan(4.5);
    expect(struck!.x).toBeLessThan(waiting!.x);
  });

  it("waits for delayed dice and settles the whole roll together", () => {
    const throws = [
      { hull: cube, seed: "group-a", target: { x: 2, y: 3 } },
      { hull: cube, seed: "group-b", delay: 180, target: { x: 6, y: 3 } },
    ];
    const frames = simulateDice(tray, throws);
    const firstFrames = frames[0]!;
    const secondFrames = frames[1]!;
    expect(firstFrames.length).toBe(secondFrames.length);
    expect(secondFrames[10]!).toEqual(secondFrames[0]!);
    expect(frames.every((poses) => poses.at(-1)!.captured)).toBe(true);
    expect(simulateDice(tray, throws)).toEqual(frames);
  });
});

describe("a die drawn towards its target", () => {
  it("rolls to a stop nearer it, on the whole, than nearer another", () => {
    const corner = { x: 1.5, y: 1.5 };
    const opposite = { x: 6.5, y: 4.5 };
    /** How far from the corner it stops rolling, before it's slid into its target. */
    const stopped = (toward: { x: number; y: number }, seed: string) => {
      const frames = simulateDice(tray, [{ hull: cube, seed, target: toward }])[0]!;
      const pose = frames.findLast((pose) => pose.home === 0)!;
      return Math.hypot(pose.x - corner.x, pose.y - corner.y);
    };
    let near = 0;
    let far = 0;
    for (let i = 0; i < 8; i++) {
      near += stopped(corner, `drawn:${i}`);
      far += stopped(opposite, `drawn:${i}`);
    }
    expect(near).toBeLessThan(far);
  });
});

describe("a thrown chip", () => {
  it("lands flat on one face or the other", () => {
    for (const seed of ["chip:0", "chip:1", "chip:2", "chip:3"]) {
      const rest = simulateDice(tray, [{ hull: discHull(0.95, 0.22), seed, target }])[0]!.at(-1)!;
      const { x, y } = rest.quaternion;
      // How much its face points up or down: ±1 when flat.
      expect(Math.abs(1 - 2 * (x * x + y * y))).toBeCloseTo(1, 2);
      expect(rest.z).toBeCloseTo(0.11, 2);
      expect(rest.captured).toBe(true);
    }
  });
});

const turned = (
  { x, y, z, w }: Quaternion | { x: number; y: number; z: number; w: number },
  v: number[],
) => new Quaternion(x, y, z, w).vmult(new Vec3(v[0], v[1], v[2]));

/** Each face's outward normal, from the centre of its corners. */
const faceNormals = (hull: { vertices: number[][]; faces: number[][] }) =>
  hull.faces.map((face) => {
    const centre = face
      .map((i) => hull.vertices[i]!)
      .reduce((sum, v) => sum.map((c, k) => c + v[k]! / face.length), [0, 0, 0]);
    const length = Math.hypot(...centre);
    return centre.map((c) => c / length);
  });

describe("a die coming to rest", () => {
  // Labels on each face pointing every which way, so a careless landing reads upside down.
  const labelled = {
    ...cube,
    labelUps: [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, -1],
      [0, 0, 1],
      [0, 0, -1],
      [0, 0, 1],
    ],
  };

  it("halves how far the label on its top face is turned from upright", () => {
    const normals = faceNormals(cube);
    for (const seed of ["upright:0", "upright:1", "upright:2", "upright:3", "upright:4"]) {
      const rest = simulateDice(tray, [{ hull: labelled, seed, target }])[0]!.at(-1)!;
      const heights = normals.map((normal) => turned(rest.quaternion, normal).z);
      const top = heights.indexOf(Math.max(...heights));
      expect(heights[top]).toBeCloseTo(1, 2);
      expect(turned(rest.quaternion, labelled.labelUps[top]!).y).toBeGreaterThan(-1e-6);
    }
  });

  it("turns a face-up die base-up, a face towards the player", () => {
    const d4 = {
      vertices: [
        [1, 1, 1],
        [-1, -1, 1],
        [-1, 1, -1],
        [1, -1, -1],
      ],
      faces: [
        [2, 1, 0],
        [0, 3, 2],
        [1, 3, 0],
        [2, 3, 1],
      ],
      faceUp: true,
    };
    const normals = faceNormals(d4);
    for (const seed of ["d4:0", "d4:1", "d4:2"]) {
      const rest = simulateDice(tray, [{ hull: d4, seed, target }])[0]!.at(-1)!;
      const heights = normals.map((normal) => turned(rest.quaternion, normal).z);
      expect(Math.max(...heights)).toBeCloseTo(1, 3);
      expect(rest.z).toBeGreaterThan(0);
    }
  });

  describe("a reroll among dice left lying", () => {
    it("knocks a heavy die about without turning it to another face, and leaves it in its slot", () => {
      const lying = { x: 0.2, y: -0.4, z: 0.1, w: 0.89 };
      const length = Math.hypot(lying.x, lying.y, lying.z, lying.w);
      const rotation = {
        x: lying.x / length,
        y: lying.y / length,
        z: lying.z / length,
        w: lying.w / length,
      };
      const flight = new DiceFlight(tray, [
        {
          hull: cube,
          seed: "rolled",
          target: { x: 2, y: 3 },
          state: {
            position: [2, -3, 0.65],
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            velocity: [14, 0, 0],
            angularVelocity: [0, 0, 0],
          },
        },
        {
          hull: cube,
          seed: "left",
          heavy: true,
          target: { x: 4, y: 3 },
          state: {
            position: [4, -3, 1.2],
            quaternion: rotation,
            velocity: [0, 0, 0],
            angularVelocity: [0, 0, 0],
          },
        },
      ]);
      let impact = 0;
      let done = false;
      for (let step = 0; step < 3600 && !done; step++) {
        done = flight.step();
        impact = Math.max(impact, flight.poses()[1]!.impact ?? 0);
        const { quaternion } = flight.poses()[1]!;
        for (const axis of ["x", "y", "z", "w"] as const)
          expect(quaternion[axis]).toBeCloseTo(rotation[axis], 6);
      }
      expect(done).toBe(true);
      expect(impact).toBeGreaterThan(0.5);
      const rest = flight.poses()[1]!;
      expect(rest.x).toBeCloseTo(4, 6);
      expect(rest.y).toBeCloseTo(3, 6);
    });
  });
});
