import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from "three";
import { discHull, type DieHull } from "./physics";

/*
 * The solids the dice are made of: their geometry, the hull the physics rolls,
 * and how their faces are numbered.
 */

/** A die's canvas, in CSS px; dice are drawn at SCALE px per unit. */
export const SLOT = 64;
export const SCALE = 24;
/** A chip's radius and thickness, in units. */
const CHIP_RADIUS = 0.95;
const CHIP_THICKNESS = 0.22;

const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);

export interface Face {
  centre: Vector3;
  normal: Vector3;
  size: number;
  /** How its label is turned on the die: the first face's reads upright at rest. */
  labelRotation: Quaternion;
}

export interface Shape {
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  faces: Face[];
  hull: DieHull;
  /** The pose that turns the first face to the viewer, its label upright. */
  rest: Quaternion;
}

/** A d10: ten kites, which stay flat when the poles stand this far above the zig-zag rim. */
function trapezohedron(): BufferGeometry {
  const c = Math.cos(Math.PI / 5);
  const pole = 1.15;
  const rim = pole / (1 + (2 * c) / (1 - c));
  const top = new Vector3(0, pole, 0);
  const bottom = new Vector3(0, -pole, 0);
  const zigzag = Array.from({ length: 10 }, (_, index) => {
    const a = (index * Math.PI) / 5;
    return new Vector3(Math.cos(a), index % 2 ? -rim : rim, Math.sin(a));
  });
  const positions: number[] = [];
  for (let k = 0; k < 10; k += 2) {
    const [up, down, nextUp, nextDown] = [0, 1, 2, 3].map((index) => zigzag[(k + index) % 10]!) as [
      Vector3,
      Vector3,
      Vector3,
      Vector3,
    ];
    for (const [a, b, c] of [
      [top, up, down],
      [top, down, nextUp],
      [bottom, down, nextUp],
      [bottom, nextUp, nextDown],
    ] as const) {
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const outward = normal.dot(a.clone().add(b).add(c)) > 0;
      positions.push(...(outward ? [a, b, c] : [a, c, b]).flatMap((v) => v.toArray()));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

interface Plane {
  normal: Vector3;
  points: Vector3[];
}

/** Groups the triangles of a convex solid into its faces, one material group each. */
function planesOf(geometry: BufferGeometry): Plane[] {
  const position = geometry.getAttribute("position");
  const planes: Plane[] = [];
  geometry.clearGroups();
  for (let offset = 0; offset < position.count; offset += 3) {
    const [a, b, c] = [0, 1, 2].map((index_) => new Vector3().fromBufferAttribute(position, offset + index_));
    const normal = b!.clone().sub(a!).cross(c!.clone().sub(a!)).normalize();
    let index = planes.findIndex((plane) => plane.normal.distanceTo(normal) < 1e-4);
    if (index < 0) index = planes.push({ normal, points: [] }) - 1;
    const { points } = planes[index]!;
    for (const v of [a!, b!, c!]) if (!points.some((p) => p.distanceTo(v) < 1e-4)) points.push(v);
    geometry.addGroup(offset, 3, index);
  }
  return planes;
}

const centreOf = (points: Vector3[]) =>
  points.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(points.length);

/** The physics hull of a solid's faces: their corners in order around each, as the solver wants them. */
function hullOf(planes: Plane[]): DieHull {
  const vertices: Vector3[] = [];
  const faces = planes.map(({ normal, points }) => {
    const centre = centreOf(points);
    const inverse = new Quaternion().setFromUnitVectors(Z, normal).invert();
    const angle = (v: Vector3) => {
      const local = v.clone().sub(centre).applyQuaternion(inverse);
      return Math.atan2(local.y, local.x);
    };
    return [...points]
      .sort((a, b) => angle(a) - angle(b))
      .map((v) => {
        const index = vertices.findIndex((w) => w.distanceTo(v) < 1e-4);
        return index === -1 ? vertices.push(v) - 1 : index;
      });
  });
  return { vertices: vertices.map((v) => v.toArray()), faces };
}

const SIDES = new Set([4, 6, 8, 10, 12, 20]);
/** The solid a die is drawn as: its own for the standard dice, else a d20. */
const solidFor = (sides: number) => (SIDES.has(sides) ? sides : 20);

function geometryFor(solid: number): BufferGeometry {
  if (solid === 4) return new TetrahedronGeometry(1.15);
  if (solid === 6) return new BoxGeometry(1.3, 1.3, 1.3).toNonIndexed();
  if (solid === 8) return new OctahedronGeometry(1.2);
  if (solid === 10) return trapezohedron();
  if (solid === 12) return new DodecahedronGeometry(1.1);
  return new IcosahedronGeometry(1.15);
}

const shapes = new Map<number, Shape>();
export function shapeFor(sides: number): Shape {
  const solid = solidFor(sides);
  const known = shapes.get(solid);
  if (known) return known;
  const geometry = geometryFor(solid);
  geometry.computeBoundingSphere();
  // Every die fills the same share of its slot.
  const scale = 28 / (SCALE * geometry.boundingSphere!.radius);
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  const planes = planesOf(geometry);
  const first = planes[0]!;
  const firstCentre = centreOf(first.points);
  const rest = new Quaternion().setFromUnitVectors(first.normal, Z);
  // A cube sits square; the rest stand on a corner.
  if (solid !== 6) {
    const far = first.points.reduce((best, v) =>
      v.distanceTo(firstCentre) > best.distanceTo(firstCentre) ? v : best,
    );
    const tip = far.clone().sub(firstCentre).applyQuaternion(rest);
    rest.premultiply(new Quaternion().setFromAxisAngle(Z, Math.PI / 2 - Math.atan2(tip.y, tip.x)));
  }
  const faces = planes.map(({ normal, points }, index): Face => {
    const centre = centreOf(points);
    const radius = Math.min(...points.map((p) => p.distanceTo(centre)));
    return {
      centre,
      normal,
      size: radius * Math.cos(Math.PI / points.length) * 1.65,
      labelRotation:
        index === 0 ? rest.clone().invert() : new Quaternion().setFromUnitVectors(Z, normal),
    };
  });
  const shape: Shape = {
    geometry,
    edges: new EdgesGeometry(geometry),
    faces,
    hull: {
      ...hullOf(planes),
      labelUps: faces.map((face) => Y.clone().applyQuaternion(face.labelRotation).toArray()),
      faceUp: solid === 4,
    },
    rest,
  };
  shapes.set(solid, shape);
  return shape;
}

/** The number on each face of a die whose first face shows `first`, counting on from it. */
export const faceValue = (first: number, index: number, sides: number) =>
  ((first - 1 + index) % sides) + 1;

/** The number the first face shows, so the face `rotation` turns most towards the viewer shows `value`. */
export function firstFaceFor(sides: number, value: number, rotation: Quaternion) {
  const towards = shapeFor(sides).faces.map((face) => face.normal.clone().applyQuaternion(rotation).z);
  const top = towards.indexOf(Math.max(...towards));
  return ((((value - 1 - top) % sides) + sides) % sides) + 1;
}

let chipGeometry: CylinderGeometry | undefined;
/** A chip: a flat disc, its faces towards and away from the viewer. Groups: rim, front, back. */
export function chipShape() {
  if (chipGeometry) return chipGeometry;
  chipGeometry = new CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_THICKNESS, 48);
  chipGeometry.rotateX(Math.PI / 2);
  return chipGeometry;
}
export const CHIP_LABEL_SIZE = CHIP_RADIUS * 1.3;
export const CHIP_FACE_OFFSET = CHIP_THICKNESS / 2 + 0.003;

export const chipHull = discHull(CHIP_RADIUS, CHIP_THICKNESS);
// Both labels read upright with the chip unturned; the back's is flipped about Y.
chipHull.labelUps = chipHull.faces.map(() => Y.toArray());
