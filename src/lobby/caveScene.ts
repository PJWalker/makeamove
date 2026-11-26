/* eslint-disable @typescript-eslint/no-magic-numbers */
import seededRandom from "../lib/seededRandom";
import flightPlan from "./wispFlight";
import {
  add,
  hex,
  length,
  MOTION,
  normalize,
  scale,
  sub,
  tangents,
  times



} from "./splat";
import type {Motion, Splat, Vec3} from "./splat";

/*
 * The lobby's backdrop, as a cloud of Gaussian splats: an adventuring party
 * seen from behind, making their way down a cave by torchlight and a wizard's
 * wisp. The party keeps to the sides and the bottom; the cave runs off into
 * darkness at the top and centre, behind the interface.
 *
 * Distances are in metres. y is up and the floor is at y = 0; the viewer
 * looks down the cave, along -z, and the party have their backs to them.
 */

export interface Light {
  at: Vec3;
  /** Linear RGB, scaled by how bright the light is. */
  colour: Vec3;
  /** How far its light reaches. */
  reach: number;
  /** Seconds for the slowest swell of its flicker. */
  period: number;
  /** Whether it flies off to scout down the cave now and then, as the wisp does; see `lightDrift`. */
  scouts: boolean;
}

export interface Cave {
  splats: Splat[];
  /** The warrior's torch, the ranger's torch, then the wizard's wisp. */
  lights: Light[];
  party: string[];
}

/** Where the viewer stands and looks, and their vertical field of view in degrees. */
export const VIEWER = { eye: [0, 2.4, 5.2] as Vec3, target: [0, 2.15, -20] as Vec3, fov: 50 };

/** The cave's near and far ends. */
const NEAR = 8;
const FAR = -46;

type Palette = [Vec3, ...Vec3[]];
const palette = ([first, ...rest]: [string, ...string[]]): Palette => [
  hex(first),
  ...rest.map((code) => hex(code)),
];
const WALL_PAINTS = palette(["#7a5a38", "#60442e", "#4a3832", "#3e343e", "#96704a", "#2c2224"]);
const FLOOR_PAINTS = palette(["#705438", "#543e2c", "#3a2e2a", "#8a6842"]);
const TORCHLIGHT = scale([1, 0.5, 0.19], 2.6);
const WISPLIGHT = scale([0.42, 0.68, 1], 2.6);

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A repeatable number in [0, 1) for a lattice point. */
function hash(x: number, y: number, z: number) {
  let h = Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263) + Math.imul(z, 1_440_662_683);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/** Smooth noise in [0, 1), the same for the same point. */
function noise([x, y, z]: Vec3): number {
  const [cellX, cellY, cellZ] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [u, v, w] = [ease(x - cellX), ease(y - cellY), ease(z - cellZ)];
  const plane = (dz: number) =>
    lerp(
      lerp(hash(cellX, cellY, cellZ + dz), hash(cellX + 1, cellY, cellZ + dz), u),
      lerp(hash(cellX, cellY + 1, cellZ + dz), hash(cellX + 1, cellY + 1, cellZ + dz), u),
      v,
    );
  return lerp(plane(0), plane(1), w);
}

/** Noise with finer detail layered over it, roughly in [0, 1). */
function fbm(point: Vec3, octaves = 3): number {
  let sum = 0;
  let weight = 0.5;
  let at = point;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise(at) * weight;
    weight /= 2;
    at = scale(at, 2.03);
  }
  return sum / (1 - weight * 2);
}

/** The tunnel at a depth: where its middle is, and its half width and height. */
export function section(z: number) {
  const depth = (NEAR - z) / (NEAR - FAR);
  const twist = 1 - Math.max(0, 1 - depth * 1.45);
  const weave = Math.sin(z * 0.16) * 1.15 + Math.sin(z * 0.055 + 0.9) * 0.7;
  const bulge = Math.sin(z * 0.27 + 0.6) * 0.48 + Math.sin(z * 0.71 - 1.1) * 0.18;
  const arch = Math.sin(z * 0.21 - 0.4) * 0.38 + Math.sin(z * 0.63 + 0.8) * 0.16;
  return {
    middle: -0.0022 * Math.min(0, z) ** 2 + weave * twist,
    halfWidth: (4.9 - 1.9 * depth) * (1 + bulge * 0.18),
    height: (5.3 - 1.7 * depth) * (1 + arch * 0.12),
  };
}

/** How finely a shape is covered, and how it's coloured. */
interface Finish {
  /** How much each splat's brightness varies, either way. */
  vary?: number;
  /** For a tube: how many folds run along it, as in cloth. */
  folds?: number;
  /** A repeating motion for the shape, used for subtle character idle. */
  motion?: Motion;
  /** Where in the motion cycle the shape begins. */
  phase?: number;
}

/**
 * Lays splats over shapes into `splats`, from one stream of random numbers,
 * `density` splats to the square metre.
 */
