import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { CaveBackdrop } from "../CaveBackdrop";
import { buildCave } from "../caveScene";
import { MOTION, pack } from "../splat";

describe("the lobby's cave backdrop", () => {
  it("keeps the canvas decorative and exposes its playback control", () => {
    const markup = renderToStaticMarkup(<CaveBackdrop />);
    expect(markup).toContain('<canvas class="cave-canvas"');
    expect(markup).toContain('aria-label="Pause cave animation"');
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

  it("sends the wisp down the cave to scout now and then, and brings it back", () => {
    const wisp = cave.lights[2];
    const seconds = Array.from({ length: 1200 }, (_, index) => index / 10);
    const deepest = Math.min(...seconds.map((at) => wisp?.drift(at)[2] ?? 0));
    expect(deepest).toBeLessThan(-8);
    const away = seconds.filter((at) => Math.hypot(...(wisp?.drift(at) ?? [0, 0, 0])) > 1);
    expect(away.length).toBeGreaterThan(0);
    expect(away.length).toBeLessThan(seconds.length / 2);
  });

  it("draws a repeatable picture for a seed, but varies each default build", () => {
    expect(pack(buildCave("fixed seed").splats)).toEqual(pack(buildCave("fixed seed").splats));
    expect(pack(buildCave("first random seed").splats)).not.toEqual(pack(buildCave("second random seed").splats));
  });
});
