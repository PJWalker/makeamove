import { describe, expect, it, vi } from "vite-plus/test";
import seededRandom from "../../../lib/seededRandom";
import { simulateDice } from "../physics";
import { shapeFor } from "../shapes";
import { struck } from "../tracks";

/** A quick roll's tray: a roll card one row of dice tall, in tray units. */
const tray = { left: 0, top: 0, right: 13, bottom: 7.2 };
/** The dice in each quick roll, and where they lie in the tray. */
const DICE = [
  { sides: 20, slot: { x: 3, y: 2.5 } },
  { sides: 6, slot: { x: 6, y: 2.5 } },
];
/** How fast (px/s) the tray flies up into the chat. */
const TRAY_VELOCITY = { x: 0, y: -60 };
const ROLLS = 10;
/** How close (units) a die's corners come to a wall to count as hitting it. */
const LEEWAY = 0.3;

/** How far a die's corners reach from its centre. */
const reach = (sides: number) =>
  Math.max(...shapeFor(sides).hull.vertices.map(([x = 0, y = 0, z = 0]) => Math.hypot(x, y, z)));

/** Whether each die in a quick roll bounces off the bottom of its tray, and then gets back to the top. */
function quickRoll(seed: string) {
  const random = vi.spyOn(Math, "random").mockImplementation(seededRandom(seed));
  const throws = DICE.map(({ sides, slot }, index) => {
    const { hull, rest } = shapeFor(sides);
    return {
      hull,
      seed: `${seed}:${String(index)}`,
      target: slot,
      state: struck(hull, rest, slot, TRAY_VELOCITY, tray.bottom),
    };
  });
  random.mockRestore();
  return simulateDice(tray, throws).map((poses, index) => {
    const edge = reach(DICE[index]!.sides) + LEEWAY;
    const bounced = poses.findIndex((pose) => pose.y > tray.bottom - edge);
    return {
      bounced: bounced !== -1,
      backToTop:
        bounced !== -1 && poses.slice(bounced).some((pose) => pose.y < edge && pose.home === 0),
    };
  });
}

describe("a quick roll", () => {
  const dice = Array.from({ length: ROLLS }, (_, index) =>
    quickRoll(`quick:${String(index)}`),
  ).flat();

  it("throws every die off the bottom of its tray", () => {
    expect(dice.every(({ bounced }) => bounced)).toBe(true);
  });

  it("sometimes bounces a die back to the top", () => {
    expect(dice.some(({ backToTop }) => backToTop)).toBe(true);
  });
});
