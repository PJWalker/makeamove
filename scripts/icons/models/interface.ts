import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  MeshPhysicalMaterial,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { kit, part, place } from "../kit";
import { badged, medallion, outline, relief } from "../forms";
import { lathe, TAU } from "./core";
import { pane } from "./props";

/* Interface controls. */

export const help = () => medallion(outline("ms:question-mark-rounded"), 0x2f6fc2);

/** An arched oak door, bound in iron, standing ajar on warm light. */
export function leave() {
  const group = new Group();
  const arch = (w: number, h: number, shape: Shape | Path = new Shape()) => {
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h - w / 2);
    shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
    return shape;
  };
  const surround = arch(1.7, 2.1) as Shape;
  surround.holes.push(arch(1.2, 1.8, new Path()) as Path);
  group.add(
    part(
      new ExtrudeGeometry(surround, {
        depth: 0.3,
        bevelEnabled: true,
        bevelSize: 0.03,
        bevelThickness: 0.03,
      }),
      kit.stone(17),
    ),
  );
  group.add(
    place(
      part(
        new ExtrudeGeometry(arch(1.2, 1.8) as Shape, { depth: 0.02, bevelEnabled: false }),
        kit.matte(0xffc86a, 0.9),
      ),
      [0, 0, 0.02],
    ),
  );
  const door = new Group();
  door.add(
    place(
      part(
        new ExtrudeGeometry(arch(1.18, 1.78) as Shape, { depth: 0.12, bevelEnabled: false }),
        kit.oak(11),
      ),
      [0.59, 0, 0],
    ),
  );
  for (const y of [0.4, 1.2])
    door.add(
      place(part(new RoundedBoxGeometry(1.1, 0.09, 0.04, 1, 0.02), kit.blackIron()), [
        0.59,
        y,
        0.14,
      ]),
    );
  door.add(place(part(new TorusGeometry(0.1, 0.025, 8, 20), kit.brass()), [1.0, 0.85, 0.16]));
  group.add(place(door, [-0.6, 0, 0.1], [0, -0.75, 0]));
  group.rotation.y = 0.2;
  return new Group().add(group);
}

/** A pewter waste bin with its lid. */
export function deleteItem() {
  const group = new Group();
  const pewter = new MeshPhysicalMaterial({
    color: 0x8a919c,
    metalness: 1,
    roughness: 0.35,
    envMapIntensity: 2,
  });
  group.add(
    part(
      lathe([
        [0, 0],
        [0.6, 0],
        [0.78, 1.5],
        [0.72, 1.5],
        [0.55, 0.06],
        [0, 0.06],
      ]),
      pewter,
    ),
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.25;
    group.add(
      place(
        part(new RoundedBoxGeometry(0.08, 1.45, 0.06, 1, 0.02), kit.blackIron()),
        [Math.sin(a) * 0.69, 0.75, Math.cos(a) * 0.69],
        [0, a, Math.sin(a) * -0.12],
      ).rotateX(Math.cos(a) * 0.12),
    );
  }
  const lid = new Group();
  lid.add(
    part(
      lathe([
        [0, 0.12],
        [0.85, 0],
        [0.86, -0.06],
        [0, 0],
      ]),
      pewter,
    ),
  );
  lid.add(
    place(part(new TorusGeometry(0.16, 0.04, 8, 20, Math.PI), kit.blackIron()), [0, 0.12, 0]),
  );
  group.add(place(lid, [0.1, 1.62, 0], [0, 0, -0.18]));
  return group;
}

const glyph =
  (id: Parameters<typeof outline>[0], material = kit.steel()) =>
  () =>
    place(relief(outline(id), material, 0.3, 0.07), [0, 0, 0], [0.05, 0.3, 0]);

export const add = glyph("ms:add-rounded", kit.enamel(0x2f9a54));
export const remove = glyph("ms:remove-rounded", kit.enamel(0xb8322a));
export const close = glyph("ms:close-rounded");
export const check = glyph("ms:check-rounded", kit.enamel(0x2f9a54));
export const menu = glyph("ms:menu-rounded");
export const expand = glyph("ms:expand-more-rounded");

/** A magnifying glass: brass rim, glass lens, ebony handle. */
export function search() {
  const group = new Group();
  group.add(part(new TorusGeometry(0.62, 0.11, 16, 48), kit.brass()));
  const lens = new SphereGeometry(0.62, 32, 16);
  const glass = new MeshPhysicalMaterial({
    color: 0xbfe2ff,
    roughness: 0.02,
    transparent: true,
    opacity: 0.4,
    clearcoat: 1,
  });
  const lensMesh = place(new Group().add(part(lens, glass)), [0, 0, 0]);
  lensMesh.scale.set(1, 1, 0.15);
  group.add(lensMesh);
  const handle = new Group();
  handle.add(place(part(new CylinderGeometry(0.1, 0.12, 0.25, 16), kit.brass()), [0, -0.83, 0]));
  handle.add(
    place(part(new CylinderGeometry(0.12, 0.14, 0.9, 16), kit.matte(0x2b1d17, 0.45)), [0, -1.4, 0]),
  );
  group.add(handle);
  group.rotation.set(0.15, 0.25, 0.75);
  return new Group().add(group);
}

export const layoutSplit = () => pane([0.5]);
export const layoutSingle = () => pane([]);
export const sidebar = () => pane([0.64], [0.64, 1]);
export const sidebarHide = () => badged(pane([0.64], [0.64, 1]), "remove");
export const openWindow = () => badged(pane([]), "out");
