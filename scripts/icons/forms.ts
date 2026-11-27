import { ExtrudeGeometry, Path, Shape, Vector2 } from "three";
import type { Material, Object3D } from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import gameIcons from "@iconify-json/game-icons/icons.json";
import materialSymbols from "@iconify-json/material-symbols/icons.json";
import { part } from "./kit";

/*
 * Shared forms for the kit: glyphs struck in relief from icon outlines,
 * enamelled medallions, and the small badges that mark a variant of an
 * object (adding, removing, sending one way or the other).
 */

interface IconSet {
  width?: number;
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
}
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
