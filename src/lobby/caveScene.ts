import { seededRandom } from "../lib/seededRandom";
import {
  add,
  hex,
  length,
  MOTION,
  normalize,
  scale,
  sub,
  tangents,
  times,
  type Motion,
  type Splat,
  type Vec3,
} from "./splat";

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
  /** How far it wanders from where it is. */
  wander: number;
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

const WALL_PAINTS = ["#7a5a38", "#60442e", "#4a3832", "#3e343e", "#96704a", "#2c2224"].map(hex);
const FLOOR_PAINTS = ["#705438", "#543e2c", "#3a2e2a", "#8a6842"].map(hex);
const TORCHLIGHT = scale([1, 0.5, 0.19], 2.6);
const WISPLIGHT = scale([0.42, 0.68, 1], 2.6);

/** Smooth noise in [0, 1), the same for the same point. */
function noise([x, y, z]: Vec3): number {
  const hash = (index: number, index_: number, k: number) => {
    let h =
      Math.imul(index, 374_761_393) + Math.imul(index_, 668_265_263) + Math.imul(k, 1_440_662_683);
    h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
    return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
  };
  const [index, index_, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  const [u, v, w] = [ease(x - index), ease(y - index_), ease(z - k)];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (dk: number) =>
    lerp(
      lerp(hash(index, index_, k + dk), hash(index + 1, index_, k + dk), u),
      lerp(hash(index, index_ + 1, k + dk), hash(index + 1, index_ + 1, k + dk), u),
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
function section(z: number) {
  const depth = (NEAR - z) / (NEAR - FAR);
  return {
    middle: -0.0022 * Math.min(0, z) ** 2,
    halfWidth: 4.9 - 1.9 * depth,
    height: 5.3 - 1.7 * depth,
  };
}

/** Lays splats over shapes, from one stream of random numbers. */
function sculptor(seed: string) {
  const random = seededRandom(seed);
  const splats: Splat[] = [];
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
  ) => {
    const [first, second] = tangents(facing, along);
    splats.push({
      at,
      axes: [scale(first, long), scale(second, wide), scale(facing, Math.min(long, wide) * 0.2)],
      colour,
      opacity,
      facing,
      glow: false,
      motion: MOTION.still,
      phase: 0,
    });
  };

  /** Splats per square metre over the party, which is seen close up. */
  const DENSITY = 380;

  /** Covers an ellipsoid's surface. */
  const ellipsoid = (centre: Vec3, radii: Vec3, colour: Vec3, vary = 0.18) => {
    const [a, b, c] = radii;
    const p = 1.6;
    const area = 4 * Math.PI * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p);
    const count = Math.max(6, Math.round(area * DENSITY));
    const size = Math.sqrt(area / count) * 0.8;
    for (let index = 0; index < count; index++) {
      const unit = direction();
      const facing = normalize([unit[0] / a, unit[1] / b, unit[2] / c]);
      patch(
        add(centre, times(radii, unit)),
        facing,
        direction(),
        [size * 1.25, size],
        shade(colour, vary),
        0.92,
      );
    }
  };

  /** Covers a tube that narrows from one end to the other; a radius of 0 makes a cone. */
  const tube = (
    from: Vec3,
    to: Vec3,
    [start, end]: [number, number],
    colour: Vec3,
    vary = 0.18,
  ) => {
    const axis = sub(to, from);
    const along = normalize(axis);
    const [first, second] = tangents(along, [0, 0, 1]);
    const area = Math.PI * (start + end) * length(axis) + Math.PI * start * start;
    const count = Math.max(6, Math.round(area * DENSITY));
    const size = Math.sqrt(area / count) * 0.8;
    for (let index = 0; index < count; index++) {
      const t = random();
      const angle = random() * Math.PI * 2;
      const radial = add(scale(first, Math.cos(angle)), scale(second, Math.sin(angle)));
      const radius = start + (end - start) * t;
      patch(
        add(add(from, scale(axis, t)), scale(radial, radius)),
        radial,
        along,
        [size * 1.5, size * 0.8],
        shade(colour, vary),
        0.92,
      );
    }
  };

  /** A splat that gives off light of its own. */
  const glow = (
    at: Vec3,
    size: Vec3 | number,
    colour: Vec3,
    opacity: number,
    {
      light,
      motion = MOTION.still,
      phase = 0,
    }: { light?: number; motion?: Motion; phase?: number } = {},
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
      glow: true,
      light,
      motion,
      phase,
    });
  };

  return { random, spread, pick, shade, patch, ellipsoid, tube, glow, splats };
}

