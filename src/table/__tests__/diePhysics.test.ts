import { describe, expect, it } from "vitest";
import { DiceHold, type DieHull } from "../diePhysics";

const tetrahedron: DieHull = {
  vertices: [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1],
  ],
  faces: [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ],
};

describe("DiceHold", () => {
  it("spins held dice without moving their cursor-locked position", () => {
    const hold = new DiceHold(
      { left: 0, top: 0, right: 8, bottom: 8 },
      [
        {
          hull: tetrahedron,
          x: 1.5,
          y: 2.25,
          z: 1.75,
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      "locked",
    );
    const resting = hold.poses()[0]!;

    for (let frame = 0; frame < 24; frame++) hold.step();

    const spinning = hold.poses()[0]!;
    expect(spinning.x).toBe(resting.x);
    expect(spinning.y).toBe(resting.y);
    expect(spinning.z).toBe(resting.z);
    expect(spinning.quaternion).not.toEqual(resting.quaternion);
  });

  it("throws dice around when a carried tray is jolted", () => {
    const hold = new DiceHold(
      { left: 0, top: 0, right: 8, bottom: 8 },
      [
        {
          hull: tetrahedron,
          x: 4,
          y: 4,
          z: 2,
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      "tray",
    );
    const resting = hold.poses()[0]!;

    hold.jolt(4, 0);
    for (let frame = 0; frame < 24; frame++) hold.step();

    const moving = hold.poses()[0]!;
    expect(moving.x).not.toBe(resting.x);
    expect(moving.z).not.toBe(resting.z);
  });

  it("keeps repeatedly shaken dice within the visible height", () => {
    const hold = new DiceHold(
      { left: 0, top: 0, right: 8, bottom: 8 },
      [
        {
          hull: tetrahedron,
          x: 4,
          y: 4,
          z: 2,
          quaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      "tray",
    );

    for (let frame = 0; frame < 60; frame++) {
      hold.jolt(4, 0);
      hold.step();
    }

    expect(hold.poses()[0]!.z).toBeLessThanOrEqual(8);
  });
});
