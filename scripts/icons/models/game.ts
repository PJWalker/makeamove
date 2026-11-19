import {
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  MeshPhysicalMaterial,
  Shape,
  SphereGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { kit, part, place } from "../kit";
import { badged, medallion, outline, relief } from "../forms";
import { lathe } from "./core";
import { pawn } from "./props";

/* Combat, gear, moves, and the people at the table. */

function sword() {
  const group = new Group();
  const blade = new Shape();
  blade.moveTo(-0.09, 0);
  blade.lineTo(0.09, 0);
  blade.lineTo(0.07, 1.6);
  blade.lineTo(0, 1.8);
  blade.lineTo(-0.07, 1.6);
  const steel = part(
    new ExtrudeGeometry(blade, {
      depth: 0.02,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
    }),
    kit.steel(),
  );
  group.add(place(steel, [0, 0, -0.01]));
  group.add(
    place(part(new RoundedBoxGeometry(0.62, 0.1, 0.12, 2, 0.04), kit.gold()), [0, -0.02, 0]),
  );
  group.add(
    place(
      part(new CylinderGeometry(0.055, 0.055, 0.42, 12), kit.leather("#7a1d1d", 81)),
      [0, -0.28, 0],
    ),
  );
  group.add(place(part(new SphereGeometry(0.1, 16, 12), kit.gold()), [0, -0.52, 0]));
  group.position.y = -0.6;
  return new Group().add(group);
}

export function combat() {
  const group = new Group();
  group.add(place(sword(), [-0.05, 0, -0.1], [0, 0, -0.75]));
  group.add(place(sword(), [0.05, 0, 0.1], [0, 0, 0.75]));
  return group;
}

/** A blacksmith's anvil of dark iron. */
export const items = () =>
  place(relief(outline("gi:anvil"), kit.iron(), 0.7, 0.06), [0, 0, 0], [0, 0, 0]);

/** A green canvas rucksack strapped in leather. */
export function newGear() {
  const group = new Group();
  const canvas = kit.leather("#4d6b30", 90);
  group.add(part(new RoundedBoxGeometry(1.5, 1.8, 0.9, 4, 0.3), canvas));
  group.add(
    place(
      part(new RoundedBoxGeometry(1.4, 0.75, 0.25, 3, 0.12), kit.leather("#3d5726", 91)),
      [0, 0.55, 0.4],
      [0.15, 0, 0],
    ),
  );
  group.add(place(part(new RoundedBoxGeometry(1, 0.7, 0.3, 3, 0.12), canvas), [0, -0.45, 0.48]));
  const strap = kit.leather("#6a3b1c", 92);
  for (const x of [-0.35, 0.35]) {
    group.add(
      place(
        part(new RoundedBoxGeometry(0.14, 0.9, 0.06, 1, 0.02), strap),
        [x, 0.3, 0.55],
        [0.15, 0, 0],
      ),
    );
    group.add(
      place(part(new RoundedBoxGeometry(0.2, 0.16, 0.06, 1, 0.02), kit.brass()), [x, -0.05, 0.6]),
    );
  }
  group.rotation.x = 0.15;
  return new Group().add(group);
}

export const newMove = () =>
  place(
    relief(
      outline("ms:bolt-rounded"),
      new MeshPhysicalMaterial({
        color: 0x3fa0ff,
        emissive: 0x1f70ff,
        emissiveIntensity: 0.35,
        clearcoat: 1,
        roughness: 0.2,
      }),
      0.3,
      0.07,
    ),
    [0, 0, 0],
    [0, 0.3, 0],
  );

export const startCombat = () => medallion(outline("ms:play-arrow-rounded"), 0x2f8a4a);
export const endCombat = () => medallion(outline("ms:stop-rounded"), 0xa3201a);
export const nextTurn = () => medallion(outline("ms:skip-next-rounded"), 0x3d5f8f);
export const previousTurn = () => medallion(outline("ms:skip-previous-rounded"), 0x3d5f8f);

/** A small oak with a full green crown. */
export function relationships() {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.16, 0.28, 1.1, 12), kit.oak(10)));
  const leaves = kit.matte(0x3f8f3a, 0.8);
  for (const [x, y, z, r] of [
    [0, 0.85, 0, 0.6],
    [-0.55, 0.55, 0.1, 0.45],
    [0.55, 0.55, 0.05, 0.45],
    [-0.25, 1.25, -0.1, 0.4],
    [0.3, 1.2, 0.1, 0.42],
  ] as const)
    group.add(place(part(new SphereGeometry(r, 24, 16), leaves), [x, y, z]));
  for (const [x, y] of [
    [-0.3, 0.7],
    [0.4, 0.95],
    [0.05, 1.3],
  ] as const)
    group.add(place(part(new SphereGeometry(0.08, 12, 8), kit.lacquer(0xc0392b)), [x, y, 0.55]));
  return group;
}

/** A red-headed pin. */
export function pin() {
  const group = new Group();
  group.add(
    part(
      lathe([
        [0, 0],
        [0.5, 0],
        [0.52, 0.12],
        [0.28, 0.22],
        [0.24, 0.65],
        [0.42, 0.78],
        [0.42, 0.9],
        [0, 0.92],
      ]),
      kit.lacquer(0xc0392b),
    ),
  );
  group.add(
    place(part(new ConeGeometry(0.05, 0.9, 12), kit.steel()), [0, -0.45, 0], [Math.PI, 0, 0]),
  );
  group.rotation.set(0, 0, -0.55);
  return new Group().add(group);
}

export const removeMember = () => badged(pawn(kit.ivory()), "remove");
export const allowBack = () => badged(pawn(kit.ivory()), "add");
