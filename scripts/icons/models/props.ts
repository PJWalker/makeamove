import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  type Material,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { kit, part, place } from "../kit";
import { lathe } from "./core";

/* Props that several icons share: the same pawn, folio or card everywhere. */

export function pawn(material: Material = kit.lacquer(0x2c4fa8)) {
  return part(
    lathe([
      [0, 0],
      [0.62, 0],
      [0.64, 0.08],
      [0.56, 0.16],
      [0.4, 0.22],
      [0.3, 0.32],
      [0.22, 0.75],
      [0.36, 0.82],
      [0.36, 0.88],
      [0.2, 0.92],
      [0.32, 1.06],
      [0.36, 1.22],
      [0.3, 1.38],
      [0.16, 1.47],
      [0, 1.5],
    ]),
    material,
  );
}

function roundedRect(w: number, h: number, r: number, shape: Shape | Path = new Shape()) {
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

/** A flat slab with rounded corners, centred, front face toward the viewer. */
export function slab(
  w: number,
  h: number,
  depth: number,
  material: Material | Material[],
  r = 0.08,
) {
  const geometry = new ExtrudeGeometry(roundedRect(w, h, r) as Shape, {
    depth,
    bevelEnabled: true,
    bevelSize: Math.min(0.03, depth / 2),
    bevelThickness: Math.min(0.03, depth / 2),
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2);
  return part(geometry, material);
}

/** A rectangular frame, open in the middle. */
export function frame(w: number, h: number, border: number, depth: number, material: Material) {
  const outer = roundedRect(w, h, 0.05) as Shape;
  outer.holes.push(roundedRect(w - border * 2, h - border * 2, 0.02, new Path()) as Path);
  const geometry = new ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.03,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  return part(geometry, material);
}

/** A sheet of parchment with lines of writing. */
export function page(seed = 40, w = 1.3, h = 1.7) {
  return slab(
    w,
    h,
    0.03,
    kit.parchment((ctx, random, cw, ch) => {
      ctx.fillStyle = "rgba(60,40,25,0.7)";
      for (let y = ch * 0.15; y < ch * 0.85; y += ch * 0.09) {
        let x = cw * 0.16;
        while (x < cw * 0.8) {
          const word = cw * (0.05 + random() * 0.12);
          ctx.fillRect(x, y, Math.min(word, cw * 0.84 - x), ch * 0.03);
          x += word + cw * 0.04;
        }
      }
    }, seed),
    0.04,
  );
}

/** A blue cloth folio holding a few pages, its front board lower than its back. */
export function folio() {
  const group = new Group();
  const cloth = kit.leather("#284f8f", 31);
  group.add(place(slab(2, 1.5, 0.08, cloth), [0, 0, -0.1]));
  group.add(place(page(41, 1.6, 1.3), [-0.1, 0.12, -0.04], [0, 0, 0.06]));
  group.add(place(page(42, 1.6, 1.3), [0.08, 0.06, 0], [0, 0, -0.05]));
  group.add(place(slab(2, 1.05, 0.08, cloth), [0, -0.24, 0.08]));
  for (const x of [-0.95, 0.95]) {
    const corner = part(new SphereGeometry(0.1, 12, 8), kit.brass());
    corner.scale.z = 0.5;
    group.add(place(corner, [x * 0.97, -0.72, 0.14]));
  }
  return new Group().add(group);
}

/** An oak chest bound in iron, its lock plate in gold. */
export function chest() {
  const group = new Group();
  const oak = kit.oak(8);
  group.add(part(new RoundedBoxGeometry(2, 1.1, 1.2, 2, 0.05), oak));
  const lid = part(new CylinderGeometry(0.6, 0.6, 2, 32, 1, false, 0, Math.PI), oak);
  place(lid, [0, 0.55, 0], [0, 0, Math.PI / 2]);
  group.add(lid);
  const iron = kit.blackIron();
  for (const x of [-0.7, 0.7]) {
    group.add(place(part(new RoundedBoxGeometry(0.16, 1.14, 1.24, 2, 0.03), iron), [x, 0, 0]));
    const band = part(new TorusGeometry(0.61, 0.05, 8, 32, Math.PI), iron);
    group.add(place(band, [x, 0.55, 0], [0, Math.PI / 2, 0]));
  }
  group.add(place(slab(0.36, 0.42, 0.06, kit.gold(), 0.06), [0, 0.42, 0.62]));
  group.add(place(part(new SphereGeometry(0.05, 10, 8), kit.blackIron()), [0, 0.38, 0.67]));
  group.rotation.set(0.25, 0, 0);
  return new Group().add(group);
}

/** A tarot card: an enamel face in a gilded border. */
export function card(enamel: number) {
  const group = new Group();
  group.add(slab(1.2, 1.8, 0.05, kit.ivory(), 0.1));
  group.add(place(slab(0.95, 1.55, 0.03, kit.enamel(enamel), 0.06), [0, 0, 0.04]));
  group.add(place(frame(0.98, 1.58, 0.05, 0.03, kit.gold()), [0, 0, 0.05]));
  return group;
}

/** A puffy cloud of `colour`, built from overlapping spheres. */
export function cloud(colour: number) {
  const material = kit.matte(colour, 0.9);
  const group = new Group();
  for (const [x, y, r] of [
    [-0.7, -0.05, 0.42],
    [-0.15, 0.25, 0.6],
    [0.5, 0.1, 0.5],
    [0.95, -0.12, 0.34],
    [0.1, -0.2, 0.45],
  ] as const)
    group.add(place(part(new SphereGeometry(r, 32, 24), material), [x, y, 0]));
  group.scale.z = 0.7;
  return group;
}

/** A pane of glass in a gilded frame, divided by mullions at the given fractions. */
export function pane(dividers: number[], shaded?: [number, number]) {
  const group = new Group();
  const [w, h] = [2, 1.6];
  group.add(place(slab(w, h, 0.06, kit.enamel(0x22406e), 0.04), [0, 0, -0.02]));
  if (shaded) {
    const [from, to] = shaded;
    const width = (to - from) * w;
    group.add(
      place(slab(width - 0.08, h - 0.16, 0.04, kit.enamel(0xd8c89a), 0.02), [
        -w / 2 + (from + to) * (w / 2),
        0,
        0.02,
      ]),
    );
  }
  group.add(place(frame(w, h, 0.12, 0.12, kit.gold()), [0, 0, 0.03]));
  for (const at of dividers)
    group.add(
      place(part(new RoundedBoxGeometry(0.1, h - 0.1, 0.1, 2, 0.02), kit.gold()), [
        -w / 2 + at * w,
        0,
        0.04,
      ]),
    );
  return new Group().add(group);
}
