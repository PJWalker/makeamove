import { CylinderGeometry, Group, SphereGeometry, TorusGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { kit, part, place } from "../kit";
import { medallion, outline, relief } from "../forms";
import { lathe } from "./core";
import { pawn, slab } from "./props";

/* The sidebar's panels, and seeing or hiding things from players. */

/** Two speech bubbles in conversation. */
export function chat() {
  const group = new Group();
  const bubble = outline("ms:chat-bubble-rounded");
  const back = relief(bubble, kit.enamel(0x2f6fc2), 0.2, 0.05);
  back.scale.set(-0.8, 0.8, 0.8);
  group.add(place(back, [0.45, 0.4, -0.3]));
  const front = relief(bubble, kit.ivory(), 0.2, 0.05);
  front.scale.setScalar(0.8);
  group.add(place(front, [-0.35, -0.3, 0.1]));
  return new Group().add(group);
}

/** A visored steel helm with a crimson plume. */
export function characters() {
  const group = new Group();
  const steel = kit.steel();
  const dome = part(new SphereGeometry(0.8, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), steel);
  dome.scale.set(1, 1.1, 1);
  group.add(place(dome, [0, 0.1, 0]));
  const face = part(new CylinderGeometry(0.75, 0.66, 0.9, 48, 1, true), steel);
  group.add(place(face, [0, -0.45, 0]));
  const slit = part(new RoundedBoxGeometry(0.9, 0.1, 0.3, 1, 0.03), kit.matte(0x0c0a0a, 0.9));
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
  const plume = part(new SphereGeometry(0.3, 24, 16), kit.matte(0xb3242a, 0.85));
  plume.scale.set(0.6, 1, 1.6);
  group.add(place(plume, [0, 0.95, -0.2], [-0.4, 0, 0]));
  return new Group().add(group);
}

/** A cameo: a figure's silhouette set in an oval of gold. */
export function playerCharacter() {
  const group = new Group();
  const oval = part(new CylinderGeometry(0.8, 0.8, 0.12, 48), kit.ivory());
  oval.scale.set(1, 1, 1.25);
  group.add(place(oval, [0, 0, 0], [Math.PI / 2, 0, 0]));
  const rim = part(new TorusGeometry(0.8, 0.09, 12, 48), kit.gold());
  rim.scale.set(1, 1.25, 1);
  group.add(rim);
  const figure = relief(outline("ms:person-rounded"), kit.enamel(0x22406e), 0.06, 0.02);
  figure.scale.setScalar(0.72);
  group.add(place(figure, [0, -0.05, 0.12]));
  return new Group().add(group);
}

/** A shelf of bound volumes in many colours. */
export function libraries() {
  const group = new Group();
  group.add(
    place(part(new RoundedBoxGeometry(2.2, 0.16, 0.8, 2, 0.03), kit.oak(9)), [0, -0.85, 0]),
  );
  const books: [number, number, number, number][] = [
    [0xa3201a, 0.36, 1.45, 0],
    [0x2f6fc2, 0.3, 1.25, 0],
    [0x2f8a4a, 0.42, 1.5, 0],
    [0x5b2a9a, 0.3, 1.3, 0],
    [0xb8862f, 0.34, 1.2, -0.28],
  ];
  let x = -0.95;
  for (const [colour, width, height, lean] of books) {
    const book = part(
      new RoundedBoxGeometry(width, height, 0.7, 2, 0.04),
      kit.leather(`#${colour.toString(16).padStart(6, "0")}`, colour % 97),
    );
    const shift = lean ? Math.sin(-lean) * height * 0.5 : 0;
    group.add(
      place(book, [x + width / 2 + shift, -0.77 + (height / 2) * Math.cos(lean), 0], [0, 0, lean]),
    );
    group.add(
      place(
        part(new RoundedBoxGeometry(width + 0.01, 0.06, 0.71, 1, 0.01), kit.gold()),
        [x + width / 2 + shift, -0.77 + height * 0.8 * Math.cos(lean), 0],
        [0, 0, lean],
      ),
    );
    x += width + 0.02;
  }
  return new Group().add(group);
}

/** A rolled scroll tied with a red ribbon. */
export function reference() {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.42, 0.42, 1.7, 32), kit.parchment(undefined, 60)));
  const spiral = part(new TorusGeometry(0.42, 0.02, 6, 32), kit.parchment(undefined, 61));
  group.add(place(spiral, [0, 0.86, 0], [Math.PI / 2, 0, 0]));
  for (const y of [-0.98, 0.98])
    group.add(place(part(new CylinderGeometry(0.12, 0.12, 0.28, 16), kit.oak()), [0, y, 0]));
  group.add(
    place(
      part(new TorusGeometry(0.44, 0.06, 10, 32), kit.lacquer(0xa3201a)),
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  const tail = part(new RoundedBoxGeometry(0.12, 0.6, 0.03, 1, 0.01), kit.lacquer(0xa3201a));
  group.add(place(tail, [0.12, -0.3, 0.45], [0, 0, 0.2]));
  group.rotation.set(0, 0, -0.75);
  return new Group().add(group);
}

/** A black-bound tome clasped in silver, a violet eye watching from its cover. */
export function secret() {
  const group = new Group();
  const cover = kit.leather("#1d1a24", 70);
  group.add(slab(1.5, 1.9, 0.35, cover, 0.08));
  group.add(place(slab(1.38, 1.8, 0.28, kit.parchment(undefined, 71), 0.04), [0.08, 0, 0]));
  group.add(place(slab(0.3, 0.3, 0.42, kit.steel(), 0.06), [0.72, 0, 0]));
  const eye = part(new SphereGeometry(0.26, 32, 24), kit.gem(0x8a3cf0));
  eye.scale.z = 0.5;
  group.add(place(eye, [0, 0.1, 0.2]));
  group.add(place(part(new TorusGeometry(0.3, 0.05, 10, 32), kit.steel()), [0, 0.1, 0.2]));
  for (const [x, y] of [
    [-0.62, 0.82],
    [-0.62, -0.82],
  ] as const)
    group.add(place(slab(0.22, 0.22, 0.4, kit.steel(), 0.05), [x, y, 0]));
  return new Group().add(group);
}

export const reveal = () => medallion(outline("ms:visibility-rounded"), 0x22406e);
export const obscure = () =>
  medallion(outline("ms:visibility-off-rounded"), 0x3a3a46, { glyphMaterial: kit.steel() });

/** A party of three. */
export function members() {
  const group = new Group();
  group.add(place(pawn(kit.lacquer(0x2f8a4a)), [-0.75, 0, -0.4]));
  group.add(place(pawn(kit.lacquer(0xa3201a)), [0.75, 0, -0.4]));
  group.add(place(pawn(kit.lacquer(0x2c4fa8)), [0, -0.1, 0.4]));
  return group;
}

void lathe;