function sculptor(random: () => number, splats: Splat[], density: number) {
  const spread = (range: number) => (random() * 2 - 1) * range;
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)] as T;
  const shade = (colour: Vec3, vary: number) => scale(colour, 1 + spread(vary));
  const direction = (): Vec3 => {
    for (;;) {
      const v: Vec3 = [spread(1), spread(1), spread(1)];
      const size = length(v);
      if (size > 0.05 && size <= 1) return scale(v, 1 / size);
    }
  };

  /** A flat splat lying on a surface, longest `along`. */
  const patch = (
    at: Vec3,
    facing: Vec3,
    along: Vec3,
    [long, wide]: [number, number],
    colour: Vec3,
    opacity: number,
    phase = 0,
    motion: Motion = MOTION.still,
  ) => {
    const [first, second] = tangents(facing, along);
    splats.push({
      at,
      axes: [scale(first, long), scale(second, wide), scale(facing, Math.min(long, wide) * 0.2)],
      colour,
      opacity,
      facing,
      glow: false,
      motion,
      phase,
    });
  };

  /** Covers an ellipsoid's surface. */
  const ellipsoid = (centre: Vec3, radii: Vec3, colour: Vec3, { vary = 0.18, motion = MOTION.still, phase = 0 }: Finish = {}) => {
    const [a, b, c] = radii;
    const p = 1.6;
    const area = 4 * Math.PI * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p);
    const count = Math.max(6, Math.round(area * density));
    const size = Math.sqrt(area / count) * 0.8;
    for (let index = 0; index < count; index++) {
      const unit = direction();
      const facing = normalize([unit[0] / a, unit[1] / b, unit[2] / c]);
      const [brush] = tangents(facing, [spread(0.8), spread(0.8), spread(0.8)]);
      patch(
        add(centre, times(radii, unit)),
        facing,
        add(brush, scale(direction(), 0.08)),
        [size * (3.2 + random() * 2.2), size * (0.22 + random() * 0.18)],
        shade(colour, vary),
        0.74 + random() * 0.18,
        phase + spread(0.08),
        motion,
      );
    }
  };

  /** Covers a tube that narrows from one end to the other; a radius of 0 makes a cone. */
  const tube = (
    from: Vec3,
    to: Vec3,
    [start, end]: [number, number],
    colour: Vec3,
    { vary = 0.18, folds = 0, motion = MOTION.still, phase = 0 }: Finish = {},
  ) => {
    const axis = sub(to, from);
    const along = normalize(axis);
    const [first, second] = tangents(along, [0, 0, 1]);
    const area = Math.PI * (start + end) * length(axis) + Math.PI * start * start;
    const count = Math.max(6, Math.round(area * density));
    const size = Math.sqrt(area / count) * 0.8;
    for (let index = 0; index < count; index++) {
      const t = random();
      const angle = random() * Math.PI * 2;
      const radial = add(scale(first, Math.cos(angle)), scale(second, Math.sin(angle)));
      // Folds swell out and catch the light, and sink back into shade.
      const fold = folds ? Math.sin(angle * folds + t * 1.5) : 0;
      const radius = (start + (end - start) * t) * (1 + 0.05 * fold);
      patch(
        add(add(from, scale(axis, t)), scale(radial, radius)),
        radial,
        along,
        [size * 1.5, size * 0.8],
        scale(shade(colour, vary), 1 + 0.22 * fold),
        0.92,
        phase,
        motion,
      );
    }
  };

  /** A small splat on its own: it gives off light of its own unless it's `lit`. */
  const speck = (
    at: Vec3,
    size: Vec3 | number,
    colour: Vec3,
    opacity: number,
    {
      light,
      motion = MOTION.still,
      phase = 0,
      lit = false,
    }: { light?: number; motion?: Motion; phase?: number; lit?: boolean } = {},
  ) => {
    const [x, y, z] = typeof size === "number" ? [size, size, size] : size;
    splats.push({
      at,
      axes: [
        [x, 0, 0],
        [0, y, 0],
        [0, 0, z],
      ],
      colour,
      opacity,
      facing: [0, 0, 1],
      glow: !lit,
      light,
      motion,
      phase,
    });
  };

  return { random, spread, pick, shade, patch, ellipsoid, tube, speck };
}

type Sculptor = ReturnType<typeof sculptor>;

/** The tunnel's walls and roof, each splat a stroke following the rock's strata. */
function walls({ random, spread, pick, shade, patch }: Sculptor) {
  for (let index = 0; index < 60_000; index++) {
    const z = FAR + (NEAR - FAR) * random();
    const depth = (NEAR - z) / (NEAR - FAR);
    if (random() > 1 - depth * 0.78) continue;
    const { middle, halfWidth, height } = section(z);
    const angle = random() * Math.PI;
    const base: Vec3 = [middle + halfWidth * Math.cos(angle), height * Math.sin(angle) ** 0.8, z];
    const outward = normalize([base[0] - middle, base[1] - height * 0.3, 0]);
    const bulge =
      (fbm(scale(base, 0.45)) - 0.5) * 3.8 +
      (fbm(times(base, [1.8, 2.4, 1.2])) - 0.5) * 0.9 +
      Math.sin(base[2] * 0.31 + base[1] * 1.7) * 0.42;
    const at = add(base, scale(outward, bulge));
    if (at[1] < -0.1) continue;
    const facing = normalize(add(scale(outward, -1), [spread(0.35), spread(0.35), spread(0.35)]));
    const band = fbm([at[0] * 0.25, at[1] * 1.6 + fbm(scale(at, 0.6)) * 2, at[2] * 0.25]);
    const paint =
      WALL_PAINTS[Math.floor(band * WALL_PAINTS.length * 1.6) % WALL_PAINTS.length] ??
      WALL_PAINTS[0];
    const roof = 1 - 0.8 * (Math.max(0, at[1]) / height) ** 2;
    const size = (0.045 + random() * 0.07) * (0.32 + depth * 2.75);
    patch(
      at,
      facing,
      [0.12 * Math.sin(at[2] * 0.09 + at[0] * 0.16), 0.3 * Math.sin(at[0] * 0.12 - at[2] * 0.08), 1],
      [size * (2.2 + random() * 1.8), size * (0.38 + random() * 0.22)],
      scale(shade(random() < 0.15 ? pick(WALL_PAINTS) : paint, 0.25), roof),
      0.55 + random() * 0.4,
      random(),
    );
  }
}

/** The floor between the feet of the walls, with loose stones on it. */
function floor({ random, spread, pick, shade, patch, ellipsoid }: Sculptor) {
  for (let index = 0; index < 22_000; index++) {
    const z = FAR + (NEAR - FAR) * random();
    const depth = (NEAR - z) / (NEAR - FAR);
    if (random() > 1 - depth * 0.88) continue;
    const { middle, halfWidth } = section(z);
    const x = middle + spread(halfWidth * 0.97);
    const at: Vec3 = [x, spread(0.018), z];
    const size = (0.05 + random() * 0.08) * (0.32 + depth * 2.75);
    patch(
      at,
      normalize([spread(0.2), 1, spread(0.2)]),
      [0.55 + 0.25 * Math.sin(z * 0.11), 0.08 * Math.sin(x * 0.22), 1],
      [size * (2.4 + random() * 1.8), size * (0.38 + random() * 0.24)],
      shade(pick(FLOOR_PAINTS), 0.3),
      0.6 + random() * 0.35,
      random(),
    );
  }
  for (let index = 0; index < 26; index++) {
    const z = 4 - random() * 30;
    const { middle, halfWidth } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const radius = 0.2 + random() * 0.5;
    ellipsoid(
      [middle + side * (halfWidth - 0.4 - random() * 1.4), radius * 0.4, z],
      [radius * 1.3, radius * 0.7, radius],
      pick(WALL_PAINTS),
      { vary: 0.3 },
    );
  }
}

/** Stalactites hanging from the roof near the walls, and stalagmites rising beside them. */
function spikes({ random, pick, tube, speck }: Sculptor) {
  for (let index = 0; index < 22; index++) {
    const z = -4 - random() * 24;
    const { middle, halfWidth, height } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const angle = side > 0 ? 0.35 + random() * 0.55 : Math.PI - 0.35 - random() * 0.55;
    const root: Vec3 = [
      middle + halfWidth * Math.cos(angle) * 0.92,
      height * Math.sin(angle) ** 0.8 * 0.97,
      z,
    ];
    const long = 0.4 + random() * 1;
    const tip = add(root, [(random() - 0.5) * 0.2, -long, 0]);
    tube(root, tip, [long * 0.14, 0.01], pick(WALL_PAINTS));
    speck(tip, [0.012, 0.016, 0.012], [0.7, 0.8, 0.9], 0.9, {
      motion: MOTION.drip,
      phase: random(),
      lit: true,
    });
  }
  for (let index = 0; index < 10; index++) {
    const z = 1 - random() * 22;
    const { middle, halfWidth } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const root: Vec3 = [middle + side * (halfWidth - 0.6 - random() * 0.9), -0.05, z];
    const tall = 0.3 + random() * 0.9;
    tube(
      root,
      add(root, [(random() - 0.5) * 0.1, tall, 0]),
      [tall * 0.25, 0.02],
      pick(WALL_PAINTS),
    );
  }
}

