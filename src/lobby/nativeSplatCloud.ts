/* eslint-disable max-lines-per-function, @typescript-eslint/max-params, @typescript-eslint/no-magic-numbers, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-destructuring, unicorn/no-zero-fractions */
import type { Matrix4 } from "three";
import { STRIDE } from "./splat";
import { sortSplatIndices } from "./splatCloud";

export interface NativeLight {
  at: readonly [number, number, number];
  moved: readonly [number, number, number];
  colour: readonly [number, number, number];
  reach: number;
}

export interface NativeSplatCloud {
  render: (view: Matrix4, projection: Matrix4, viewport: readonly [number, number], seconds: number, flicker: readonly number[]) => void;
  dispose: () => void;
}

const WGSL = /* wgsl */ `
struct Uniforms {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  viewportTime: vec4<f32>,
  lightAt: array<vec4<f32>, 3>,
  lightMoved: array<vec4<f32>, 3>,
  lightColour: array<vec4<f32>, 3>,
  lightReach: array<vec4<f32>, 3>,
  flicker: array<vec4<f32>, 3>,
};
@group(0) @binding(0) var<storage, read> splats: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> order: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

struct Varyings {
  @builtin(position) position: vec4<f32>,
  @location(0) colour: vec4<f32>,
  @location(1) offset: vec2<f32>,
  @location(2) phase: f32,
  @location(3) glow: f32,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> Varyings {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
  );
  let point = corners[vertexIndex];
  let row = order[instanceIndex] * 5u;
  let t0 = splats[row];
  let t1 = splats[row + 1u];
  let t2 = splats[row + 2u];
  let t3 = splats[row + 3u];
  let t4 = splats[row + 4u];

  var at = t0.xyz;
  let xx = t0.w;
  let yy = t1.z;
  let zz = t2.x;
  let colour = vec4<f32>(t2.yzw, t3.x);
  let facing = t3.yzw;
  let motion = t4.xyz;
  let glow = t4.w;
  let phase = motion.z;
  var opacity = colour.w;
  let tint = colour.xyz;
  let time = uniforms.viewportTime.w;

  if (motion.x > 0.5 && motion.x < 1.5) {
    let life = fract(time * 1.7 + phase);
    at = at + vec3<f32>(sin(time * 3.1 + phase * 6.2831853) * 0.035 * life, life * 0.34, cos(time * 2.3 + phase * 6.2831853) * 0.02 * life);
    opacity = opacity * smoothstep(0.0, 0.12, life) * (1.0 - life);
  } else if (motion.x > 1.5 && motion.x < 2.5) {
    let lightIndex = i32(motion.y + 0.5) - 1;
    if (lightIndex >= 0) {
      let middle = uniforms.lightAt[lightIndex].xyz;
      let from = at - (middle - uniforms.lightMoved[lightIndex].xyz);
      let turn = time * 1.4;
      let c = cos(turn);
      let s = sin(turn);
      at = middle + vec3<f32>(c * from.x - s * from.z, from.y + sin(time * 2.0 + phase * 6.2831853) * 0.03, s * from.x + c * from.z);
    }
  } else if (motion.x > 2.5 && motion.x < 3.5) {
    let cycle = fract(time * 0.045 + phase);
    at = at + vec3<f32>(sin(time * 0.31 + phase * 17.0) * 0.35, cycle * 1.4 - 0.5, cos(time * 0.27 + phase * 11.0) * 0.3);
  } else if (motion.x > 3.5 && motion.x < 4.5) {
    let rise = fract(time * 0.22 + phase);
    at = at + vec3<f32>(sin(time * 0.5 + phase * 6.2831853) * 0.5 * rise + rise * 0.4, rise * 1.8, cos(time * 0.4 + phase * 9.0) * 0.4 * rise);
    opacity = opacity * smoothstep(0.0, 0.15, rise) * (1.0 - rise);
  } else if (motion.x > 4.5 && motion.x < 5.5) {
    let period = 4.0 + phase * 5.0;
    let cycle = fract(time / period + phase);
    let fall = max(0.0, cycle - 0.8) * period;
    at.y = at.y - 4.9 * fall * fall;
    if (at.y < 0.0) { opacity = 0.0; }
  } else if (motion.x > 5.5 && motion.x < 6.5) {
    at = at + vec3<f32>(sin(time * 0.55 + phase * 6.2831853) * 0.018, 0.0, cos(time * 0.45 + phase * 6.2831853) * 0.008);
  }

  let view = uniforms.view * vec4<f32>(at, 1.0);
  if (view.z > -0.15 || opacity < 0.004) {
    var hidden: Varyings;
    hidden.position = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    hidden.colour = vec4<f32>(0.0);
    hidden.offset = vec2<f32>(0.0);
    hidden.phase = phase;
    hidden.glow = glow;
    return hidden;
  }

  let distance = max(0.1, -view.z);
  let worldSize = sqrt(max(xx, max(yy, zz)));
  let focalX = uniforms.projection[0][0] * uniforms.viewportTime.x * 0.5;
  let focalY = uniforms.projection[1][1] * uniforms.viewportTime.y * 0.5;
  let major = max(0.14, worldSize * focalX / distance * 2.2);
  let minor = max(0.14, worldSize * focalY / distance * 0.9);
  let flow = sin(at.z * 0.11 + at.x * 0.14 + time * 0.035) * 0.48
    + sin(at.x * 0.22 - at.z * 0.07 - time * 0.0245) * 0.24
    + sin(at.y * 0.19 + at.x * 0.08 + time * 0.01575) * 0.18;
  let angle = flow + fract(phase * 19.0) * 0.12;
  let axis = vec2<f32>(cos(angle), sin(angle));
  let pixelOffset = point.x * min(sqrt(major), 1024.0) * axis
    + point.y * min(sqrt(minor), 1024.0) * vec2<f32>(-axis.y, axis.x);

  var shade = tint;
  if (glow > 0.5) {
    shade = tint;
  } else {
    var lit = vec3<f32>(0.006, 0.007, 0.014);
    let normal = normalize(facing);
    for (var index = 0; index < 3; index++) {
      let toLight = uniforms.lightAt[index].xyz - at;
      let lightDistance = length(toLight);
      let direction = toLight / max(lightDistance, 0.001);
      let wrap = max(0.0, (dot(normal, direction) + 0.45) / 1.45);
      let falloff = pow(max(0.0, 1.0 - lightDistance / uniforms.lightReach[index].x), 2.2);
      lit = lit + uniforms.lightColour[index].xyz * uniforms.flicker[index].x * wrap * falloff;
    }
    shade = tint * lit;
  }

  let clip = uniforms.projection * view;
  var result: Varyings;
  result.position = vec4<f32>(clip.xy / clip.w + pixelOffset * 2.0 * 2.5 / uniforms.viewportTime.xy, 0.0, 1.0);
  result.colour = vec4<f32>(pow(max(shade, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)), opacity);
  result.offset = point * 2.5;
  result.phase = phase;
  result.glow = glow;
  return result;
}

fn brushNoise(point: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(point.x, point.y, point.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fragmentMain(varying: Varyings) -> @location(0) vec4<f32> {
  let radial = dot(varying.offset, varying.offset);
  if (varying.glow > 0.5) {
    let alpha = varying.colour.w * exp(-0.5 * radial);
    if (alpha < 1.0 / 255.0) { discard; }
    return vec4<f32>(varying.colour.xyz * alpha, 0.0);
  }

  let angle = atan2(varying.offset.y, varying.offset.x);
  let edgeNoise = sin(angle * 9.0 + varying.phase * 41.0) * 0.026
    + sin(angle * 21.0 - varying.phase * 67.0) * 0.018
    + sin(angle * 37.0 + varying.phase * 113.0) * 0.008;
  let edge = 1.0 - smoothstep(0.62 + edgeNoise, 0.96 + edgeNoise, radial);
  let pigmentCell = floor(varying.position.xy / 2.1);
  let grain = brushNoise(pigmentCell + vec2<f32>(varying.phase * 127.0, varying.phase * 311.0));
  let fibre = sin(varying.offset.x * 26.0 + varying.offset.y * 7.0 + varying.phase * 53.0);
  let fibreTwo = sin(varying.offset.x * 43.0 - varying.offset.y * 13.0 - varying.phase * 29.0) * 0.45;
  let taper = 1.0 - smoothstep(0.46, 1.0, abs(varying.offset.x));
  let widthFade = 1.0 - smoothstep(0.68, 1.0, abs(varying.offset.y));
  let bristleBand = 0.68 + 0.32 * smoothstep(-0.35, 0.75, sin(varying.offset.y * 19.0 + varying.phase * 47.0));
  let dryGap = 0.58 + 0.42 * smoothstep(0.18, 0.82, grain);
  let split = smoothstep(-0.18, 0.28, sin(varying.offset.x * 31.0 - varying.offset.y * 9.0 + varying.phase * 71.0));
  let bristle = (0.58 + 0.22 * grain + 0.12 * smoothstep(-0.8, 0.8, fibre + fibreTwo))
    * mix(dryGap, 1.0, bristleBand) * mix(0.72, 1.0, split);
  let stipple = 0.78 + 0.22 * brushNoise(pigmentCell * 0.73 + vec2<f32>(varying.phase * 91.0, 1.0));
  var alpha = varying.colour.w * edge * widthFade * taper * bristle * stipple;
  if (alpha < 1.0 / 255.0) { discard; }

  var colour = varying.colour.xyz;
  let light = dot(colour, vec3<f32>(0.299, 0.587, 0.114));
  let bright = smoothstep(0.3, 0.9, light);
  let dark = 1.0 - smoothstep(0.0, 0.3, light);
  colour = colour * mix(vec3<f32>(1.0), vec3<f32>(1.05, 1.01, 0.78), bright);
  colour = mix(colour, colour * vec3<f32>(0.86, 0.8, 1.3), dark);
  colour = colour + vec3<f32>(0.012, 0.004, 0.035) * dark;
  return vec4<f32>(colour * alpha, alpha);
}
`;

