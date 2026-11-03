import { describe, expect, it } from "vitest";
import { DiceFlight, simulateDice } from "../../../table/diePhysics";


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
const roll = (seed: string) => (simulateDice(tray, [{ hull: cube, seed }]))[0]!;

describe("natural dice flight", () => {
  it("replays exactly from the same shared seed", () => {
    expect(roll("message:0:0")).toEqual(roll("message:0:0"));
  });

  it("lands at different natural positions with different seeds", () => {
    const first = roll("message:0:0").at(-1)!;
    const second = roll("message:0:1").at(-1)!;
    expect(first).not.toEqual(second);
    expect(first.captured).toBe(true);
    expect(first.z).toBeCloseTo(0.65, 2);
  });

  it("cannot escape after capture even with a large impulse", () => {
    const flight = new DiceFlight(tray, [{ hull: cube, seed: "wall-test" }]);
    const die = (flight.dice)[0]!;
    for (let step = 0; step < 240 && !die.captured; step++) flight.step();
    expect(die.captured).toBe(true);
    die.body.velocity.set(400, 400, 10);
    for (let steps = 0; steps < 120; steps++) {
      flight.step();
      expect(die.body.position.x).toBeGreaterThanOrEqual(tray.left);
      expect(die.body.position.x).toBeLessThanOrEqual(tray.right);
      expect(-die.body.position.y).toBeGreaterThanOrEqual(tray.top);
      expect(-die.body.position.y).toBeLessThanOrEqual(tray.bottom);
      expect(die.captured).toBe(true);
    }
  });

  it("nudges unsettled dice using damping after four seconds, not a target pose", () => {
    const flight = new DiceFlight(tray, [{ hull: cube, seed: "damping-test" }]);
    const { body } = (flight.dice)[0]!;
    for (let step = 0; step < 480; step++) flight.step();
    expect(body.linearDamping).toBe(0.2);
    flight.step();
    expect(body.linearDamping).toBe(0.95);
    expect(body.angularDamping).toBe(0.98);
  });

  it("uses the client tray bounds without stretching the dice", () => {
    const bounds = { left: 2, top: 3, right: 17, bottom: 7 };
    const frames = (simulateDice(bounds, [{ hull: cube, seed: "wide-tray" }]))[0]!;
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
      { hull: cube, seed: "collision-a" },
      { hull: cube, seed: "collision-b" },
    ]);
    flight.step();
    const first = (flight.dice)[0]!;
    const second = (flight.dice)[1]!;
    for (const [index, die] of flight.dice.entries()) {
      die.captured = true;
      die.body.collisionFilterMask = 3;
      die.body.position.set(2 + index * 2, -3, 0.65);
      die.body.quaternion.set(0, 0, 0, 1);
      die.body.velocity.set(index === 0 ? 8 : 0, 0, 0);
      die.body.angularVelocity.set(0, 0, 0);
    }
    let transferredSpeed = 0;
    for (let step = 0; step < 20; step++) {
      flight.step();
      transferredSpeed = Math.max(transferredSpeed, second.body.velocity.x);
    }
    expect(transferredSpeed).toBeGreaterThan(0.5);
    expect(first.body.velocity.x).toBeLessThan(6);
  });

  it("waits for delayed dice and settles the whole roll together", () => {
    const throws = [
      { hull: cube, seed: "group-a" },
      { hull: cube, seed: "group-b", delay: 180 },
    ];
    const frames = simulateDice(tray, throws);
    const firstFrames = (frames)[0]!;
    const secondFrames = (frames)[1]!;
    expect(firstFrames.length).toBe(secondFrames.length);
    expect((secondFrames)[10]!).toEqual((secondFrames)[0]!);
    expect(frames.every((poses) => poses.at(-1)!.captured)).toBe(true);
    expect(simulateDice(tray, throws)).toEqual(frames);
  });
});