const STEEL = hex("#6a6e78");
const DARK_STEEL = hex("#3a3d44");
const CHAIN = hex("#4a4e56");
const WOOD = hex("#5a3c22");
const LEATHER = hex("#6a4a2c");
const DARK_LEATHER = hex("#3e2a1a");
const BOOT = hex("#2a1e16");
const BRONZE = hex("#a07a3a");
const GOLD = hex("#b08a3a");
const SKIN = hex("#c8a080");
const BONE = hex("#d8c8a0");

/** One of the larger points of interest that can appear in a cave. */
// eslint-disable-next-line max-lines-per-function
function caveDiscovery(sculpt: Sculptor) {
  const { random, spread, pick, ellipsoid, tube, speck } = sculpt;
  const z = 1 - random() * 29;
  const { middle, halfWidth } = section(z);
  const side = random() < 0.5 ? -1 : 1;
  const discoveries = ["torch", "door", "trap", "particles", "skeleton", "sword", "blood"] as const;

  switch (pick(discoveries)) {
    case "torch": {
      const at: Vec3 = [middle + side * (halfWidth - 0.12), 1.2 + random() * 1.8, z];
      tube(add(at, [side * 0.12, -0.48, 0]), at, [0.035, 0.025], BRONZE, { vary: 0.18 });
      ellipsoid(add(at, [0, 0.03, 0]), [0.04, 0.045, 0.04], DARK_STEEL);
      const flameColour = pick([hex("#66d6ff"), hex("#b56cff"), hex("#62f4a5"), hex("#ff89c9")]);
      for (let index = 0; index < 38; index++) {
        speck(add(at, [spread(0.055), 0.12 + random() * 0.32, spread(0.055)]), [0.026, 0.045, 0.026], flameColour, 0.72, { motion: MOTION.drift, phase: random(), lit: true });
      }
      break;
    }
    case "door": {
      const width = 0.65 + random() * 0.35;
      const height = 1.7 + random() * 0.55;
      const base: Vec3 = [middle + side * (halfWidth - 0.08), 0.02, z];
      tube(add(base, [0, 0, -width]), add(base, [0, height, -width]), [0.075, 0.075], WOOD);
      tube(add(base, [0, 0, width]), add(base, [0, height, width]), [0.075, 0.075], WOOD);
      tube(add(base, [0, height, -width]), add(base, [0, height, width]), [0.075, 0.075], WOOD);
      for (let panel = 0; panel < 3; panel++) {
        const y = 0.35 + panel * 0.48;
        ellipsoid(add(base, [side * 0.015, y, spread(0.15)]), [0.028, 0.12, 0.28], WOOD, { vary: 0.22 });
      }
      ellipsoid(add(base, [side * 0.09, height * 0.48, 0]), [0.055, 0.055, 0.055], BRONZE);
      break;
    }
    case "trap": {
      const centre: Vec3 = [middle + spread(halfWidth * 0.65), 0.018, z];
      const radius = 0.32 + random() * 0.34;
      ellipsoid(centre, [radius, 0.018, radius * 0.65], DARK_STEEL, { vary: 0.12 });
      for (let spike = 0; spike < 7; spike++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius;
        const at = add(centre, [Math.cos(angle) * distance, 0.02, Math.sin(angle) * distance * 0.65]);
        tube(at, add(at, [spread(0.03), 0.16 + random() * 0.16, spread(0.03)]), [0.018, 0.002], STEEL, { vary: 0.25 });
      }
      break;
    }
    case "particles": {
      const centre: Vec3 = [middle + spread(halfWidth * 0.65), 0.5 + random() * 1.8, z];
      const colour = pick([hex("#75baff"), hex("#dc82ff"), hex("#72f0c1"), hex("#ffd66b")]);
      for (let index = 0; index < 30; index++) {
        speck(add(centre, [spread(0.55), spread(0.6), spread(0.55)]), 0.018 + random() * 0.018, colour, 0.75, { motion: MOTION.drift, phase: random(), lit: true });
      }
      break;
    }
    case "skeleton": {
      const base: Vec3 = [middle + spread(halfWidth * 0.65), 0.12, z];
      ellipsoid(add(base, [0, 0.72, 0]), [0.12, 0.14, 0.11], BONE, { vary: 0.12 });
      tube(add(base, [0, 0.58, 0]), add(base, [0, 0.22, 0]), [0.035, 0.025], BONE, { vary: 0.12 });
      tube(add(base, [-0.08, 0.5, 0]), add(base, [-0.38, 0.22, spread(0.12)]), [0.028, 0.018], BONE);
      tube(add(base, [0.08, 0.5, 0]), add(base, [0.38, 0.22, spread(0.12)]), [0.028, 0.018], BONE);
      tube(add(base, [-0.08, 0.22, 0]), add(base, [-0.32, 0.03, 0.18]), [0.035, 0.018], BONE);
      tube(add(base, [0.08, 0.22, 0]), add(base, [0.32, 0.03, -0.18]), [0.035, 0.018], BONE);
      break;
    }
    case "sword": {
      const base: Vec3 = [middle + spread(halfWidth * 0.65), 0.06, z];
      const bladeTip = add(base, [0.65 + random() * 0.22, 0.09, spread(0.18)]);
      tube(base, bladeTip, [0.018, 0.008], STEEL, { vary: 0.08 });
      tube(add(base, [-0.11, 0, -0.04]), add(base, [0.11, 0, 0.04]), [0.025, 0.025], GOLD);
      tube(add(base, [-0.16, -0.04, -0.02]), add(base, [-0.22, 0.02, 0.02]), [0.028, 0.02], DARK_LEATHER);
      break;
    }
    case "blood": {
      const centre: Vec3 = [middle + spread(halfWidth * 0.65), 0.018, z];
      const radius = 0.22 + random() * 0.5;
      const blood = pick([hex("#7a1717"), hex("#981f1f"), hex("#5e1218")]);
      for (let index = 0; index < 42; index++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius;
        speck(add(centre, [Math.cos(angle) * distance, 0, Math.sin(angle) * distance * 0.55]), [0.024, 0.006, 0.024], blood, 0.82, { lit: true });
      }
      break;
    }
    default: {
      break;
    }
  }
}

