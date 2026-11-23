/* eslint-disable @typescript-eslint/no-magic-numbers */
import {
  clamp,
  dot,
  floor,
  fract,
  length,
  mix,
  screenCoordinate,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Vector3 } from "three/webgpu";
import type { Node } from "three/webgpu";

/*
 * The finish on the cave's picture, for three's render pipeline. It works on
 * the colours as drawn (sRGB, 0 to 1):
 *   - a slight cross-processed grade: bright colours lean towards yellow and
 *     dark ones towards indigo, like film developed in the wrong chemistry;
 *   - a vignette, darkening the corners into the cave's dark;
 *   - the grain of the paper it's painted on, still on the screen while the
 *     strokes move over it;
 *   - a fade into the dark across the top, behind the lobby's title.
 */

/** How far down the picture the fade from the dark reaches. */
const FADE = 0.22;

/** A repeatable number in [0, 1) for a point. */
const paper = (point: Node<"vec2">) => {
  const p3 = fract(vec3(point.x, point.y, point.x).mul(vec3(0.1031, 0.103, 0.0973)));
  const mixed = p3.add(dot(p3, p3.yxz.add(33.33)));
  return fract(mixed.x.add(mixed.y).mul(mixed.z));
};

export function caveGrade(picture: Node<"vec4">) {
  const settings = {
    /** How strong the cross-processing is, from 0 (none) to 1. */
    strength: uniform(1),
    /** The dark the picture fades into, in sRGB. */
    dark: uniform(new Vector3()),
    /** Device pixels per CSS pixel, so the paper's grain stays the same size. */
    pixelRatio: uniform(1),
  };
  const drawn = picture.rgb;
  const light = dot(drawn, vec3(0.299, 0.587, 0.114));
  const bright = smoothstep(0.3, 0.9, light).mul(settings.strength);
  const shadow = smoothstep(0, 0.3, light).oneMinus().mul(settings.strength);
  // Highlights: hold red and green, pull blue down, towards yellow.
  const warmed = drawn.mul(mix(vec3(1), vec3(1.05, 1.01, 0.78), bright));
  // Shadows: tint towards indigo, and lift the blacks a touch into it.
  const graded = mix(warmed, warmed.mul(vec3(0.86, 0.8, 1.3)), shadow).add(
    vec3(0.012, 0.004, 0.035).mul(shadow),
  );
  const cell = floor(screenCoordinate.xy.div(settings.pixelRatio.mul(2)));
  const grain = paper(cell).mul(0.08).add(paper(cell.mul(0.37).add(17)).mul(0.03)).add(0.95);
  const corner = length(screenUV.sub(0.5).mul(vec2(1, 0.8))).mul(1.6);
  const vignetted = mix(graded.mul(grain), settings.dark, smoothstep(0.55, 1.1, corner).mul(0.3));
  const output = vec4(mix(settings.dark, vignetted, clamp(screenUV.y.div(FADE), 0, 1)), 1);
  return { output, settings };
}
