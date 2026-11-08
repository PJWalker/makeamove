import { describe, expect, it } from "vitest";
import { barShards, shardFrame } from "../barBreak";
import { BAR_BREAK_AT, BAR_CHANGE_MS, barChangeFrame } from "../barChange";

describe("barShards", () => {
  it("breaks the same way every time for the same seed", () => {
    expect(barShards("a")).toEqual(barShards("a"));
    expect(barShards("a")).not.toEqual(barShards("b"));
  });

  it("covers the bar, end to end, with pieces that share their cuts", () => {
    const shards = barShards("t:hp");
    expect(shards[0]!.outline[0]!.x).toBe(0);
    expect(shards.at(-1)!.outline[1]!.x).toBe(1);
    for (let i = 1; i < shards.length; i++) {
      const [, right, rightMid, rightBottom] = shards[i - 1]!.outline;
      const [left, , , , leftBottom, leftMid] = shards[i]!.outline;
      expect([left, leftMid, leftBottom]).toEqual([right, rightMid, rightBottom]);
    }
  });

  it("throws pieces outward, then lets them fall and fade", () => {
    const shards = barShards("t:hp");
    expect(shards[0]!.vx).toBeLessThan(0);
    expect(shards.at(-1)!.vx).toBeGreaterThan(0);
    const lasts = BAR_CHANGE_MS - BAR_BREAK_AT;
    const end = shardFrame(shards[0]!, lasts, lasts);
    expect(end.dy).toBeGreaterThan(0);
    expect(end.alpha).toBe(0);
    const start = shardFrame(shards[0]!, 0, lasts);
    expect(Math.abs(start.dx) + Math.abs(start.dy)).toBe(0);
    expect(start.alpha).toBe(1);
  });
});

describe("a breaking bar change", () => {
  const breaking = { from: 0.3, to: 0, delta: -3, start: 0, grownFrom: 0, breaks: true };

  it("cracks, then snaps, then closes up its room", () => {
    expect(barChangeFrame(breaking, 0)).toMatchObject({ crack: 0, broken: false, slot: 1 });
    expect(barChangeFrame(breaking, BAR_BREAK_AT - 1).crack).toBeGreaterThan(0.9);
    expect(barChangeFrame(breaking, BAR_BREAK_AT).broken).toBe(true);
    expect(barChangeFrame(breaking, BAR_CHANGE_MS).slot).toBe(0);
  });

  it("leaves other changes whole", () => {
    expect(barChangeFrame({ ...breaking, breaks: false }, 1000)).toMatchObject({
      crack: 0,
      broken: false,
      slot: 1,
    });
  });
});