/** Small environmental features that vary in placement and appearance with every cave. */
// eslint-disable-next-line max-lines-per-function
function caveDetails(sculpt: Sculptor) {
  const { random, spread, pick, ellipsoid, tube, speck } = sculpt;
  const crystalColours = [hex("#6688aa"), hex("#8870a0"), hex("#75a8a0"), hex("#a49a78")];

  for (let cluster = 0; cluster < 14; cluster++) {
    const z = 2 - random() * 30;
    const { middle, halfWidth } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const base: Vec3 = [middle + side * (halfWidth - 1.2 - random() * 0.8), 0.02, z];
    const crystal = pick(crystalColours);
    const count = 3 + Math.floor(random() * 5);
    for (let index = 0; index < count; index++) {
      const tall = 0.12 + random() * 0.48;
      const offset: Vec3 = [spread(0.18), 0, spread(0.18)];
      const tip = add(base, add(offset, [(random() - 0.5) * 0.08, tall, (random() - 0.5) * 0.08]));
      tube(add(base, offset), tip, [0.018 + random() * 0.018, 0.002], crystal, { vary: 0.18 });
      speck(tip, 0.015, crystal, 0.8, { lit: true });
    }
  }

  for (let patch = 0; patch < 12; patch++) {
    const z = 2 - random() * 27;
    const { middle, halfWidth } = section(z);
    const centre: Vec3 = [middle + spread(halfWidth * 0.7), 0.015, z];
    const count = 2 + Math.floor(random() * 4);
    const cap = pick([hex("#7a4e32"), hex("#9a7650"), hex("#5f663e"), hex("#8a6a78")]);
    for (let index = 0; index < count; index++) {
      const at = add(centre, [spread(0.32), 0, spread(0.32)]);
      const height = 0.05 + random() * 0.12;
      tube(at, add(at, [0, height, 0]), [0.018, 0.024], BONE, { vary: 0.2 });
      ellipsoid(add(at, [0, height + 0.025, 0]), [0.055 + random() * 0.025, 0.022, 0.055 + random() * 0.025], cap, { vary: 0.25 });
    }
  }

  for (let pool = 0; pool < 5; pool++) {
    const z = -3 - random() * 24;
    const { middle, halfWidth } = section(z);
    const centre: Vec3 = [middle + spread(halfWidth * 0.45), 0.022, z];
    const radius = 0.25 + random() * 0.65;
    for (let index = 0; index < 30; index++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      speck(add(centre, [Math.cos(angle) * distance, 0, Math.sin(angle) * distance * 0.55]),
        [0.018, 0.008, 0.018], pick([hex("#31465a"), hex("#456078"), hex("#6f7d7e")]), 0.45, { lit: true });
    }
  }

  for (let root = 0; root < 9; root++) {
    const z = -5 - random() * 25;
    const { middle, halfWidth, height } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const rootStart: Vec3 = [middle + side * halfWidth * (0.55 + random() * 0.35), height * (0.72 + random() * 0.18), z];
    const reach = 0.8 + random() * 1.8;
    tube(rootStart, add(rootStart, [side * reach * 0.45, -reach, spread(0.25)]), [0.035, 0.008], WOOD, { vary: 0.25, folds: 5 });
  }

  for (let discovery = 0; discovery < 14; discovery++) {
    caveDiscovery(sculpt);
  }
}

/** A torch's flame, where it burns, and the light around it. */
function flame({ random, spread, speck }: Sculptor, at: Vec3, light: number, size: number) {
  for (let index = 0; index < 260; index++) {
    const radius = Math.sqrt(random()) * 0.055 * size;
    const angle = random() * Math.PI * 2;
    speck(
      add(at, [Math.cos(angle) * radius, random() * 0.03, Math.sin(angle) * radius]),
      [0.035 * size, 0.06 * size, 0.035 * size],
      [1.3, 1.3, 1.3],
      0.5,
      { light, motion: MOTION.flame, phase: random() },
    );
  }
  speck(add(at, [0, 0.08, 0]), 0.05 * size, [1.4, 1.1, 0.6], 0.9, { light });
  for (let index = 0; index < 50; index++) {
    speck(add(at, [spread(0.03), 0.3, spread(0.03)]), 0.05 * size, [0.035, 0.032, 0.03], 0.1, {
      light,
      motion: MOTION.smoke,
      phase: random(),
      lit: true,
    });
  }
  speck(add(at, [0, 0.14, 0]), 0.3 * size, scale(TORCHLIGHT, 0.08), 0.5, { light });
  speck(add(at, [0, 0.14, 0]), 0.9 * size, scale(TORCHLIGHT, 0.035), 0.35, { light });
  for (let index = 0; index < 14; index++) {
    speck(add(at, [spread(1.6), spread(0.8) - 0.3, spread(1.2)]), 0.012, [1, 0.75, 0.45], 0.6, {
      light,
      motion: MOTION.drift,
      phase: random(),
    });
  }
}

/** A torch held up in a hand: the stave, and the flame on top. Returns where its light is. */
function torch(sculpt: Sculptor, hand: Vec3, light: number, size = 1): Vec3 {
  const top = add(hand, [0.02, 0.32, -0.02]);
  sculpt.tube(add(hand, [0, -0.12, 0]), top, [0.025, 0.035], WOOD);
  sculpt.ellipsoid(top, [0.045, 0.04, 0.045], hex("#2a1a10"));
  flame(sculpt, add(top, [0, 0.03, 0]), light, size);
  return add(top, [0, 0.16, 0]);
}

/** A pair of boots, toes forward, under legs `apart` either side of the middle. */
function boots({ ellipsoid }: Sculptor, at: (p: Vec3) => Vec3, apart: number, size = 1) {
  for (const side of [-1, 1]) {
    ellipsoid(
      at([side * apart, 0.06 * size, -0.03]),
      [0.075 * size, 0.07 * size, 0.13 * size],
      BOOT,
    );
  }
}

/** A ring of little round things, around `centre` in the plane of `first` and `second`. */
function ring(
  { ellipsoid }: Sculptor,
  centre: Vec3,
  [first, second]: [Vec3, Vec3],
  radius: number,
  bead: number,
  colour: Vec3,
  count: number,
) {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const at = add(
      centre,
      add(scale(first, Math.cos(angle) * radius), scale(second, Math.sin(angle) * radius)),
    );
    ellipsoid(at, [bead, bead, bead], colour, { vary: 0.1 });
  }
}

