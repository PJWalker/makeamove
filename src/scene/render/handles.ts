import { type Camera, toScreen } from "../camera";
import { corners } from "../geometry";
import type { Point } from "../grid";
import type { Transform } from "../types";

/** Screen px between a selection's top edge and its rotate handle. */
export const ROTATE_HANDLE_GAP = 28;
export const HANDLE_SIZE = 10;

export type LightPart = "lamp" | "bright" | "dim";

/**
 * A selected light's handles, in screen coordinates: one on the lamp's rim (its
 * size) to the right, and one on each of the bright and dim rings, up and down
 * the diagonal so they stay apart when the two radii match.
 */
export function lightHandles(
  light: Transform & { bright: number; dim: number },
  cam: Camera,
): { part: LightPart; at: Point }[] {
  const c = toScreen(cam, light);
  const on = (r: number, angle: number) => ({
    x: c.x + Math.cos(angle) * r * cam.zoom,
    y: c.y + Math.sin(angle) * r * cam.zoom,
  });
  return [
    { part: "lamp", at: on(Math.min(light.w, light.h) / 2, 0) },
    { part: "bright", at: on(light.bright, -Math.PI / 4) },
    { part: "dim", at: on(light.dim, Math.PI / 4) },
  ];
}

/** Where the rotate knob sits, in screen coordinates. */
export function rotateHandlePosition(t: Transform, cam: Camera): Point {
  const points = corners(t).map((p) => toScreen(cam, p));
  const tl = points[0]!;
  const tr = points[1]!;
  const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  return {
    x: top.x + Math.sin(t.rot) * ROTATE_HANDLE_GAP,
    y: top.y - Math.cos(t.rot) * ROTATE_HANDLE_GAP,
  };
}
