/* eslint-disable @typescript-eslint/no-magic-numbers */
import {
  BufferAttribute,
  CustomBlending,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
} from "three/webgpu";
import type { Matrix4, PerspectiveCamera } from "three/webgpu";
import { BRUSH, BRUSHES } from "./brushAtlas";
import { STRIDE } from "./splat";
import { PER_ROW, splatFragment, splatUniforms, splatVertex, TEXELS } from "./splatShaders";
import type { SplatLight } from "./splatShaders";
import splatSorter from "./splatSort";

/*
 * Draws a cloud of Gaussian splats (splat.ts) lit by a few point lights, as
 * brush strokes: a quad per splat, stretched over its outline on screen and
 * blended back to front (splatShaders.ts). The splats sit still in a float
 * texture; only their order, one index per quad, changes when the camera has
 * moved far enough for them to be re-sorted (splatSort.ts).
 */

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

function splatCloud(data: Float32Array, brushes: Uint8Array, lights: readonly SplatLight[]) {
  const count = data.length / STRIDE;
  const rows = Math.ceil(count / PER_ROW);
  const sort = splatSorter(data);
  const splats = splatTexture(data, rows);
  const brushStrip = brushTexture(brushes);
  const uniforms = splatUniforms(lights);
  const { geometry, order } = quadGeometry(count);
  const material = new NodeMaterial();
  material.vertexNode = splatVertex(splats, lights.length, uniforms);
  material.fragmentNode = splatFragment(brushStrip);
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;
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
    /** Takes in where the camera is, and how it projects, for this frame. */
    frame(camera: PerspectiveCamera) {
      uniforms.cameraTurn.value.setFromMatrix4(camera.matrixWorld);
      const { elements } = camera.projectionMatrix;
      uniforms.focal.value.set(elements[0], elements[5]);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      splats.dispose();
      brushStrip.dispose();
    },
  };
}

export default splatCloud;