/* The warrior: plate and a red cloak, a round painted shield and a greatsword slung behind, torch held high. */
function warrior(sculpt: Sculptor, origin: Vec3, facing: -1 | 1): Vec3 {
  const { ellipsoid, tube } = sculpt;
  const at = (p: Vec3): Vec3 => [origin[0] + p[0] * facing, origin[1] + p[1], origin[2] + p[2]];
  const cloak = hex("#6a1a1e");
  const plume = hex("#9a2a24");
  boots(sculpt, at, 0.12);
  for (const side of [-1, 1]) {
    tube(at([side * 0.12, 0.08, 0]), at([side * 0.12, 0.9, 0]), [0.075, 0.095], DARK_STEEL, {
      vary: 0.1,
    });
    ellipsoid(at([side * 0.12, 0.5, -0.04]), [0.07, 0.06, 0.06], STEEL, { vary: 0.1 });
  }
  // A mail skirt shows under the cloak; plate over the body, mail at the neck.
  tube(at([0, 0.98, 0]), at([0, 0.6, 0]), [0.24, 0.3], CHAIN, { vary: 0.3, folds: 16 });
  tube(at([0, 0.93, 0.02]), at([0, 0.88, 0.04]), [0.3, 0.305], DARK_LEATHER, { folds: 12 });
  ellipsoid(at([0, 0.91, 0.31]), [0.075, 0.06, 0.025], BRONZE, { vary: 0.1 });
  ellipsoid(at([0, 1.22, -0.02]), [0.27, 0.34, 0.17], STEEL, { motion: MOTION.idle, phase: 0.1 });
  tube(at([0, 1.62, 0]), at([0, 1.5, 0]), [0.1, 0.16], CHAIN, { vary: 0.3 });
  // The cloak, its gold-stitched hem, and the fold of it over the shoulders.
  tube(at([0, 1.48, 0.06]), at([0, 0.16, 0.14]), [0.25, 0.43], cloak, { vary: 0.12, folds: 9, motion: MOTION.idle, phase: 0.1 });
  tube(at([0, 0.22, 0.135]), at([0, 0.15, 0.14]), [0.425, 0.44], GOLD, { vary: 0.2 });
  ellipsoid(at([0, 1.5, 0.05]), [0.25, 0.06, 0.17], hex("#561418"));
  for (const side of [-1, 1]) {
    ellipsoid(at([side * 0.28, 1.47, 0]), [0.15, 0.1, 0.14], STEEL);
    ellipsoid(at([side * 0.28, 1.43, 0]), [0.16, 0.035, 0.15], BRONZE, { vary: 0.1 });
    for (const [x, z] of [
      [0.2, 0.06],
      [0.3, 0.1],
      [0.38, 0.04],
    ] as const) {
      ellipsoid(at([side * x, 1.53, z]), [0.012, 0.012, 0.012], BRONZE, { vary: 0.05 });
    }
  }
  // The helm, and its plume running back over the top and down behind.
  ellipsoid(at([0, 1.71, 0]), [0.12, 0.15, 0.13], STEEL);
  ellipsoid(at([0, 1.64, 0]), [0.13, 0.025, 0.14], BRONZE, { vary: 0.1 });
  for (const side of [-1, 1]) {
    ellipsoid(at([side * 0.095, 1.67, 0.07]), [0.018, 0.018, 0.018], BRONZE, { vary: 0.05 });
  }
  tube(at([0, 1.86, -0.07]), at([0, 1.87, 0.07]), [0.035, 0.04], plume, { folds: 6 });
  tube(at([0, 1.87, 0.07]), at([0, 1.6, 0.22]), [0.04, 0.012], plume, { folds: 6 });
  // The greatsword: blade down across the back, hilt up over the left shoulder.
  const guard: Vec3 = [-0.3, 1.95, 0.47];
  const down: Vec3 = normalize([0.54, -1.4, 0.03]);
  tube(at(guard), at([0.24, 0.55, 0.5]), [0.032, 0.012], hex("#9aa0aa"), { vary: 0.08 });
  tube(
    at(add(guard, [-0.12, -0.046, 0])),
    at(add(guard, [0.12, 0.046, 0])),
    [0.022, 0.022],
    BRONZE,
    {
      vary: 0.1,
    },
  );
  tube(at(guard), at(add(guard, scale(down, -0.22))), [0.022, 0.022], DARK_LEATHER, { folds: 10 });
  ellipsoid(at(add(guard, scale(down, -0.26))), [0.035, 0.035, 0.035], BRONZE, { vary: 0.1 });
  // The shield: oak, quartered by a red cross, bronze-rimmed with a boss.
  ellipsoid(at([0, 1.12, 0.38]), [0.34, 0.34, 0.05], WOOD, { vary: 0.25 });
  ellipsoid(at([0, 1.12, 0.425]), [0.06, 0.31, 0.012], plume, { vary: 0.1 });
  ellipsoid(at([0, 1.12, 0.425]), [0.31, 0.06, 0.012], plume, { vary: 0.1 });
  ellipsoid(at([0, 1.12, 0.45]), [0.07, 0.07, 0.04], BRONZE, { vary: 0.1 });
  ring(
    sculpt,
    at([0, 1.12, 0.41]),
    [
      [1, 0, 0],
      [0, 1, 0],
    ],
    0.33,
    0.028,
    BRONZE,
    64,
  );
  // The left arm hangs; the right holds the torch up.
  tube(at([-0.32, 1.42, 0]), at([-0.38, 1.16, 0.01]), [0.075, 0.068], STEEL);
  ellipsoid(at([-0.38, 1.15, 0.01]), [0.07, 0.06, 0.07], STEEL);
  tube(at([-0.38, 1.14, 0.01]), at([-0.4, 0.92, 0.02]), [0.065, 0.06], STEEL);
  ellipsoid(at([-0.41, 0.87, 0.02]), [0.055, 0.07, 0.05], DARK_STEEL);
  tube(at([0.32, 1.42, 0]), at([0.46, 1.74, -0.06]), [0.075, 0.065], STEEL);
  ellipsoid(at([0.46, 1.74, -0.06]), [0.068, 0.06, 0.068], STEEL);
  tube(at([0.46, 1.74, -0.06]), at([0.5, 2.02, -0.1]), [0.065, 0.055], STEEL);
  ellipsoid(at([0.5, 2.04, -0.1]), [0.055, 0.06, 0.055], DARK_STEEL);
  return torch(sculpt, at([0.5, 2.08, -0.1]), 0, 1.25);
}