export async function createNativeSplatCloud(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  lights: readonly NativeLight[],
): Promise<NativeSplatCloud | undefined> {
  const gpuNavigator = navigator as Navigator & { gpu?: GPU };
  const gpu = gpuNavigator.gpu;
  if (!gpu) return undefined;
  const adapter = await gpu.requestAdapter();
  if (!adapter) return undefined;
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) return undefined;
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  const count = data.length / STRIDE;
  const splatBuffer = device.createBuffer({ size: data.byteLength, usage: 128 | 8 });
  device.queue.writeBuffer(splatBuffer, 0, data);
  const order = new Uint32Array(count);
  for (let index = 0; index < count; index++) order[index] = index;
  const orderBuffer = device.createBuffer({ size: order.byteLength, usage: 128 | 8 });
  device.queue.writeBuffer(orderBuffer, 0, order);
  const uniformBuffer = device.createBuffer({ size: 384, usage: 64 | 8 });
  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain" },
    fragment: { module, entryPoint: "fragmentMain", targets: [{ format, blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: splatBuffer } },
    { binding: 1, resource: { buffer: orderBuffer } },
    { binding: 2, resource: { buffer: uniformBuffer } },
  ] });

  let disposed = false;
  let lastOrderView: Matrix4 | undefined;
  return {
    render(view, projection, viewport, seconds, flicker) {
      if (disposed) return;
      if (!lastOrderView || view.elements.some((value, index) => value !== lastOrderView?.elements[index])) {
        device.queue.writeBuffer(orderBuffer, 0, sortSplatIndices(data, view));
        lastOrderView = view.clone();
      }
      const uniform = new Float32Array(96);
      uniform.set(view.elements, 0);
      uniform.set(projection.elements, 16);
      uniform[32] = viewport[0];
      uniform[33] = viewport[1];
      uniform[35] = seconds;
      let offset = 36;
      for (const light of lights) { uniform[offset] = light.at[0]; uniform[offset + 1] = light.at[1]; uniform[offset + 2] = light.at[2]; offset += 4; }
      offset = 48;
      for (const light of lights) { uniform[offset] = light.moved[0]; uniform[offset + 1] = light.moved[1]; uniform[offset + 2] = light.moved[2]; offset += 4; }
      offset = 60;
      for (const light of lights) { uniform[offset] = light.colour[0]; uniform[offset + 1] = light.colour[1]; uniform[offset + 2] = light.colour[2]; offset += 4; }
      offset = 72;
      for (const light of lights) { uniform[offset] = light.reach; offset += 4; }
      offset = 84;
      for (let index = 0; index < 3; index++) { uniform[offset] = flicker[index] ?? 1; offset += 4; }
      device.queue.writeBuffer(uniformBuffer, 0, uniform);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.016, g: 0.020, b: 0.039, a: 1 }, loadOp: "clear", storeOp: "store" }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, count);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    dispose() {
      disposed = true;
      splatBuffer.destroy();
      orderBuffer.destroy();
      uniformBuffer.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
