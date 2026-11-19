import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  MeshPhysicalMaterial,
  PointLight,
  SphereGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { kit, part, place } from "../kit";
import { fit, outline, relief } from "../forms";
import { glow, lathe } from "./core";
import { cloud } from "./props";

/* Canvas tools and scene effects. */

export const select = () =>
  place(relief(outline("gi:arrow-cursor"), kit.enamel(0xf4efe4), 0.25), [0, 0, 0], [0, 0, 0]);

export const pan = () =>
  place(relief(outline("gi:hand"), kit.steel(), 0.28, 0.06), [0, 0, 0], [0, 0, 0]);

export function eraser() {
  const group = new Group();
  group.add(part(new RoundedBoxGeometry(1.8, 0.75, 0.8, 3, 0.14), kit.lacquer(0xe27d92)));
  group.add(
    place(
      part(new RoundedBoxGeometry(0.95, 0.8, 0.85, 2, 0.04), kit.matte(0x2f63b0, 0.6)),
      [0.45, 0, 0],
    ),
  );
  group.rotation.set(0.25, 0, 0.35);
  return new Group().add(group);
}

export function shapes() {
  const group = new Group();
  group.add(
    place(
      part(new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.06), kit.enamel(0x2f6fc2)),
      [-0.55, -0.35, 0],
      [0.4, 0.6, 0],
    ),
  );
  group.add(place(part(new SphereGeometry(0.5, 32, 24), kit.enamel(0xc0392b)), [0.6, -0.4, 0.2]));
  group.add(
    place(part(new ConeGeometry(0.55, 1, 4), kit.gold()), [0.05, 0.55, -0.2], [0.1, 0.5, 0]),
  );
  return group;
}

const glyph =
  (id: Parameters<typeof outline>[0], material = kit.gold()) =>
  () =>
    place(relief(outline(id), material, 0.3, 0.06), [0, 0, 0], [0, 0, 0]);

export const text = glyph("ms:title-rounded");
export const bold = glyph("ms:format-bold", kit.steel());
export const italic = glyph("ms:format-italic", kit.steel());