/* The dwarf: short and broad, braided red hair, a horned helm, a laden pack and an axe on the shoulder. */
function dwarf(sculpt: Sculptor, origin: Vec3, facing: -1 | 1) {
  const { ellipsoid, tube } = sculpt;
  const at = (p: Vec3): Vec3 => [origin[0] + p[0] * facing, origin[1] + p[1], origin[2] + p[2]];
  const cloth = hex("#4a3424");
  const hair = hex("#a0502a");
  boots(sculpt, at, 0.14, 1.2);
  for (const side of [-1, 1]) {
    tube(at([side * 0.14, 0.08, 0]), at([side * 0.14, 0.5, 0]), [0.1, 0.11], cloth, { folds: 5 });
  }
  ellipsoid(at([0, 0.78, 0]), [0.32, 0.36, 0.25], cloth, { motion: MOTION.idle, phase: 0.35 });
  tube(at([0, 0.47, 0]), at([0, 0.62, 0]), [0.31, 0.3], CHAIN, { vary: 0.3, folds: 14 });
  // Hair in braids down the back, and the beard spilling out at the sides.
  for (const side of [-1, 0, 1]) {
    tube(at([side * 0.07, 1.14, 0.1]), at([side * 0.09, 0.92, 0.17]), [0.032, 0.022], hair, {
      folds: 8,
    });
    ellipsoid(at([side * 0.09, 0.91, 0.17]), [0.025, 0.02, 0.025], BRONZE, { vary: 0.1 });
  }
  for (const side of [-1, 1]) {
    ellipsoid(at([side * 0.15, 1.06, -0.08]), [0.07, 0.11, 0.08], hair, { vary: 0.25 });
  }
  // The helm, its bronze band, and the horns.
  ellipsoid(at([0, 1.2, -0.02]), [0.15, 0.14, 0.15], STEEL);
  ellipsoid(at([0, 1.14, -0.02]), [0.16, 0.03, 0.16], BRONZE, { vary: 0.1 });
  for (const side of [-1, 1]) {
    tube(at([side * 0.13, 1.25, 0]), at([side * 0.24, 1.32, 0.01]), [0.035, 0.03], BONE, {
      vary: 0.1,
    });
    tube(at([side * 0.24, 1.32, 0.01]), at([side * 0.28, 1.46, 0.02]), [0.03, 0.005], BONE, {
      vary: 0.1,
    });
  }
  // The pack: its flap and straps, a bedroll on top, rope and a pan hanging off it.
  ellipsoid(at([0, 0.88, 0.24]), [0.29, 0.32, 0.17], LEATHER, { vary: 0.22 });
  ellipsoid(at([0, 1.06, 0.3]), [0.27, 0.09, 0.13], DARK_LEATHER);
  ellipsoid(at([0, 0.98, 0.42]), [0.035, 0.03, 0.015], BRONZE, { vary: 0.1 });
  for (const side of [-1, 1]) {
    tube(at([side * 0.16, 1.04, -0.08]), at([side * 0.16, 1.1, 0.18]), [0.03, 0.03], DARK_LEATHER);
    tube(at([side * 0.16, 0.95, 0.41]), at([side * 0.16, 0.65, 0.4]), [0.022, 0.022], DARK_LEATHER);
  }
  tube(at([-0.33, 1.21, 0.22]), at([0.33, 1.21, 0.22]), [0.1, 0.1], hex("#5a5a3a"), { folds: 3 });
  for (const side of [-1, 1]) {
    tube(at([side * 0.2, 1.21, 0.22]), at([side * 0.22, 1.21, 0.22]), [0.105, 0.105], DARK_LEATHER);
  }
  tube(at([-0.27, 0.58, 0.02]), at([0.27, 0.58, 0.02]), [0.025, 0.025], DARK_LEATHER);
  ellipsoid(at([0, 0.58, 0.38]), [0.06, 0.055, 0.02], BRONZE, { vary: 0.1 });
  ring(
    sculpt,
    at([0.33, 0.82, 0.26]),
    [
      [0, 1, 0],
      [0, 0, 1],
    ],
    0.1,
    0.022,
    hex("#8a7450"),
    22,
  );
  ellipsoid(at([-0.32, 0.72, 0.3]), [0.02, 0.11, 0.11], DARK_STEEL, { vary: 0.1 });
  tube(at([-0.32, 0.84, 0.3]), at([-0.32, 1, 0.31]), [0.015, 0.015], DARK_STEEL);
  tube(at([-0.12, 0.62, 0.42]), at([0.12, 0.62, 0.42]), [0.06, 0.06], hex("#2a2a2a"));
  // Arms, with hands showing at the ends of the sleeves.
  for (const side of [-1, 1]) {
    tube(at([side * 0.33, 1.05, 0]), at([side * 0.36, 0.72, 0.02]), [0.08, 0.07], cloth, {
      folds: 4,
    });
    ellipsoid(at([side * 0.365, 0.66, 0.02]), [0.05, 0.055, 0.05], SKIN);
  }
  // The axe over the right shoulder: haft, bound grip, and a double bit.
  tube(at([0.24, 0.95, 0.02]), at([0.42, 1.62, -0.06]), [0.025, 0.025], WOOD);
  tube(at([0.27, 1.06, 0.01]), at([0.31, 1.22, 0]), [0.03, 0.03], DARK_LEATHER, { folds: 8 });
  ellipsoid(at([0.3, 1.14, 0.02]), [0.035, 0.025, 0.035], BRONZE, { vary: 0.1 });
  ellipsoid(at([0.34, 1.32, 0.01]), [0.035, 0.025, 0.035], BRONZE, { vary: 0.1 });
  ellipsoid(at([0.52, 1.56, -0.06]), [0.12, 0.1, 0.022], STEEL, { vary: 0.1 });
  ellipsoid(at([0.32, 1.6, -0.06]), [0.1, 0.085, 0.022], STEEL, { vary: 0.1 });
  tube(at([0.42, 1.62, -0.06]), at([0.44, 1.72, -0.065]), [0.02, 0.004], STEEL);
}

