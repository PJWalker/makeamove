import {
  AdditiveBlending,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector2,
} from "three";

/* Helpers the entry models share. */

export const TAU = Math.PI * 2;

export function lathe(profile: [number, number][], segments = 48) {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

/** A soft additive glow that lights the scene but stays out of the framing. */
export function glow(radius: number, colour: number, opacity: number) {
  const mesh = new Mesh(
    new SphereGeometry(radius, 24, 16),
    new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.userData["glow"] = true;
  return mesh;
}
