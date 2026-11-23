/* eslint-disable @typescript-eslint/no-magic-numbers */
import {
  BufferAttribute,
  CustomBlending,
  DataTexture,
  FloatType,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
} from "three";
import type { Matrix4 } from "three";
import { BRUSH, BRUSHES } from "./brushAtlas";
import { STRIDE } from "./splat";
import { PER_ROW, SPLAT, STROKE, TEXELS } from "./splatShaders";
import { splatSorter } from "./splatSort";

/*
 * Draws a cloud of Gaussian splats (splat.ts) lit by a few point lights, as
 * brush strokes: a quad per splat, stretched over its outline on screen and
 * blended back to front (splatShaders.ts). The splats sit still in a float
 * texture; only their order, one index per quad, changes when the camera has
 * moved far enough for them to be re-sorted (splatSort.ts).
 */

/** A light as the cloud sees it; its vectors are shared, so moving them moves the light. */
export interface SplatLight {
  at: Vector3;
  /** How far it has wandered from where it started, which the splats that belong to it follow. */
  moved: Vector3;
  colour: Vector3;
  reach: number;
}

function quadGeometry(count: number) {
  const order = new InstancedBufferAttribute(new Float32Array(count), 1);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("splat", order);
  geometry.instanceCount = count;
  return { geometry, order };
}

function splatTexture(data: Float32Array, rows: number) {
  const texels = new Float32Array(PER_ROW * rows * STRIDE);
  texels.set(data);
  const texture = new DataTexture(texels, PER_ROW * TEXELS, rows, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  return texture;
}

function brushTexture(brushes: Uint8Array) {
  const texture = new DataTexture(
    brushes,
    BRUSH.width * BRUSHES,
    BRUSH.height,
    RedFormat,
    UnsignedByteType,
  );
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function splatUniforms(splats: DataTexture, brushes: DataTexture, lights: readonly SplatLight[]) {
  return {
    splats: { value: splats },
    brushes: { value: brushes },
    viewport: { value: new Vector2(1, 1) },
    time: { value: 0 },
    drawProgress: { value: 1 },
    lightAt: { value: lights.map((light) => light.at) },
    lightMoved: { value: lights.map((light) => light.moved) },
    lightColour: { value: lights.map((light) => light.colour) },
    lightReach: { value: lights.map((light) => light.reach) },
    flicker: { value: lights.map(() => 1) },
    ambient: { value: new Vector3() },
    haze: { value: new Vector3() },
  };
}

export function splatCloud(
  data: Float32Array,
  brushes: Uint8Array,
  lights: readonly SplatLight[],
) {
  const count = data.length / STRIDE;
  const rows = Math.ceil(count / PER_ROW);
  const sort = splatSorter(data);
  const splats = splatTexture(data, rows);
  const brushStrip = brushTexture(brushes);
  const uniforms = splatUniforms(splats, brushStrip, lights);
  const { geometry, order } = quadGeometry(count);
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: SPLAT,
    fragmentShader: STROKE,
    defines: { LIGHTS: lights.length },
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    /** Re-orders the splats back to front for a camera's view (its matrixWorldInverse). */
    sortFor(view: Matrix4) {
      order.array.set(sort(view));
      order.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      splats.dispose();
      brushStrip.dispose();
    },
  };
}