/* The ranger: a green hooded cloak worn ragged at the hem, a quiver of arrows and a strung bow, and the second torch. */
function ranger(sculpt: Sculptor, origin: Vec3, facing: -1 | 1): Vec3 {
  const { random, ellipsoid, tube, speck } = sculpt;
  const at = (p: Vec3): Vec3 => [origin[0] + p[0] * facing, origin[1] + p[1], origin[2] + p[2]];
  const cloak = hex("#2a4430");
  const trousers = hex("#3a3024");
  boots(sculpt, at, 0.1, 0.95);
  for (const side of [-1, 1]) {
    tube(at([side * 0.1, 0.1, 0]), at([side * 0.1, 0.9, 0]), [0.07, 0.09], trousers, { folds: 4 });
  }
  tube(at([0, 1.5, 0.02]), at([0, 0.14, 0.06]), [0.22, 0.36], cloak, { vary: 0.12, folds: 8, motion: MOTION.idle, phase: 0.6 });
  tube(at([0, 0.92, 0.02]), at([0, 0.86, 0.04]), [0.235, 0.24], DARK_LEATHER, { folds: 8 });
  ellipsoid(at([0, 0.89, 0.22]), [0.055, 0.045, 0.02], BRONZE, { vary: 0.1 });
  for (let index = 0; index < 22; index++) {
    const angle = Math.PI * (0.1 + 0.8 * (index / 21)) + (random() - 0.5) * 0.1;
    ellipsoid(
      at([Math.cos(angle) * 0.35, 0.12 + random() * 0.05, 0.06 + Math.sin(angle) * 0.35]),
      [0.035, 0.05 + random() * 0.04, 0.02],
      scale(cloak, 0.8),
      { vary: 0.2 },
    );
  }
  // The hood, its trim, and its point lying back.
  ellipsoid(at([0, 1.66, 0]), [0.14, 0.17, 0.15], cloak);
  ellipsoid(at([0, 1.55, 0.01]), [0.17, 0.05, 0.16], hex("#3a5a3e"));
  tube(at([0, 1.76, 0.06]), at([0, 1.62, 0.2]), [0.06, 0.01], cloak);
  // The quiver, banded in bronze, with arrows: shafts, then fletching.
  tube(at([0.2, 1.62, 0.2]), at([-0.14, 0.86, 0.22]), [0.07, 0.06], LEATHER, { folds: 5 });
  for (const t of [0.1, 0.85]) {
    const from: Vec3 = [0.2 - 0.34 * t, 1.62 - 0.76 * t, 0.2 + 0.02 * t];
    tube(at(from), at(add(from, [-0.009, -0.02, 0])), [0.075, 0.075], BRONZE, { vary: 0.1 });
  }
  for (let index = 0; index < 6; index++) {
    const base: Vec3 = [0.15 + index * 0.02, 1.62, 0.2 + (index % 2) * 0.02];
    const tip = add(base, [0.04, 0.12, -0.01]);
    tube(at(base), at(tip), [0.006, 0.006], WOOD);
    speck(
      at(tip),
      [0.012, 0.03, 0.006],
      index % 3 === 0 ? [0.5, 0.08, 0.06] : [0.5, 0.48, 0.44],
      0.85,
      {
        lit: true,
      },
    );
  }
  // The bow on the back, and its string.
  for (let index = 0; index <= 24; index++) {
    const t = index / 24;
    const y = 0.75 + t * 1.15;
    ellipsoid(at([-0.2 + Math.sin(t * Math.PI) * 0.12, y, 0.24]), [0.02, 0.035, 0.02], WOOD, {
      vary: 0.1,
    });
  }
  tube(at([-0.2, 0.76, 0.245]), at([-0.2, 1.89, 0.245]), [0.004, 0.004], hex("#c8c0a8"));
  ellipsoid(at([-0.08, 1.32, 0.25]), [0.02, 0.05, 0.022], DARK_LEATHER);
  // A pouch at the belt, map case, and the arms: one down, one holding the torch.
  ellipsoid(at([-0.27, 0.92, 0.08]), [0.06, 0.075, 0.05], LEATHER);
  tube(at([0.26, 0.84, 0.09]), at([0.28, 0.72, 0.14]), [0.06, 0.052], LEATHER, { folds: 4 });
  tube(at([0.28, 0.72, 0.14]), at([0.28, 0.68, 0.15]), [0.064, 0.064], DARK_LEATHER);
  tube(at([0.24, 1.42, 0]), at([0.28, 0.95, 0.02]), [0.065, 0.055], cloak, { folds: 4 });
  ellipsoid(at([0.285, 0.9, 0.02]), [0.045, 0.05, 0.045], DARK_LEATHER);
  tube(at([-0.24, 1.42, 0]), at([-0.38, 1.72, -0.05]), [0.065, 0.055], cloak, { folds: 4 });
  tube(at([-0.38, 1.72, -0.05]), at([-0.4, 1.95, -0.08]), [0.055, 0.05], cloak, { folds: 4 });
  ellipsoid(at([-0.4, 1.97, -0.08]), [0.045, 0.05, 0.045], DARK_LEATHER);
  tube(at([-0.36, 1.1, -0.02]), at([-0.38, 1.02, -0.03]), [0.075, 0.075], DARK_LEATHER);
  tube(at([0.27, 1.12, -0.02]), at([0.29, 1.03, -0.03]), [0.075, 0.075], DARK_LEATHER);
  return torch(sculpt, at([-0.4, 2, -0.08]), 1, 1.05);
}

