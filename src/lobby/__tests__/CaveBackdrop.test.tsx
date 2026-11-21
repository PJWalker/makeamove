import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { CaveBackdrop } from "../CaveBackdrop";
import { buildCave } from "../caveScene";
import { MOTION, pack } from "../splat";

describe("the lobby's cave backdrop", () => {
  it("is decoration, hidden from assistive technology", () => {
    expect(renderToStaticMarkup(<CaveBackdrop />)).toMatch(
      /^<div class="cave-backdrop" aria-hidden="true"/,
    );
  });
});

describe("the cave's splats", () => {
  const cave = buildCave();

  it("shows a party of four with two torches and the wizard's wisp", () => {
    expect(cave.party).toHaveLength(4);
    const flames = new Set(
      cave.splats.filter((splat) => splat.motion === MOTION.flame).map((splat) => splat.light),
    );
    expect(flames).toEqual(new Set([0, 1]));
    expect(cave.splats.some((splat) => splat.light === 2 && splat.glow)).toBe(true);
  });

  it("draws the same picture every time", () => {
    expect(pack(buildCave().splats)).toEqual(pack(cave.splats));
  });
});