/** A pair of steel dividers, hinged in gold. */
export function measure() {
  const group = new Group();
  const steel = kit.steel();
  for (const side of [-1, 1]) {
    const leg = new Group();
    leg.add(place(part(new CylinderGeometry(0.13, 0.03, 2, 12), steel), [0, -1, 0]));
    leg.rotation.z = side * 0.32;
    group.add(leg);
  }
  group.add(
    place(
      part(new CylinderGeometry(0.2, 0.2, 0.16, 24), kit.gold()),
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  group.add(place(part(new CylinderGeometry(0.05, 0.07, 0.35, 12), kit.gold()), [0, 0.3, 0]));
  return new Group().add(group);
}

export function wall() {
  const group = new Group();
  let seed = 16;
  for (let row = 0; row < 3; row++) {
    const offset = row % 2 ? 0.4 : 0;
    for (let col = -1; col < 2; col++) {
      const x = col * 0.82 + offset;
      if (Math.abs(x) > 1.1) continue;
      const brick = part(new RoundedBoxGeometry(0.76, 0.5, 0.6, 2, 0.08), kit.stone(seed++));
      group.add(place(brick, [x, row * 0.55 - 0.55, 0], [0, 0, (seed % 3) * 0.02 - 0.02]));
    }
  }
  return new Group().add(group);
}

/** A seer's crystal ball on a gold stand. */
export function effects() {
  const group = new Group();
  const ball = part(
    new SphereGeometry(0.8, 48, 32),
    new MeshPhysicalMaterial({
      color: 0x2aa6b8,
      emissive: 0x1a8fa8,
      emissiveIntensity: 0.35,
      roughness: 0.05,
      clearcoat: 1,
    }),
  );
  group.add(place(ball, [0, 0.95, 0]));
  group.add(place(glow(0.35, 0x9ff6ff, 0.6), [-0.1, 1.05, 0.4]));
  group.add(
    part(
      lathe([
        [0, 0],
        [0.7, 0],
        [0.72, 0.08],
        [0.55, 0.16],
        [0.42, 0.32],
        [0.5, 0.42],
        [0, 0.42],
      ]),
      kit.gold(),
    ),
  );
  return group;
}

function drop() {
  return part(
    lathe([
      [0, 0],
      [0.14, 0.04],
      [0.19, 0.15],
      [0.14, 0.27],
      [0.06, 0.38],
      [0, 0.48],
    ]),
    kit.enamel(0x3a8be0),
  );
}

export function rain() {
  const group = new Group().add(place(cloud(0x7d8ea8), [0, 0.4, 0]));
  for (const [x, y] of [
    [-0.55, -0.55],
    [0.05, -0.8],
    [0.6, -0.55],
  ] as const)
    group.add(place(drop(), [x, y, 0.2], [0, 0, 0.2]));
  return group;
}

export const snow = () =>
  place(
    relief(
      outline("ms:ac-unit-rounded"),
      new MeshPhysicalMaterial({
        color: 0xcfeaff,
        roughness: 0.12,
        clearcoat: 1,
        emissive: 0x6fb4ff,
        emissiveIntensity: 0.15,
      }),
      0.22,
      0.05,
    ),
    [0, 0, 0],
    [0.1, 0.35, 0],
  );

export function fog() {
  const group = new Group();
  const material = kit.matte(0xa9b6c8, 0.95);
  for (const [y, w, x] of [
    [0.55, 1.6, -0.2],
    [0, 2, 0.15],
    [-0.55, 1.4, -0.1],
  ] as const) {
    const band = part(new SphereGeometry(0.5, 32, 16), material);
    band.scale.set(w, 0.42, 0.5);
    group.add(place(band, [x, y, 0]));
  }
  return group;
}

/** A heap of coals glowing through cracks of black. */
export function embers() {
  const group = new Group();
  const coal = kit.blackIron();
  const hot = new MeshPhysicalMaterial({
    color: 0x5a1400,
    emissive: 0xff4a00,
    emissiveIntensity: 0.9,
    roughness: 0.8,
  });
  const pieces: [number, number, number, number, boolean][] = [
    [-0.6, -0.35, 0, 0.45, false],
    [0.1, -0.4, 0.15, 0.5, true],
    [0.75, -0.35, -0.05, 0.4, false],
    [-0.25, 0.15, 0, 0.42, true],
    [0.4, 0.12, -0.05, 0.38, false],
    [0.05, 0.55, -0.1, 0.32, true],
  ];
  for (const [x, y, z, r, glowing] of pieces) {
    const lump = part(new IcosahedronGeometry(r, 1), glowing ? hot : coal);
    lump.scale.set(1.15, 0.85, 1);
    group.add(place(lump, [x, y, z], [x * 3, y * 2, 0]));
  }
  group.add(place(glow(0.7, 0xff7a20, 0.35), [0.05, 0, 0.2]));
  const light = new PointLight(0xff7a30, 6, 4, 1.5);
  group.add(place(light, [0, 0.3, 0.8]));
  return group;
}

/** A dark wand bound in gold, a pink star blazing at its tip. */
export function magic() {
  const group = new Group();
  const wand = part(new CylinderGeometry(0.1, 0.15, 2.1, 12), kit.matte(0x3b2a20, 0.5));
  group.add(place(wand, [0, 0, 0]));
  for (const y of [-0.55, -0.7])
    group.add(place(part(new CylinderGeometry(0.11, 0.11, 0.06, 16), kit.gold()), [0, y, 0]));
  const star = relief(
    outline("ms:star-rounded"),
    new MeshPhysicalMaterial({
      color: 0xff7ad0,
      emissive: 0xff4fb8,
      emissiveIntensity: 0.6,
      clearcoat: 1,
      roughness: 0.2,
    }),
    0.18,
    0.04,
  );
  star.scale.setScalar(0.48);
  group.add(place(star, [0, 1.15, 0.12], [0, 0, -0.65]));
  group.add(place(glow(0.4, 0xff9ce0, 0.5), [0, 1.15, 0.1]));
  group.rotation.z = -0.65;
  return fit(new Group().add(group));
}
