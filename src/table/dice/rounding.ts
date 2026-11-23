/* eslint-disable @typescript-eslint/no-magic-numbers */
import {
  BufferGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Vector2,
  Vector3,
} from "three/webgpu";
import { ConvexHull } from "three/addons/math/ConvexHull.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/*
 * Dice with their edges and corners rounded off. A rounded solid is the sharp
 * one shrunk by the rounding's radius with a ball of that radius rolled over
 * it, so its faces stay where the sharp one's are, and labels and physics can
 * keep using the sharp solid.
 */

/** How close two points, or a point and a plane, must be to count as touching. */
const NEAR = 1e-4;
const ON_PLANE = 1e-6;
/** How many directions the rounded corners are drawn from, over the whole sphere. */
const CORNER_DIRECTIONS = 512;
/** The largest turn, in radians, between steps across a rounded edge. */
const EDGE_STEP = Math.PI / 24;
/** Steps around each rounded corner of a chip's rim. */
const RIM_STEPS = 6;

/** Directions spread evenly over the sphere, for the rounded corners. */
function sphereDirections(count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    return new Vector3(Math.cos(golden * index) * ring, y, Math.sin(golden * index) * ring);
  });
}

/** Directions sweeping from `from` to `to`, a step for every few degrees of the turn between them. */
function arc(from: Vector3, to: Vector3) {
  const angle = from.angleTo(to);
  const steps = Math.ceil(angle / EDGE_STEP);
  return Array.from({ length: steps - 1 }, (_, step) => {
    const t = (step + 1) / steps;
    const a = Math.sin((1 - t) * angle) / Math.sin(angle);
    const b = Math.sin(t * angle) / Math.sin(angle);
    return from.clone().multiplyScalar(a).addScaledVector(to, b);
  });
}

/** The distinct corners of a solid. */
function cornersOf(sharp: BufferGeometry) {
  const position = sharp.getAttribute("position");
  const corners: Vector3[] = [];
  for (let index = 0; index < position.count; index++) {
    const v = new Vector3().fromBufferAttribute(position, index);
    if (!corners.some((w) => w.distanceTo(v) < NEAR)) corners.push(v);
  }
  return corners;
}

/** A triangulated convex hull of `facing`'s points, each shaded by the direction it maps to. */
function hullGeometry(facing: Map<Vector3, Vector3>) {
  const hull = new ConvexHull().setFromPoints([...facing.keys()]);
  const positions: number[] = [];
  const normals: number[] = [];
  for (const face of hull.faces) {
    let { edge } = face;
    do {
      const { point } = edge.head();
      positions.push(...point.toArray());
      normals.push(...facing.get(point)!.toArray());
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
}

/**
 * A convex solid whose faces all sit the same distance from its centre, as
 * the dice's do, with its edges rounded to `radius`. `faces` are its faces'
 * outward normals.
 */
export function roundedSolid(
  sharp: BufferGeometry,
  faces: Vector3[],
  radius: number,
): BufferGeometry {
  const corners = cornersOf(sharp);
  const inradius = Math.min(
    ...faces.map((normal) => Math.max(...corners.map((v) => v.dot(normal)))),
  );
  const shrunk = corners.map((v) => v.clone().multiplyScalar((inradius - radius) / inradius));
  const reach = (normal: Vector3) => Math.max(...shrunk.map((v) => v.dot(normal)));
  const touches = (v: Vector3, normal: Vector3) => v.dot(normal) > reach(normal) - ON_PLANE;
  // Two faces meet at an edge where they share two corners.
  const edges = faces.flatMap((a, i) =>
    faces
      .slice(i + 1)
      .flatMap((b) =>
        shrunk.filter((v) => touches(v, a) && touches(v, b)).length >= 2 ? arc(a, b) : [],
      ),
  );
  /** Each point on the surface, and the way it faces: the direction from its corner's ball. */
  const facing = new Map<Vector3, Vector3>();
  for (const direction of [...faces, ...edges, ...sphereDirections(CORNER_DIRECTIONS)]) {
    for (const corner of shrunk) {
      if (touches(corner, direction))
        facing.set(corner.clone().addScaledVector(direction, radius), direction);
    }
  }
  return hullGeometry(facing);
}

/**
 * A disc `thickness` thick, its edges rounded to `rounding`, facing ±Z.
 * Groups: rim, front, back.
 */
export function roundedDisc(radius: number, thickness: number, rounding: number) {
  const half = thickness / 2;
  const inner = radius - rounding;
  const corner = (centreY: number, from: number, to: number) =>
    Array.from({ length: RIM_STEPS + 1 }, (_, step) => {
      const angle = from + ((to - from) * step) / RIM_STEPS;
      return new Vector2(inner + rounding * Math.cos(angle), centreY + rounding * Math.sin(angle));
    });
  const segments = 48;
  const rim = new LatheGeometry(
    [...corner(-half + rounding, -Math.PI / 2, 0), ...corner(half - rounding, 0, Math.PI / 2)],
    segments,
  );
  const front = new LatheGeometry([new Vector2(inner, half), new Vector2(0, half)], segments);
  const back = new LatheGeometry([new Vector2(0, -half), new Vector2(inner, -half)], segments);
  const disc = mergeGeometries([rim, front, back], true);
  for (const part of [rim, front, back]) part.dispose();
  disc.rotateX(Math.PI / 2);
  return disc;
}
