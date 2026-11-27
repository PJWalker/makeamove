import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { drawnTexture, kit, part, place } from "../kit";
import { outline, relief } from "../forms";
import { glow, lathe, TAU } from "./shared";

/*
 * Library entries: the gear, classes, moves and tags that systems name.
 * Each faces the viewer; long things lie on the diagonal to fill the square.
 */

const diagonal = (object: Object3D, angle = -Math.PI / 4) => {
  const group = new Group().add(object);
  group.rotation.z = angle;
  return group;
};

function extrude(shape: Shape, depth: number, material: Material, bevel = 0.03) {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -depth / 2);
  return part(geometry, material);
}

/** A blade from its base at y = 0 to its point at `length`. */
function blade(length: number, width: number, { leaf = 0, material = kit.steel() } = {}) {
  const shape = new Shape();
  const w = width / 2;
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.quadraticCurveTo(w * (1 + leaf), length * 0.55, w * 0.7, length * 0.85);
  shape.lineTo(0, length);
  shape.lineTo(-w * 0.7, length * 0.85);
  shape.quadraticCurveTo(-w * (1 + leaf), length * 0.55, -w, 0);
  const mesh = extrude(shape, 0.04, material, 0.035);
  // A fuller down the middle catches the light.
  const fuller = part(
    new RoundedBoxGeometry(width * 0.18, length * 0.7, 0.03, 1, 0.01),
    kit.iron(),
  );
  return new Group().add(mesh, place(fuller, [0, length * 0.38, 0.05]));
}

interface Hilt {
  guard: number;
  grip: number;
  guardMaterial?: Material;
  gripMaterial?: Material;
}

/** Crossguard, wrapped grip and pommel, hanging below y = 0. */
function hilt({
  guard,
  grip,
  guardMaterial = kit.gold(),
  gripMaterial = kit.leather("#5a2a14", 83),
}: Hilt) {
  const group = new Group();
  group.add(
    place(part(new RoundedBoxGeometry(guard, 0.14, 0.16, 2, 0.05), guardMaterial), [0, -0.05, 0]),
  );
  group.add(
    place(part(new CylinderGeometry(0.075, 0.075, grip, 12), gripMaterial), [
      0,
      -0.1 - grip / 2,
      0,
    ]),
  );
  group.add(place(part(new SphereGeometry(0.13, 16, 12), guardMaterial), [0, -0.15 - grip, 0]));
  return group;
}

function sword(length: number, width: number, h: Hilt, leaf = 0) {
  return diagonal(new Group().add(blade(length, width, { leaf }), hilt(h)));
}

function haft(length: number, material: Material = kit.oak(12), radius = 0.12) {
  return place(part(new CylinderGeometry(radius, radius, length, 12), material), [
    0,
    length / 2,
    0,
  ]);
}

/* Gear */

export function rations() {
  const group = new Group();
  const meat = part(new SphereGeometry(0.7, 32, 24), kit.lacquer(0xa0_48_2a));
  meat.scale.set(1.15, 0.9, 0.8);
  group.add(place(meat, [-0.25, 0.2, 0]));
  const bone = kit.ivory();
  group.add(
    place(part(new CylinderGeometry(0.12, 0.12, 1, 12), bone), [0.55, -0.45, 0], [0, 0, 0.9]),
  );
  for (const [x, y] of [
    [0.88, -0.86],
    [1.04, -0.66],
  ] as const)
    group.add(place(part(new SphereGeometry(0.15, 16, 12), bone), [x, y, 0]));
  return diagonal(group, 0.35);
}

export function gear() {
  const group = new Group();
  const rope = new MeshPhysicalMaterial({
    map: drawnTexture(64, 64, 18, (context, _r, w, h) => {
      context.fillStyle = "#c9a46a";
      context.fillRect(0, 0, w, h);
      context.strokeStyle = "rgba(90,60,25,0.6)";
      context.lineWidth = 6;
      for (let x = -h; x < w; x += 16) {
        context.beginPath();
        context.moveTo(x, h);
        context.lineTo(x + h, 0);
        context.stroke();
      }
    }),
    roughness: 0.9,
  });
  rope.map!.repeat.set(12, 1);
  for (const [y, r] of [
    [-0.35, 0.8],
    [0, 0.76],
    [0.35, 0.7],
  ] as const) {
    const coil = part(new TorusGeometry(r, 0.17, 12, 48), rope);
    coil.scale.y = 0.45;
    group.add(place(coil, [0, y, 0], [Math.PI / 2 - 0.35, 0, 0]));
  }
  return group;
}