type Sculptor = ReturnType<typeof sculptor>;

/** The tunnel's walls and roof, each splat a stroke following the rock's strata. */
function walls({ random, spread, pick, shade, patch }: Sculptor) {
  for (let index = 0; index < 60_000; index++) {
    const z = FAR + (NEAR - FAR) * random() ** 0.8;
    const { middle, halfWidth, height } = section(z);
    const angle = random() * Math.PI;
    const base: Vec3 = [middle + halfWidth * Math.cos(angle), height * Math.sin(angle) ** 0.8, z];
    const outward = normalize([base[0] - middle, base[1] - height * 0.3, 0]);
    const bulge =
      (fbm(scale(base, 0.45)) - 0.5) * 2.2 + (fbm(times(base, [1.8, 2.4, 1.2])) - 0.5) * 0.5;
    const at = add(base, scale(outward, bulge));
    if (at[1] < -0.1) continue;
    const facing = normalize(add(scale(outward, -1), [spread(0.35), spread(0.35), spread(0.35)]));
    const band = fbm([at[0] * 0.25, at[1] * 1.6 + fbm(scale(at, 0.6)) * 2, at[2] * 0.25]);
    const paint = WALL_PAINTS[Math.floor(band * WALL_PAINTS.length * 1.6) % WALL_PAINTS.length]!;
    const roof = 1 - 0.8 * (Math.max(0, at[1]) / height) ** 2;
    const size = 0.045 + random() * 0.07;
    patch(
      at,
      facing,
      [0, spread(0.25), 1],
      [size * (1.4 + random()), size * 0.6],
      scale(shade(random() < 0.15 ? pick(WALL_PAINTS) : paint, 0.25), roof),
      0.55 + random() * 0.4,
    );
  }
}

/** The floor between the feet of the walls, with loose stones on it. */
function floor({ random, spread, pick, shade, patch, ellipsoid }: Sculptor) {
  for (let index = 0; index < 22_000; index++) {
    const z = FAR + (NEAR - FAR) * random() ** 0.7;
    const { middle, halfWidth } = section(z);
    const x = middle + spread(halfWidth * 0.97);
    const at: Vec3 = [x, (fbm([x * 0.7, 0, z * 0.7]) - 0.5) * 0.22, z];
    const size = 0.05 + random() * 0.08;
    patch(
      at,
      normalize([spread(0.2), 1, spread(0.2)]),
      [spread(1), 0, spread(1)],
      [size * (1.2 + random()), size * 0.7],
      shade(pick(FLOOR_PAINTS), 0.3),
      0.6 + random() * 0.35,
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
      0.3,
    );
  }
}

