import {
  Box3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  type Material,
  type Object3D,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import gameIcons from "@iconify-json/game-icons/icons.json";
import materialSymbols from "@iconify-json/material-symbols/icons.json";
import { kit, part, place } from "./kit";

/*
 * Shared forms for the kit: glyphs struck in relief from icon outlines,
 * enamelled medallions, and the small badges that mark a variant of an
 * object (adding, removing, sending one way or the other).
 */

type IconSet = {
  width?: number;
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
};
const SETS = { gi: gameIcons, ms: materialSymbols } as unknown as Record<"gi" | "ms", IconSet>;

/**
 * The outline of an icon from Game-icons ("gi:hand") or Material Symbols
 * ("ms:add-rounded"), as shapes two units across, centred, Y up.
 */
export function outline(id: `${"gi" | "ms"}:${string}`): Shape[] {
  const [prefix, name] = id.split(":") as ["gi" | "ms", string];
  const set = SETS[prefix];
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ""];
  if (!icon) throw new Error(`No icon ${id}`);
  const size = set.width ?? 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${icon.body}</svg>`;
  const shapes = new SVGLoader().parse(svg).paths.flatMap((path) => path.toShapes());
  const scale = 2 / size;
  const map = (p: Vector2) => new Vector2((p.x - size / 2) * scale, (size / 2 - p.y) * scale);
  return shapes.map((shape) => {
    const { shape: points, holes } = shape.extractPoints(12);
    const mapped = new Shape(points.map(map));
    mapped.holes = holes.map((hole) => new Path(hole.map(map)));
    return mapped;
  });
}

/** Icon outlines struck as a bevelled solid, front face at z = 0. */
export function relief(shapes: Shape[], material: Material, depth = 0.22, bevel = 0.05): Object3D {
  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel * 0.7,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -depth);
  return part(geometry, material);
}

/** Centres an object on the origin, scaled to fit `size` units. */
export function fit<T extends Object3D>(object: T, size = 2): T {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const extent = box.getSize(new Vector3());
  const scale = size / Math.max(extent.x, extent.y);
  object.scale.multiplyScalar(scale);
  object.position.sub(box.getCenter(new Vector3()).multiplyScalar(scale));
  return object;
}

/** A round enamelled coin rimmed in gold, with a glyph raised in its face. */
export function medallion(
  glyph: Shape[],
  enamel: number,
  { glyphMaterial = kit.gold(), glyphScale = 0.62 } = {},
): Object3D {
  const group = new Group();
  const coin = part(new CylinderGeometry(1, 1, 0.24, 64), kit.enamel(enamel));
  coin.rotation.x = Math.PI / 2;
  const rim = part(new TorusGeometry(1, 0.09, 16, 64), kit.gold());
  const raised = relief(glyph, glyphMaterial, 0.1, 0.035);
  raised.scale.setScalar(glyphScale);
  raised.position.z = 0.2;
  group.add(coin, rim, raised);
  return group;
}

const BADGES = {
  add: ["ms:add-rounded", 0x2f9a54],
  remove: ["ms:remove-rounded", 0xb8322a],
  up: ["ms:arrow-upward-rounded", 0x2f6fc2],
  down: ["ms:arrow-downward-rounded", 0x2f6fc2],
  out: ["ms:arrow-outward-rounded", 0x2f6fc2],
  back: ["ms:arrow-back-rounded", 0x2f6fc2],
} as const;

/** Marks an object with a small medallion in its lower right corner. */
export function badged(object: Object3D, kind: keyof typeof BADGES): Object3D {
  const fitted = fit(object, 2);
  const [glyph, colour] = BADGES[kind];
  const badge = medallion(outline(glyph), colour, { glyphMaterial: kit.ivory(), glyphScale: 0.9 });
  badge.scale.setScalar(0.48);
  place(badge, [0.72, -0.72, 1.2]);
  return new Group().add(fitted, badge);
}