export function potion() {
  const group = new Group();
  const glass = new MeshPhysicalMaterial({
    color: 0xe8_f4_ff,
    roughness: 0.05,
    transparent: true,
    opacity: 0.35,
    clearcoat: 1,
    depthWrite: false,
  });
  group.add(
    new Group().add(
      part(
        lathe([
          [0, 0],
          [0.5, 0.05],
          [0.72, 0.55],
          [0.6, 1],
          [0.2, 1.2],
          [0.18, 1.6],
          [0.24, 1.65],
          [0, 1.65],
        ]),
        glass,
      ),
    ),
  );
  const liquid = part(
    new SphereGeometry(0.62, 32, 24),
    new MeshPhysicalMaterial({
      color: 0xd0_26_3a,
      emissive: 0x80_10_1e,
      emissiveIntensity: 0.4,
      clearcoat: 1,
      roughness: 0.15,
    }),
  );
  liquid.scale.y = 0.85;
  group.add(place(liquid, [0, 0.56, 0]));
  group.add(place(part(new CylinderGeometry(0.17, 0.15, 0.3, 12), kit.oak(13)), [0, 1.72, 0]));
  group.add(
    place(part(new TorusGeometry(0.2, 0.04, 8, 24), kit.gold()), [0, 1.3, 0], [Math.PI / 2, 0, 0]),
  );
  return group;
}

function leaf(colour: number, length = 1, width = 0.4) {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, length * 0.45, 0, length);
  shape.quadraticCurveTo(-width, length * 0.45, 0, 0);
  return extrude(shape, 0.03, kit.lacquer(colour), 0.02);
}

export function herbs() {
  const group = new Group();
  const stems = kit.matte(0x5d_7a_2e, 0.8);
  for (const [angle, colour] of [
    [-0.4, 0x4f_9a_3a],
    [0, 0x3f_8a_32],
    [0.4, 0x5f_a8_48],
  ] as const) {
    const sprig = new Group();
    sprig.add(place(part(new CylinderGeometry(0.03, 0.03, 1.4, 8), stems), [0, 0.2, 0]));
    for (const [y, side] of [
      [0.4, 1],
      [0.65, -1],
      [0.9, 1],
    ] as const)
      sprig.add(place(leaf(colour, 0.55, 0.22), [0, y, 0.02], [0, 0, side * -0.7]));
    sprig.add(place(leaf(colour, 0.5, 0.2), [0, 0.9, 0.03]));
    group.add(place(sprig, [0, -0.3, 0], [0, 0, angle]));
  }
  group.add(
    place(
      part(new TorusGeometry(0.13, 0.05, 8, 20), kit.lacquer(0xa3_20_1a)),
      [0, -0.5, 0.05],
      [Math.PI / 2, 0, 0],
    ),
  );
  return group;
}