/** Stalactites hanging from the roof near the walls, and stalagmites rising beside them. */
function spikes({ random, pick, tube }: Sculptor) {
  for (let index = 0; index < 22; index++) {
    const z = 0.5 - random() * 26;
    const { middle, halfWidth, height } = section(z);
    const side = random() < 0.5 ? -1 : 1;
    const angle = side > 0 ? 0.35 + random() * 0.55 : Math.PI - 0.35 - random() * 0.55;
    const root: Vec3 = [
      middle + halfWidth * Math.cos(angle) * 0.92,
      height * Math.sin(angle) ** 0.8 * 0.97,
      z,
    ];
    const long = 0.6 + random() * 1.8;
    tube(
      root,
      add(root, [(random() - 0.5) * 0.2, -long, 0]),
      [long * 0.14, 0.01],
      pick(WALL_PAINTS),
    );
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
const WOOD = hex("#5a3c22");
const LEATHER = hex("#6a4a2c");
const BRONZE = hex("#a07a3a");
const SKIN = hex("#c8a080");

/** A torch's flame, where it burns, and the light around it. */
function flame({ random, spread, glow }: Sculptor, at: Vec3, light: number, size: number) {
  for (let index = 0; index < 260; index++) {
    const radius = Math.sqrt(random()) * 0.055 * size;
    const angle = random() * Math.PI * 2;
    glow(
      add(at, [Math.cos(angle) * radius, random() * 0.03, Math.sin(angle) * radius]),
      [0.035 * size, 0.06 * size, 0.035 * size],
      [1.3, 1.3, 1.3],
      0.5,
      { light, motion: MOTION.flame, phase: random() },
    );
  }
  glow(add(at, [0, 0.08, 0]), 0.05 * size, [1.4, 1.1, 0.6], 0.9, { light });
  glow(add(at, [0, 0.14, 0]), 0.3 * size, scale(TORCHLIGHT, 0.08), 0.5, { light });
  glow(add(at, [0, 0.14, 0]), 0.9 * size, scale(TORCHLIGHT, 0.035), 0.35, { light });
  for (let index = 0; index < 14; index++) {
    glow(add(at, [spread(1.6), spread(0.8) - 0.3, spread(1.2)]), 0.012, [1, 0.75, 0.45], 0.6, {
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

/* The warrior: plate and a red cloak, a round shield and a greatsword slung behind, torch held high. */
function warrior(sculpt: Sculptor, origin: Vec3): Vec3 {
  const { ellipsoid, tube } = sculpt;
  const at = (p: Vec3) => add(origin, p);
  const cloak = hex("#6a1a1e");
  tube(at([-0.12, 0, 0]), at([-0.12, 0.9, 0]), [0.08, 0.1], DARK_STEEL);
  tube(at([0.12, 0, 0]), at([0.12, 0.9, 0]), [0.08, 0.1], DARK_STEEL);
  ellipsoid(at([0, 1.22, -0.02]), [0.27, 0.34, 0.17], STEEL);
  tube(at([0, 1.48, 0.06]), at([0, 0.16, 0.14]), [0.25, 0.43], cloak, 0.25);
  ellipsoid(at([-0.28, 1.47, 0]), [0.15, 0.1, 0.14], STEEL);
  ellipsoid(at([0.28, 1.47, 0]), [0.15, 0.1, 0.14], STEEL);
  ellipsoid(at([0, 1.71, 0]), [0.12, 0.15, 0.13], STEEL);
  tube(at([0, 1.86, -0.08]), at([0, 1.84, 0.12]), [0.03, 0.02], cloak);
  // The greatsword over the shoulder, and the shield on the back.
  tube(at([-0.3, 1.95, 0.16]), at([0.24, 0.55, 0.2]), [0.035, 0.02], STEEL, 0.1);
  tube(at([-0.38, 1.78, 0.17]), at([-0.16, 1.86, 0.17]), [0.025, 0.025], BRONZE);
  ellipsoid(at([0, 1.12, 0.26]), [0.34, 0.34, 0.05], WOOD);
  ellipsoid(at([0, 1.12, 0.31]), [0.07, 0.07, 0.04], BRONZE);
  for (let index = 0; index < 48; index++) {
    const angle = (index / 48) * Math.PI * 2;
    ellipsoid(
      at([Math.cos(angle) * 0.33, 1.12 + Math.sin(angle) * 0.33, 0.29]),
      [0.03, 0.03, 0.03],
      BRONZE,
    );
  }
  // The left arm hangs; the right holds the torch up.
  tube(at([-0.32, 1.42, 0]), at([-0.4, 0.9, 0.02]), [0.075, 0.06], STEEL);
  tube(at([0.32, 1.42, 0]), at([0.46, 1.74, -0.06]), [0.075, 0.065], STEEL);
  tube(at([0.46, 1.74, -0.06]), at([0.5, 2.02, -0.1]), [0.065, 0.055], STEEL);
  return torch(sculpt, at([0.5, 2.08, -0.1]), 0, 1.25);
}

/* The dwarf: short and broad, a great pack, a horned helm and an axe on the shoulder. */
function dwarf({ ellipsoid, tube }: Sculptor, origin: Vec3) {
  const at = (p: Vec3) => add(origin, p);
  const cloth = hex("#4a3424");
  tube(at([-0.14, 0, 0]), at([-0.14, 0.5, 0]), [0.1, 0.11], cloth);
  tube(at([0.14, 0, 0]), at([0.14, 0.5, 0]), [0.1, 0.11], cloth);
  ellipsoid(at([0, 0.78, 0]), [0.32, 0.36, 0.25], cloth);
  ellipsoid(at([0, 0.88, 0.24]), [0.29, 0.32, 0.17], LEATHER);
  tube(at([-0.31, 1.2, 0.22]), at([0.31, 1.2, 0.22]), [0.1, 0.1], hex("#5a5a3a"));
  tube(at([-0.12, 0.62, 0.42]), at([0.12, 0.62, 0.42]), [0.06, 0.06], hex("#2a2a2a"));
  ellipsoid(at([0, 1.2, -0.02]), [0.15, 0.14, 0.15], STEEL);
  for (const side of [-1, 1]) {
    tube(
      at([side * 0.13, 1.25, 0]),
      at([side * 0.24, 1.32, 0.01]),
      [0.035, 0.03],
      hex("#d8c8a0"),
      0.1,
    );
    tube(
      at([side * 0.24, 1.32, 0.01]),
      at([side * 0.28, 1.46, 0.02]),
      [0.03, 0.005],
      hex("#d8c8a0"),
      0.1,
    );
    tube(at([side * 0.33, 1.05, 0]), at([side * 0.36, 0.7, 0.02]), [0.08, 0.07], cloth);
  }
  tube(at([0.24, 0.95, 0.02]), at([0.42, 1.62, -0.06]), [0.025, 0.025], WOOD);
  ellipsoid(at([0.46, 1.54, -0.06]), [0.16, 0.11, 0.025], STEEL, 0.1);
}

/* The ranger: a green hooded cloak, a quiver and a bow, and the second torch. */
function ranger(sculpt: Sculptor, origin: Vec3): Vec3 {
  const { ellipsoid, tube, glow } = sculpt;
  const at = (p: Vec3) => add(origin, p);
  const cloak = hex("#2a4430");
  tube(at([-0.1, 0, 0]), at([-0.1, 0.9, 0]), [0.07, 0.09], hex("#3a3024"));
  tube(at([0.1, 0, 0]), at([0.1, 0.9, 0]), [0.07, 0.09], hex("#3a3024"));
  tube(at([0, 1.5, 0.02]), at([0, 0.14, 0.06]), [0.22, 0.36], cloak, 0.25);
  ellipsoid(at([0, 1.66, 0]), [0.14, 0.17, 0.15], cloak);
  tube(at([0, 1.76, 0.06]), at([0, 1.62, 0.2]), [0.06, 0.01], cloak);
  tube(at([0.2, 1.62, 0.2]), at([-0.14, 0.86, 0.22]), [0.07, 0.06], LEATHER);
  for (let index = 0; index < 5; index++) {
    glow(
      at([0.16 + index * 0.025, 1.68 + (index % 2) * 0.02, 0.2]),
      [0.012, 0.03, 0.012],
      [0.35, 0.33, 0.3],
      0.8,
    );
  }
  for (let index = 0; index <= 20; index++) {
    const t = index / 20;
    const y = 0.75 + t * 1.15;
    ellipsoid(at([-0.2 + Math.sin(t * Math.PI) * 0.12, y, 0.24]), [0.022, 0.04, 0.022], WOOD, 0.1);
  }
  tube(at([0.24, 1.42, 0]), at([0.28, 0.95, 0.02]), [0.065, 0.055], cloak);
  tube(at([-0.24, 1.42, 0]), at([-0.38, 1.72, -0.05]), [0.065, 0.055], cloak);
  tube(at([-0.38, 1.72, -0.05]), at([-0.4, 1.95, -0.08]), [0.055, 0.05], cloak);
  return torch(sculpt, at([-0.4, 2, -0.08]), 1, 1.05);
}

/* The wizard: a starry blue robe and a tall hat, a staff, and a hand held up to the wisp. */
function wizard(sculpt: Sculptor, origin: Vec3): Vec3 {
  const { random, ellipsoid, tube, glow } = sculpt;
  const at = (p: Vec3) => add(origin, p);
  const robe = hex("#252c60");
  tube(at([0, 1.45, 0]), at([0, 0.02, 0.05]), [0.22, 0.5], robe, 0.22);
  ellipsoid(at([0, 1.5, 0]), [0.24, 0.14, 0.17], robe);
  ellipsoid(at([0, 1.64, 0]), [0.12, 0.13, 0.12], hex("#b8b0a8"));
  ellipsoid(at([0, 1.79, 0]), [0.38, 0.035, 0.36], robe);
  tube(at([0, 1.8, 0]), at([0.1, 2.2, 0.03]), [0.17, 0.08], robe);
  tube(at([0.1, 2.2, 0.03]), at([0.24, 2.4, 0.08]), [0.08, 0.005], robe);
  for (let index = 0; index < 34; index++) {
    const height = 0.15 + random() * 1.25;
    const radius = 0.22 + (0.28 * (1.45 - height)) / 1.45;
    const angle = (random() - 0.5) * Math.PI * 1.2 + Math.PI / 2;
    glow(
      at([Math.cos(angle) * radius, height, Math.sin(angle) * radius + 0.04]),
      0.008,
      [1.1, 0.9, 0.5],
      0.8,
    );
  }
  tube(at([0.28, 1.42, 0]), at([0.36, 1.05, -0.05]), [0.08, 0.07], robe);
  tube(at([0.38, 0, -0.08]), at([0.4, 2.1, -0.1]), [0.03, 0.03], WOOD);
  ellipsoid(at([0.4, 2.12, -0.1]), [0.06, 0.07, 0.06], WOOD);
  tube(at([-0.26, 1.44, 0]), at([-0.48, 1.68, -0.1]), [0.08, 0.07], robe);
  tube(at([-0.48, 1.68, -0.1]), at([-0.6, 1.92, -0.2]), [0.07, 0.06], robe);
  ellipsoid(at([-0.62, 1.98, -0.22]), [0.05, 0.07, 0.04], SKIN);
  return at([-0.78, 2.3, -0.4]);
}

/** The wizard's wisp: a bright core in a blue haze, with sparks circling it. */
function wisp({ random, glow }: Sculptor, at: Vec3) {
  const light = 2;
  glow(at, 0.04, [2, 2, 2], 1, { light });
  glow(at, 0.1, [0.6, 0.85, 1.4], 0.8, { light });
  glow(at, 0.32, scale(WISPLIGHT, 0.12), 0.5, { light });
  glow(at, 0.8, scale(WISPLIGHT, 0.04), 0.4, { light });
  for (let index = 0; index < 5; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.16 + random() * 0.12;
    glow(
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

export function buildCave(): Cave {
  const sculpt = sculptor("the lost barrows");
  walls(sculpt);
  floor(sculpt);
  spikes(sculpt);
  const warriorTorch = warrior(sculpt, [-2.9, 0, -1.6]);
  dwarf(sculpt, [-1.35, 0, -0.1]);
  const rangerTorch = ranger(sculpt, [2.2, 0, -3.8]);
  const wispAt = wizard(sculpt, [3.05, 0, -1.3]);
  wisp(sculpt, wispAt);
  return {
    splats: sculpt.splats,
    lights: [
      { at: warriorTorch, colour: TORCHLIGHT, reach: 6, period: 3.7, wander: 0 },
      { at: rangerTorch, colour: scale(TORCHLIGHT, 0.85), reach: 5.5, period: 4.6, wander: 0 },
      { at: wispAt, colour: WISPLIGHT, reach: 4, period: 2.9, wander: 0.09 },
    ],
    party: ["warrior", "dwarf", "ranger", "wizard"],
  };
}