/* The wizard: a starry blue robe with a moon on the back, a long white beard, a tall hat, a staff, and a hand held up to the wisp. */
function wizard(sculpt: Sculptor, origin: Vec3, facing: -1 | 1): Vec3 {
  const { random, ellipsoid, tube, speck } = sculpt;
  const at = (p: Vec3): Vec3 => [origin[0] + p[0] * facing, origin[1] + p[1], origin[2] + p[2]];
  const robe = hex("#252c60");
  const beard = hex("#d0ccc4");
  const sash = hex("#6a2a5a");
  tube(at([0, 1.45, 0]), at([0, 0.02, 0.05]), [0.22, 0.5], robe, { vary: 0.12, folds: 10, motion: MOTION.idle, phase: 0.85 });
  tube(at([0, 0.09, 0.05]), at([0, 0.02, 0.05]), [0.49, 0.505], GOLD, { vary: 0.15 });
  for (let index = -4; index <= 4; index++) {
    speck(at([index * 0.055, 0.105, 0.42]), 0.018, GOLD, 0.9, { lit: true });
  }
  tube(at([0, 1.03, 0.02]), at([0, 0.96, 0.025]), [0.33, 0.345], sash, { folds: 6 });
  tube(at([0.08, 0.98, 0.34]), at([0.12, 0.62, 0.4]), [0.035, 0.025], sash, { folds: 3 });
  ellipsoid(at([0, 1.5, 0]), [0.24, 0.14, 0.17], robe);
  // White hair down the back, and the beard showing either side.
  ellipsoid(at([0, 1.64, 0]), [0.12, 0.13, 0.12], hex("#b8b0a8"));
  tube(at([0, 1.66, 0.08]), at([0, 1.32, 0.17]), [0.1, 0.05], beard, { folds: 9 });
  for (const side of [-1, 1]) {
    tube(at([side * 0.1, 1.6, -0.08]), at([side * 0.07, 1.3, -0.12]), [0.06, 0.02], beard, {
      folds: 6,
    });
  }
  // The hat: brim, a gold band, and a crooked crown.
  ellipsoid(at([0, 1.79, 0]), [0.38, 0.035, 0.36], robe);
  tube(at([0, 1.8, 0]), at([0.1, 2.2, 0.03]), [0.17, 0.08], robe, { folds: 5 });
  tube(at([0, 1.82, 0]), at([0.012, 1.87, 0.004]), [0.172, 0.165], GOLD, { vary: 0.12 });
  tube(at([0.1, 2.2, 0.03]), at([0.24, 2.4, 0.08]), [0.08, 0.005], robe);
  // Stars over the robe, and a crescent moon between the shoulders.
  for (let index = 0; index < 60; index++) {
    const height = 0.15 + random() * 1.25;
    const radius = 0.22 + (0.28 * (1.45 - height)) / 1.45;
    const angle = (random() - 0.5) * Math.PI * 1.2 + Math.PI / 2;
    speck(
      at([Math.cos(angle) * radius, height, Math.sin(angle) * radius + 0.04]),
      0.008,
      [1.1, 0.9, 0.5],
      0.8,
    );
  }
  for (let index = 0; index < 14; index++) {
    const angle = Math.PI * (0.25 + (1.5 * index) / 13);
    const thick = Math.sin((Math.PI * index) / 13);
    speck(
      at([Math.cos(angle) * 0.075, 1.2 + Math.sin(angle) * 0.075, 0.285]),
      0.008 + 0.008 * thick,
      [1.2, 1, 0.55],
      0.9,
    );
  }
  // The right arm down to the staff; the left raised to the wisp, its wide sleeve fallen back.
  tube(at([0.28, 1.42, 0]), at([0.36, 1.05, -0.05]), [0.08, 0.1], robe, { folds: 5 });
  tube(at([0.36, 1.07, -0.05]), at([0.37, 1.03, -0.055]), [0.105, 0.11], GOLD, { vary: 0.12 });
  ellipsoid(at([0.38, 1, -0.07]), [0.045, 0.05, 0.045], SKIN);
  tube(at([0.38, 0, -0.08]), at([0.4, 2.1, -0.1]), [0.03, 0.03], WOOD, { vary: 0.3, folds: 3 });
  ellipsoid(at([0.4, 2.13, -0.1]), [0.07, 0.08, 0.07], WOOD, { vary: 0.3 });
  tube(at([0.4, 1.58, -0.095]), at([0.4, 1.62, -0.098]), [0.045, 0.045], BRONZE, { vary: 0.1 });
  tube(at([0.4, 1.98, -0.098]), at([0.4, 2.02, -0.1]), [0.045, 0.045], BRONZE, { vary: 0.1 });
  speck(at([0.4, 2.24, -0.1]), [0.03, 0.045, 0.03], [0.5, 0.9, 1.2], 0.9);
  tube(at([-0.26, 1.44, 0]), at([-0.48, 1.68, -0.1]), [0.08, 0.1], robe, { folds: 5 });
  tube(at([-0.47, 1.67, -0.1]), at([-0.5, 1.7, -0.11]), [0.105, 0.11], GOLD, { vary: 0.12 });
  tube(at([-0.48, 1.68, -0.1]), at([-0.6, 1.92, -0.2]), [0.045, 0.04], SKIN);
  ellipsoid(at([-0.62, 1.98, -0.22]), [0.05, 0.07, 0.04], SKIN);
  return at([-0.78, 2.3, -0.4]);
}

/** The wizard's wisp: a bright core in a blue haze, with sparks circling it. */
function wisp({ random, speck }: Sculptor, at: Vec3) {
  const light = 2;
  speck(at, 0.04, [2, 2, 2], 1, { light });
  speck(at, 0.1, [0.6, 0.85, 1.4], 0.8, { light });
  speck(at, 0.32, scale(WISPLIGHT, 0.12), 0.5, { light });
  speck(at, 0.8, scale(WISPLIGHT, 0.04), 0.4, { light });
  for (let index = 0; index < 5; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.16 + random() * 0.12;
    speck(
      add(at, [Math.cos(angle) * radius, (random() - 0.5) * 0.1, Math.sin(angle) * radius]),
      0.012,
      [0.9, 1.1, 1.5],
      0.9,
      {
        light,
        motion: MOTION.orbit,
        phase: random(),
      },
    );
  }
}

/** The wisp bobs about the wizard's hand, and now and then flies off to scout down the cave. */
function wispDrift(home: Vec3, seed: string) {
  const flight = flightPlan(`${seed}:scouting`, (random) => {
    const z = -12 - random() * 22;
    const { middle } = section(z);
    return sub([middle + (random() - 0.5) * 3.2, 1.3 + random() * 2.2, z], home);
  });
  return (seconds: number): Vec3 =>
    add(flight(seconds), [
      Math.sin(seconds * 0.7) * 0.09,
      Math.sin(seconds * 1.13) * 0.09,
      Math.cos(seconds * 0.61) * 0.06,
    ]);
}

/** A seed for a cave no one has seen before. */
export const freshSeed = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Where a light of the cave built from `seed` has moved to at a moment, from where it started. */
export function lightDrift(light: Light, seed: string): (seconds: number) => Vec3 {
  return light.scouts ? wispDrift(light.at, seed) : () => [0, 0, 0];
}

export function buildCave(seed = freshSeed()): Cave {
  const random = seededRandom(seed);
  const splats: Splat[] = [];
  // The rock is seen from further off than the party, so it's laid on coarser.
  const rock = sculptor(random, splats, 280);
  const party = sculptor(random, splats, 900);
  walls(rock);
  floor(rock);
  spikes(rock);
  caveDetails(rock);
  const spots: Vec3[] = [
    [-3.6, 0, 1.2],
    [-1.2, 0, -1.8],
    [1.2, 0, -4.8],
    [3.6, 0, -7.2],
  ];
  for (let index = spots.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [spots[index], spots[swap]] = [spots[swap]!, spots[index]!];
  }
  const partySpot = (index: number): Vec3 => {
    const spot = spots[index]!;
    const z = Math.max(-8.8, Math.min(2.2, spot[2] + (random() * 2 - 1) * 1.8));
    const { middle, halfWidth } = section(z);
    const limit = Math.max(1.8, halfWidth - 0.9);
    const x = middle + Math.max(-limit, Math.min(limit, spot[0] + (random() * 2 - 1) * 1.2));
    return [x, 0, z];
  };
  const warriorTorch = warrior(party, partySpot(0), random() < 0.5 ? -1 : 1);
  dwarf(party, partySpot(1), random() < 0.5 ? -1 : 1);
  const rangerTorch = ranger(party, partySpot(2), random() < 0.5 ? -1 : 1);
  const wispAt = wizard(party, partySpot(3), random() < 0.5 ? -1 : 1);
  wisp(party, wispAt);
  return {
    splats,
    lights: [
      { at: warriorTorch, colour: TORCHLIGHT, reach: 6, period: 3.7, scouts: false },
      { at: rangerTorch, colour: scale(TORCHLIGHT, 0.85), reach: 5.5, period: 4.6, scouts: false },
      { at: wispAt, colour: WISPLIGHT, reach: 7, period: 2.9, scouts: true },
    ],
    party: ["warrior", "dwarf", "ranger", "wizard"],
  };
}