export function poultice() {
  const group = new Group();
  const linen = kit.matte(0xdc_d2_b8, 0.9);
  group.add(
    part(
      lathe([
        [0, 0],
        [0.6, 0.05],
        [0.78, 0.45],
        [0.6, 0.95],
        [0.2, 1.15],
        [0.3, 1.45],
        [0.12, 1.5],
        [0, 1.45],
      ]),
      linen,
    ),
  );
  group.add(
    place(
      part(new TorusGeometry(0.22, 0.06, 8, 24), kit.lacquer(0xa3_20_1a)),
      [0, 1.05, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  group.add(place(leaf(0x4f_9a_3a, 0.7, 0.3), [0.15, 1.15, 0.2], [0, 0, -0.5]));
  return group;
}

export function books() {
  const group = new Group();
  for (const [y, colour, w, shift] of [
    [-0.55, "#2c4fa8", 1.9, 0],
    [-0.05, "#a3201a", 1.7, 0.1],
    [0.42, "#2f8a4a", 1.5, -0.1],
  ] as const) {
    group.add(
      place(part(new RoundedBoxGeometry(w, 0.45, 1.2, 2, 0.06), kit.leather(colour, y * 10 + 50)), [
        shift,
        y,
        0,
      ]),
    );
    group.add(
      place(
        part(new RoundedBoxGeometry(w - 0.1, 0.36, 0.05, 1, 0.01), kit.parchment(undefined, 3)),
        [shift + 0.05, y, 0.6],
      ),
    );
  }
  group.rotation.x = 0.25;
  return new Group().add(group);
}

export const dagger = () =>
  sword(0.95, 0.34, {
    guard: 0.55,
    grip: 0.45,
    guardMaterial: kit.brass(),
    gripMaterial: kit.matte(0x2b_1d_17, 0.5),
  });
export const shortSword = () => sword(1.35, 0.42, { guard: 0.7, grip: 0.45 }, 0.2);
export const longsword = () =>
  sword(1.8, 0.32, { guard: 0.95, grip: 0.55, guardMaterial: kit.steel() });

export function axe() {
  const group = new Group().add(haft(2.2));
  const head = new Shape();
  head.moveTo(0, -0.12);
  head.quadraticCurveTo(0.35, -0.15, 0.65, -0.5);
  head.quadraticCurveTo(0.9, 0, 0.65, 0.5);
  head.quadraticCurveTo(0.35, 0.15, 0, 0.12);
  for (const side of [1, -1]) {
    const blade = extrude(head, 0.1, kit.steel(), 0.03);
    blade.scale.x = side;
    group.add(place(blade, [0, 1.75, 0]));
  }
  group.add(
    place(part(new RoundedBoxGeometry(0.22, 0.4, 0.2, 2, 0.04), kit.blackIron()), [0, 1.75, 0]),
  );
  return diagonal(group, Math.PI / 6);
}

export function spear() {
  const group = new Group().add(haft(1.9, kit.oak(14)));
  group.add(place(blade(0.8, 0.42, { leaf: 0.5 }), [0, 1.85, 0]));
  group.add(
    place(
      part(new ConeGeometry(0.14, 0.35, 12), kit.lacquer(0xa3_20_1a)),
      [0, 1.78, 0],
      [Math.PI, 0, 0],
    ),
  );
  return diagonal(group);
}

export function polearm() {
  const group = new Group().add(haft(2, kit.oak(15)));
  const axeHead = new Shape();
  axeHead.moveTo(0, -0.25);
  axeHead.lineTo(0.55, -0.45);
  axeHead.quadraticCurveTo(0.7, 0, 0.55, 0.35);
  axeHead.lineTo(0, 0.15);
  group.add(place(extrude(axeHead, 0.08, kit.steel(), 0.03), [0.06, 1.6, 0]));
  const hook = new Shape();
  hook.moveTo(0, -0.08);
  hook.lineTo(-0.4, 0.1);
  hook.lineTo(0, 0.08);
  group.add(place(extrude(hook, 0.06, kit.steel(), 0.02), [-0.06, 1.6, 0]));
  group.add(place(blade(0.55, 0.24), [0, 1.95, 0]));
  return diagonal(group);
}

export function rapier() {
  const group = new Group().add(blade(1.8, 0.16));
  group.add(
    place(part(new RoundedBoxGeometry(0.7, 0.08, 0.1, 1, 0.03), kit.gold()), [0, -0.04, 0]),
  );
  group.add(
    place(
      part(new TorusGeometry(0.3, 0.035, 8, 32, Math.PI * 1.2), kit.gold()),
      [0.05, -0.25, 0],
      [0, 0, Math.PI * 0.95],
    ),
  );
  group.add(
    place(
      part(new CylinderGeometry(0.06, 0.06, 0.45, 10), kit.matte(0x2b_1d_17, 0.5)),
      [0, -0.32, 0],
    ),
  );
  group.add(place(part(new SphereGeometry(0.11, 16, 12), kit.gold()), [0, -0.6, 0]));
  return diagonal(group);
}

function arc(radius: number, angle: number, thickness: number, material: Material) {
  const points: Vector3[] = [];
  for (let index = 0; index <= 24; index++) {
    const a = -angle / 2 + (angle * index) / 24;
    points.push(new Vector3(-Math.cos(a) * radius + radius, Math.sin(a) * radius, 0));
  }
  return part(new TubeGeometry(new CatmullRomCurve3(points), 48, thickness, 10), material);
}

export function bow() {
  const group = new Group();
  group.add(place(arc(1.4, 1.65, 0.11, kit.oak(16)), [0, 0, 0]));
  const tip = Math.sin(0.825) * 1.4;
  const x = -Math.cos(0.825) * 1.4 + 1.4;
  group.add(place(part(new CylinderGeometry(0.025, 0.025, tip * 2, 6), kit.ivory()), [x, 0, 0]));
  group.add(
    place(part(new CylinderGeometry(0.1, 0.1, 0.4, 12), kit.leather("#6a3b1c", 84)), [0, 0, 0]),
  );
  return diagonal(group, -Math.PI / 4 + Math.PI);
}

function arrow() {
  const group = new Group();
  group.add(haft(1.8, kit.oak(17), 0.07));
  group.add(place(part(new ConeGeometry(0.16, 0.36, 4), kit.steel()), [0, 1.92, 0]));
  const fletch = new Shape();
  fletch.moveTo(0, 0);
  fletch.lineTo(0.22, 0.1);
  fletch.lineTo(0.22, 0.5);
  fletch.lineTo(0, 0.32);
  for (const side of [1, -1]) {
    const vane = extrude(fletch, 0.01, kit.lacquer(0xa3_20_1a), 0);
    vane.scale.x = side;
    group.add(place(vane, [0, 0.05, 0]));
  }
  return group;
}

export function arrows() {
  const group = new Group();
  for (const [x, angle] of [
    [-0.25, 0.2],
    [0, 0],
    [0.25, -0.2],
  ] as const)
    group.add(place(arrow(), [x, -0.9, 0], [0, 0, angle]));
  return diagonal(group);
}

const armour = (id: Parameters<typeof outline>[0], material: Material) => () =>
  relief(outline(id), material, 0.35, 0.08);

export const chainmail = armour("gi:chain-mail", kit.steel());
export const scaleArmor = armour("gi:scale-mail", kit.verdigris());
export const leatherArmor = armour("gi:leather-armor", kit.leather("#7a4320", 85));
export const breastplate = armour("gi:breastplate", kit.steel());
export const gauntlet = armour("gi:gauntlet", kit.steel());
export const holySymbol = armour("gi:holy-symbol", kit.gold());
export const lockpicks = armour("gi:lockpicks", kit.steel());

export function cloak() {
  const group = new Group().add(armour("gi:cloak", kit.leather("#24603e", 86))());
  group.add(place(part(new SphereGeometry(0.14, 16, 12), kit.gold()), [0, 0.45, 0.2]));
  return group;
}

/** A round wooden shield painted blue, bossed and rimmed in steel. */
export function shield() {
  const group = new Group();
  const face = part(new CylinderGeometry(1, 1, 0.16, 48), [
    kit.oak(19),
    kit.lacquer(0x2c_4f_a8),
    kit.oak(19),
  ]);
  face.rotation.x = Math.PI / 2;
  group.add(face);
  group.add(place(part(new TorusGeometry(1, 0.08, 12, 48), kit.steel()), [0, 0, 0.04]));
  const boss = part(new SphereGeometry(0.3, 24, 16, 0, TAU, 0, Math.PI / 2), kit.steel());
  group.add(place(boss, [0, 0, 0.08], [Math.PI / 2, 0, 0]));
  for (let index = 0; index < 8; index++) {
    const a = (index / 8) * TAU;
    group.add(
      place(part(new SphereGeometry(0.06, 10, 8), kit.gold()), [
        Math.cos(a) * 0.82,
        Math.sin(a) * 0.82,
        0.1,
      ]),
    );
  }
  return group;
}

/** A closed tome in violet leather, a gold star on its cover. */
export function spellbook() {
  const group = new Group();
  group.add(part(new RoundedBoxGeometry(1.5, 1.9, 0.4, 2, 0.06), kit.leather("#4a2280", 87)));
  group.add(
    place(
      part(new RoundedBoxGeometry(1.36, 1.8, 0.34, 1, 0.02), kit.parchment(undefined, 4)),
      [0.1, 0, 0],
    ),
  );
  const star = relief(outline("ms:star-rounded"), kit.gold(), 0.06, 0.02);
  star.scale.setScalar(0.5);
  group.add(place(star, [0, 0.05, 0.24]));
  group.add(place(part(new RoundedBoxGeometry(0.3, 0.3, 0.48, 2, 0.04), kit.gold()), [0.72, 0, 0]));
  return group;
}

/** A drawstring sack of brown leather. */
export function bag() {
  const group = new Group();
  group.add(
    part(
      lathe([
        [0, 0],
        [0.75, 0.08],
        [0.92, 0.55],
        [0.75, 1.1],
        [0.32, 1.35],
        [0.42, 1.62],
        [0.2, 1.7],
        [0, 1.65],
      ]),
      kit.leather("#8a5228", 88),
    ),
  );
  group.add(
    place(
      part(new TorusGeometry(0.32, 0.06, 8, 24), kit.lacquer(0xc8_a0_50)),
      [0, 1.33, 0],
      [Math.PI / 2 - 0.2, 0, 0],
    ),
  );
  return group;
}

export function mace() {
  const group = new Group().add(haft(1.3, kit.leather("#5a2a14", 89)));
  const steel = kit.steel();
  group.add(place(part(new SphereGeometry(0.4, 24, 16), steel), [0, 1.5, 0]));
  for (let index = 0; index < 6; index++) {
    const flange = part(new RoundedBoxGeometry(0.12, 0.8, 0.42, 1, 0.03), steel);
    group.add(
      place(
        flange,
        [Math.cos((index / 6) * TAU) * 0.3, 1.5, Math.sin((index / 6) * TAU) * 0.3],
        [0, -(index / 6) * TAU, 0],
      ),
    );
  }
  return diagonal(group);
}

function spikedBall(radius: number) {
  const group = new Group().add(part(new SphereGeometry(radius, 24, 16), kit.blackIron()));
  const spikes = new SphereGeometry(1, 4, 3).getAttribute("position");
  const steel = kit.steel();
  for (let index = 0; index < spikes.count; index++) {
    const dir = new Vector3().fromBufferAttribute(spikes, index).normalize();
    const spike = part(new ConeGeometry(radius * 0.25, radius * 0.6, 8), steel);
    spike.position.copy(dir).multiplyScalar(radius * 1.15);
    spike.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    group.add(spike);
  }
  return group;
}

export function flail() {
  const group = new Group().add(haft(1.1, kit.oak(20)));
  const iron = kit.iron();
  for (let index = 0; index < 4; index++) {
    const link = part(new TorusGeometry(0.11, 0.045, 6, 16), iron);
    group.add(
      place(
        link,
        [0.1 + index * 0.12, 1.2 + index * 0.1, 0],
        [0, ((index % 2) * Math.PI) / 2, 0.8],
      ),
    );
  }
  group.add(place(spikedBall(0.48), [0.85, 1.85, 0]));
  return diagonal(group, Math.PI / 8);
}

export function hammer() {
  const group = new Group().add(haft(1.7, kit.oak(21)));
  group.add(
    place(part(new RoundedBoxGeometry(0.9, 0.55, 0.5, 2, 0.06), kit.steel()), [0.15, 1.6, 0]),
  );
  group.add(
    place(part(new ConeGeometry(0.17, 0.5, 8), kit.steel()), [-0.5, 1.6, 0], [0, 0, Math.PI / 2]),
  );
  return diagonal(group, Math.PI / 6);
}

/** A gnarled staff holding a glowing blue crystal. */
export function staff() {
  const group = new Group();
  const shaft = new TubeGeometry(
    new CatmullRomCurve3([
      new Vector3(0, -1.3, 0),
      new Vector3(0.06, -0.3, 0),
      new Vector3(-0.05, 0.6, 0),
      new Vector3(0.05, 1.1, 0),
    ]),
    24,
    0.13,
    8,
  );
  group.add(part(shaft, kit.oak(22)));
  const crystal = part(
    new ConeGeometry(0.28, 0.7, 6),
    new MeshPhysicalMaterial({
      color: 0x5f_b8_ff,
      emissive: 0x2f_80_ff,
      emissiveIntensity: 0.6,
      clearcoat: 1,
      roughness: 0.1,
    }),
  );
  group.add(place(crystal, [0.05, 1.45, 0]));
  group.add(place(glow(0.4, 0x8f_d0_ff, 0.5), [0.05, 1.4, 0.1]));
  for (const side of [-1, 1])
    group.add(
      place(
        part(new TorusGeometry(0.2, 0.04, 6, 16, Math.PI), kit.oak(23)),
        [0.05, 1.15, 0],
        [0, side * 0.6, 0],
      ),
    );
  return diagonal(group, -Math.PI / 6);
}

export function crossbow() {
  const group = new Group();
  group.add(place(part(new RoundedBoxGeometry(0.34, 2, 0.3, 2, 0.06), kit.oak(24)), [0, -0.2, 0]));
  group.add(place(arc(1.2, 1.6, 0.1, kit.steel()), [0, 0.65, 0], [0, 0, -Math.PI / 2]));
  const span = Math.sin(0.8) * 1.2 * 2;
  const drop = -Math.cos(0.8) * 1.2 + 1.2;
  group.add(
    place(
      part(new CylinderGeometry(0.025, 0.025, span, 6), kit.ivory()),
      [0, 0.65 - drop, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  group.add(
    place(
      part(new RoundedBoxGeometry(0.08, 0.3, 0.08, 1, 0.02), kit.blackIron()),
      [0, -0.75, 0.12],
    ),
  );
  return group;
}

/** A torch: its wrapped head blazing. */
export function torch() {
  const group = new Group();
  group.add(place(part(new CylinderGeometry(0.1, 0.07, 1.6, 10), kit.oak(25)), [0, -0.5, 0]));
  group.add(
    place(part(new CylinderGeometry(0.2, 0.15, 0.4, 12), kit.matte(0x5a_46_30, 0.95)), [0, 0.4, 0]),
  );
  const flame = part(
    lathe([
      [0, 0],
      [0.28, 0.1],
      [0.22, 0.45],
      [0.08, 0.8],
      [0, 0.95],
    ]),
    new MeshPhysicalMaterial({ color: 0xff_a0_20, emissive: 0xff_7a_10, emissiveIntensity: 1.1 }),
  );
  group.add(place(flame, [0, 0.55, 0]));
  group.add(place(glow(0.5, 0xff_a0_40, 0.45), [0, 0.95, 0.1]));
  group.add(place(new PointLight(0xff_a0_40, 5, 3, 1.5), [0, 0.9, 0.5]));
  return diagonal(group, -Math.PI / 8);
}

/** A slender ivory wand tipped with a blue crystal. */
export function wand() {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.09, 0.14, 1.7, 12), kit.ivory()));
  group.add(place(part(new CylinderGeometry(0.1, 0.1, 0.1, 12), kit.gold()), [0, -0.4, 0]));
  const tip = part(
    new ConeGeometry(0.2, 0.45, 6),
    new MeshPhysicalMaterial({
      color: 0x3f_d0_e0,
      emissive: 0x20_a0_c0,
      emissiveIntensity: 0.6,
      clearcoat: 1,
    }),
  );
  group.add(place(tip, [0, 1.05, 0]));
  return diagonal(group);
}

/** A gold ring set with a ruby. */
export function ring() {
  const group = new Group();
  group.add(part(new TorusGeometry(0.75, 0.14, 16, 48), kit.gold()));
  group.add(place(part(new CylinderGeometry(0.22, 0.16, 0.2, 12), kit.gold()), [0, 0.88, 0]));
  const ruby = part(new SphereGeometry(0.24, 6, 4), kit.gem(0xd0_20_3a));
  group.add(place(ruby, [0, 1.06, 0.05]));
  return group;
}

/* Classes */

export function lyre() {
  const group = new Group();
  const frame = new Shape();
  frame.moveTo(-0.15, -0.9);
  frame.quadraticCurveTo(-0.95, -0.6, -0.75, 0.2);
  frame.quadraticCurveTo(-0.6, 0.8, -0.85, 1.05);
  frame.lineTo(-0.62, 1.05);
  frame.quadraticCurveTo(-0.4, 0.75, -0.5, 0.2);
  frame.quadraticCurveTo(-0.65, -0.45, 0, -0.65);
  frame.quadraticCurveTo(0.65, -0.45, 0.5, 0.2);
  frame.quadraticCurveTo(0.4, 0.75, 0.62, 1.05);
  frame.lineTo(0.85, 1.05);
  frame.quadraticCurveTo(0.6, 0.8, 0.75, 0.2);
  frame.quadraticCurveTo(0.95, -0.6, 0.15, -0.9);
  group.add(extrude(frame, 0.12, kit.gold(), 0.04));
  group.add(
    place(
      part(new CylinderGeometry(0.06, 0.06, 1.4, 10), kit.oak(26)),
      [0, 0.85, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  for (const x of [-0.24, -0.08, 0.08, 0.24])
    group.add(
      place(part(new CylinderGeometry(0.012, 0.012, 1.45, 6), kit.ivory()), [x, 0.1, 0.03]),
    );
  return group;
}

export const ankh = armour("gi:ankh", kit.gold());
export const oakLeaf = armour("gi:oak-leaf", kit.lacquer(0x4f_9a_3a));
export const thief = armour("gi:cloak-dagger", kit.leather("#6a5a88", 93));
export const monk = armour("gi:monk-face", kit.lacquer(0xe0_88_2a));

/** A heater shield in white enamel bearing a gold cross. */
export function paladin() {
  const group = new Group();
  const shape = new Shape();
  shape.moveTo(-0.85, 0.9);
  shape.lineTo(0.85, 0.9);
  shape.lineTo(0.85, 0.1);
  shape.quadraticCurveTo(0.8, -0.65, 0, -1.05);
  shape.quadraticCurveTo(-0.8, -0.65, -0.85, 0.1);
  group.add(extrude(shape, 0.16, kit.enamel(0xf2_ee_e4), 0.06));
  const gold = kit.gold();
  group.add(place(part(new RoundedBoxGeometry(0.22, 1.4, 0.08, 2, 0.03), gold), [0, 0.05, 0.13]));
  group.add(place(part(new RoundedBoxGeometry(1.1, 0.22, 0.08, 2, 0.03), gold), [0, 0.35, 0.13]));
  return group;
}

/** A wizard's pointed hat, deep blue scattered with stars. */
export function wizard() {
  const group = new Group();
  const cloth = new MeshPhysicalMaterial({
    map: drawnTexture(256, 256, 27, (context, random, w, h) => {
      context.fillStyle = "#24408e";
      context.fillRect(0, 0, w, h);
      context.fillStyle = "#f2c24e";
      for (let index = 0; index < 18; index++) {
        context.beginPath();
        context.arc(random() * w, random() * h, 3 + random() * 5, 0, TAU);
        context.fill();
      }
    }),
    roughness: 0.8,
    sheen: 0.5,
  });
  const brim = part(new CylinderGeometry(1.05, 1.05, 0.08, 48), cloth);
  brim.scale.z = 0.35;
  group.add(place(brim, [0, -0.8, 0]));
  const cone = new TubeGeometry(
    new CatmullRomCurve3([
      new Vector3(0, -0.8, 0),
      new Vector3(0, 0.2, 0),
      new Vector3(0.35, 0.95, 0),
      new Vector3(0.7, 1.05, 0),
    ]),
    32,
    0.05,
    16,
  );
  const radii = (t: number) => 0.6 * (1 - t) + 0.02;
  const pos = cone.getAttribute("position");
  const centre = new Vector3();
  const curve = cone.parameters.path;
  for (let index = 0; index < pos.count; index++) {
    const ring = Math.floor(index / 17);
    const t = ring / 32;
    curve.getPointAt(t, centre);
    const p = new Vector3()
      .fromBufferAttribute(pos, index)
      .sub(centre)
      .normalize()
      .multiplyScalar(radii(t));
    pos.setXYZ(index, centre.x + p.x, centre.y + p.y, centre.z + p.z);
  }
  cone.computeVertexNormals();
  group.add(part(cone, cloth));
  group.add(
    place(
      part(new TorusGeometry(0.58, 0.07, 10, 40), kit.gold()),
      [0, -0.68, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  return group;
}

/** A horned steel helm. */
export function barbarian() {
  const group = new Group();
  const dome = part(new SphereGeometry(0.75, 48, 32, 0, TAU, 0, Math.PI * 0.55), kit.steel());
  group.add(dome);
  group.add(
    place(
      part(new TorusGeometry(0.73, 0.08, 10, 48), kit.leather("#5a2a14", 94)),
      [0, -0.1, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  group.add(
    place(part(new RoundedBoxGeometry(0.16, 0.7, 0.16, 2, 0.05), kit.steel()), [0, -0.35, 0.7]),
  );
  for (const side of [-1, 1]) {
    const horn = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(side * 0.62, 0.2, 0),
        new Vector3(side * 1.05, 0.35, 0),
        new Vector3(side * 1.2, 0.85, 0),
        new Vector3(side * 1.1, 1.2, 0),
      ]),
      24,
      0.1,
      10,
    );
    const pos = horn.getAttribute("position");
    const centre = new Vector3();
    for (let index = 0; index < pos.count; index++) {
      const t = Math.floor(index / 11) / 24;
      horn.parameters.path.getPointAt(t, centre);
      const p = new Vector3()
        .fromBufferAttribute(pos, index)
        .sub(centre)
        .multiplyScalar(1.6 * (1 - t) + 0.15);
      pos.setXYZ(index, centre.x + p.x, centre.y + p.y, centre.z + p.z);
    }
    horn.computeVertexNormals();
    group.add(part(horn, kit.ivory()));
  }
  return group;
}

/** A swirling orb of crimson-violet fire. */
export function sorcerer() {
  const group = new Group();
  group.add(
    part(
      new SphereGeometry(0.75, 48, 32),
      new MeshPhysicalMaterial({
        color: 0xc0_2a_8a,
        emissive: 0xa0_10_70,
        emissiveIntensity: 0.6,
        clearcoat: 1,
        roughness: 0.15,
      }),
    ),
  );
  for (const [tilt, colour] of [
    [0.5, 0xff_b0_e8],
    [-0.7, 0xff_80_c0],
  ] as const)
    group.add(
      place(
        part(new TorusGeometry(0.95, 0.05, 8, 64), kit.lacquer(colour)),
        [0, 0, 0],
        [Math.PI / 2 + tilt, 0.3, 0],
      ),
    );
  group.add(place(glow(0.5, 0xff_9a_d8, 0.4), [-0.2, 0.25, 0.5]));
  return group;
}

/** An eldritch green eye between dark lids. */
export function warlock() {
  const group = new Group();
  const lids = new Shape();
  lids.moveTo(-1, 0);
  lids.quadraticCurveTo(0, 1, 1, 0);
  lids.quadraticCurveTo(0, -1, -1, 0);
  group.add(extrude(lids, 0.2, kit.leather("#2a2230", 95), 0.06));
  const eye = part(new SphereGeometry(0.42, 32, 24), kit.gem(0x2f_c0_70));
  eye.scale.z = 0.5;
  group.add(place(eye, [0, 0, 0.15]));
  const pupil = part(new SphereGeometry(0.15, 16, 12), kit.matte(0x05_08_05, 0.3));
  pupil.scale.set(0.45, 1.2, 0.4);
  group.add(place(pupil, [0, 0, 0.35]));
  return group;
}

/* Moves and tags */

export function classMove() {
  const group = new Group().add(blade(1.8, 0.24), hilt({ guard: 0.5, grip: 0.5 }));
  const wing = new Shape();
  wing.moveTo(0, 0);
  wing.quadraticCurveTo(0.5, 0.6, 1.1, 0.7);
  wing.lineTo(0.85, 0.45);
  wing.lineTo(1, 0.35);
  wing.lineTo(0.75, 0.2);
  wing.lineTo(0.85, 0.05);
  wing.quadraticCurveTo(0.4, 0.05, 0, -0.15);
  for (const side of [1, -1]) {
    const w = extrude(wing, 0.06, kit.ivory(), 0.025);
    w.scale.x = side;
    group.add(place(w, [side * 0.12, -0.05, 0.1]));
  }
  return diagonal(group);
}

/* Shared with the interface's old models: the hero's helm, the tag, a move's d20. */

/** A visored steel helm with a crimson plume. */
export function hero() {
  const group = new Group();
  const steel = kit.steel();
  const dome = part(new SphereGeometry(0.8, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), steel);
  dome.scale.set(1, 1.1, 1);
  group.add(place(dome, [0, 0.1, 0]));
  const face = part(new CylinderGeometry(0.75, 0.66, 0.9, 48, 1, true), steel);
  group.add(place(face, [0, -0.45, 0]));
  const slit = part(new RoundedBoxGeometry(0.9, 0.1, 0.3, 1, 0.03), kit.matte(0x0c_0a_0a, 0.9));
  group.add(place(slit, [0, -0.2, 0.68]));
  group.add(
    place(
      part(new RoundedBoxGeometry(0.14, 1.1, 0.2, 2, 0.05), kit.gold()),
      [0, 0.15, 0.78],
      [-0.2, 0, 0],
    ),
  );
  group.add(
    place(
      part(new TorusGeometry(0.74, 0.05, 8, 48), kit.gold()),
      [0, -0.05, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  const plume = part(new SphereGeometry(0.3, 24, 16), kit.matte(0xb3_24_2a, 0.85));
  plume.scale.set(0.6, 1, 1.6);
  group.add(place(plume, [0, 0.95, -0.2], [-0.4, 0, 0]));
  return new Group().add(group);
}

/** A gold name tag on a red string. */
export function tag() {
  const group = new Group();
  const tag = new Shape();
  tag.moveTo(-0.9, -0.5);
  tag.lineTo(0.5, -0.5);
  tag.lineTo(0.95, 0);
  tag.lineTo(0.5, 0.5);
  tag.lineTo(-0.9, 0.5);
  const hole = new Shape();
  hole.absarc(0.55, 0, 0.1, 0, TAU, true);
  tag.holes.push(hole);
  const plate = part(
    new ExtrudeGeometry(tag, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    }),
    kit.gold(),
  );
  group.add(plate);
  const ink = kit.matte(0x5a_34_10, 0.6);
  for (const [y, w] of [
    [0.15, 1],
    [-0.15, 0.7],
  ] as const)
    group.add(
      place(part(new RoundedBoxGeometry(w, 0.09, 0.04, 1, 0.02), ink), [
        -0.3 - (1 - w) / 2,
        y,
        0.13,
      ]),
    );
  group.add(
    place(
      part(new TorusGeometry(0.3, 0.035, 8, 24), kit.lacquer(0xa3_20_1a)),
      [0.95, 0.15, 0.05],
      [0.4, 0.3, 0],
    ),
  );
  group.rotation.set(0, 0, 0.25);
  return new Group().add(group);
}

/** A purple d20 with its gilded numeral turned to the viewer. */
export function move() {
  const group = new Group();
  const die = part(new IcosahedronGeometry(0.75, 0), kit.lacquer(0x5b_2a_9a));
  die.rotation.set(0.35, 0.5, 0.15);
  group.add(die);
  const numeral = numberDecal(die, "20");
  if (numeral) group.add(numeral);
  return group;
}

/** Ink on the face of `die` that most faces the camera. */
function numberDecal(die: Mesh, label: string): Object3D | undefined {
  die.updateMatrixWorld();
  const { geometry } = die;
  const pos = geometry.getAttribute("position");
  const toCamera = new Vector3(0, 0.2, 1).normalize();
  let best: { centre: Vector3; normal: Vector3; score: number } | undefined;
  for (let index = 0; index < pos.count; index += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(pos, index + k).applyMatrix4(die.matrixWorld),
    ) as [Vector3, Vector3, Vector3];
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const score = normal.dot(toCamera);
    if (!best || score > best.score)
      best = { centre: a.clone().add(b).add(c).divideScalar(3), normal, score };
  }
  if (!best) return undefined;
  const texture = drawnTexture(128, 128, 1, (context, _r, w, h) => {
    context.fillStyle = "#f2c24e";
    context.font = `bold ${h * 0.62}px Georgia, serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, w / 2, h * 0.56);
  });
  const decal = new Mesh(
    new PlaneGeometry(0.5, 0.5),
    new MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6 }),
  );
  decal.position.copy(best.centre).addScaledVector(best.normal, 0.004);
  decal.lookAt(best.centre.clone().add(best.normal));
  return decal;
}
