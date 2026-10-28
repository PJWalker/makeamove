import { Buffer, BufferUsage, Geometry, GlProgram, GpuProgram, Mesh, Shader, UniformGroup } from 'pixi.js'
import type { Point } from './grid'
import { distanceToSegment, type Segment } from './vision'

/*
 * A lamp's light, or a viewer's sight, worked out per pixel (M12). One quad
 * covers its reach; for each pixel the fragment shader adds up how much of
 * the lamp's disc each wall near it hides (`lampHidden` in scene/vision.ts,
 * which this mirrors), and lights the pixel by the falloff (`lightAlpha`)
 * times what's left. Drawn erasing, it lifts the dark it's drawn over.
 * Sight is the same with a lamp a pixel across and no falloff.
 */

/** Most walls one lamp takes into account: the nearest, if there are more. */
export const MAX_WALLS = 180
/** Most tokens one lamp shadows. */
export const MAX_BLOCKERS = 16

const glVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}
`

const glFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;
// x, y, radius, 1 for sight
uniform vec4 uLamp;
// bright, dim, walls, blockers
uniform vec4 uFalloff;
uniform vec4 uWalls[${MAX_WALLS}];
// Pairs: the segment, then (strength, fade from, fade to, 0).
uniform vec4 uBlockers[${MAX_BLOCKERS * 2}];

const float PI = 3.14159265;

float discShare(float t) {
  float c = clamp(t, -1.0, 1.0);
  return 0.5 + (c * sqrt(1.0 - c * c) + asin(c)) / PI;
}

float hidden(vec2 p, vec4 s) {
  vec2 to = uLamp.xy - p;
  float dist = length(to);
  if (dist < 1e-6) return 0.0;
  vec2 dir = to / dist;
  vec2 a = s.xy - p;
  vec2 b = s.zw - p;
  float da = dot(a, dir);
  float db = dot(b, dir);
  float near = dist * 1e-4;
  if (max(da, db) <= near || min(da, db) >= dist) return 0.0;
  if (da < near) { a = mix(a, b, (near - da) / (db - da)); da = near; }
  else if (db < near) { b = mix(a, b, (near - da) / (db - da)); db = near; }
  if (da > dist) { a = mix(a, b, (dist - da) / (db - da)); da = dist; }
  else if (db > dist) { b = mix(a, b, (dist - da) / (db - da)); db = dist; }
  vec2 n = vec2(-dir.y, dir.x);
  float r = max(uLamp.z, 1e-6);
  return abs(discShare(dot(b, n) * dist / (db * r)) - discShare(dot(a, n) * dist / (da * r)));
}

float lightAlpha(float d) {
  float reach = max(max(uFalloff.y, uFalloff.x * 1.15), 1.0);
  float b = min(uFalloff.x, reach) / reach;
  float f = d / reach;
  if (f >= 1.0) return 0.0;
  if (f < b) return 1.0 - 0.1 * (f / b) * (f / b);
  float u = (f - b) / (1.0 - b);
  return 0.9 * (1.0 - u * u * (3.0 - 2.0 * u));
}

void main() {
  float d = distance(vWorld, uLamp.xy);
  float light = uLamp.w > 0.5 ? 1.0 : lightAlpha(d);
  float hid = 0.0;
  int walls = int(uFalloff.z);
  for (int i = 0; i < ${MAX_WALLS}; i++) {
    if (i >= walls || hid >= 1.0 || light <= 0.0) break;
    hid += hidden(vWorld, uWalls[i]);
  }
  int blockers = int(uFalloff.w);
  for (int i = 0; i < ${MAX_BLOCKERS}; i++) {
    if (i >= blockers || hid >= 1.0 || light <= 0.0) break;
    vec4 f = uBlockers[i * 2 + 1];
    hid += f.x * hidden(vWorld, uBlockers[i * 2]) * (1.0 - smoothstep(f.y, f.z, d));
  }
  finalColor = vec4(light * (1.0 - min(hid, 1.0)));
}
`

const wgsl = /* wgsl */ `
struct GlobalUniforms {
  uProjectionMatrix: mat3x3<f32>,
  uWorldTransformMatrix: mat3x3<f32>,
  uWorldColorAlpha: vec4<f32>,
  uResolution: vec2<f32>,
}
@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;

struct LocalUniforms {
  uTransformMatrix: mat3x3<f32>,
  uColor: vec4<f32>,
  uRound: f32,
}
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;

struct LampUniforms {
  uLamp: vec4<f32>,
  uFalloff: vec4<f32>,
  uWalls: array<vec4<f32>, ${MAX_WALLS}>,
  uBlockers: array<vec4<f32>, ${MAX_BLOCKERS * 2}>,
}
@group(2) @binding(0) var<uniform> lampUniforms: LampUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec2<f32>,
}

@vertex
fn mainVert(@location(0) aPosition: vec2<f32>) -> VertexOutput {
  let mvp = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
  var out: VertexOutput;
  out.position = vec4<f32>((mvp * vec3<f32>(aPosition, 1.0)).xy, 0.0, 1.0);
  out.world = aPosition;
  return out;
}

const PI = 3.14159265;

fn discShare(t: f32) -> f32 {
  let c = clamp(t, -1.0, 1.0);
  return 0.5 + (c * sqrt(1.0 - c * c) + asin(c)) / PI;
}

fn hidden(p: vec2<f32>, s: vec4<f32>) -> f32 {
  let lamp = lampUniforms.uLamp;
  let to = lamp.xy - p;
  let dist = length(to);
  if (dist < 1e-6) { return 0.0; }
  let dir = to / dist;
  var a = s.xy - p;
  var b = s.zw - p;
  var da = dot(a, dir);
  var db = dot(b, dir);
  let near = dist * 1e-4;
  if (max(da, db) <= near || min(da, db) >= dist) { return 0.0; }
  if (da < near) { a = mix(a, b, (near - da) / (db - da)); da = near; }
  else if (db < near) { b = mix(a, b, (near - da) / (db - da)); db = near; }
  if (da > dist) { a = mix(a, b, (dist - da) / (db - da)); da = dist; }
  else if (db > dist) { b = mix(a, b, (dist - da) / (db - da)); db = dist; }
  let n = vec2<f32>(-dir.y, dir.x);
  let r = max(lamp.z, 1e-6);
  return abs(discShare(dot(b, n) * dist / (db * r)) - discShare(dot(a, n) * dist / (da * r)));
}

fn lightAlpha(d: f32) -> f32 {
  let fo = lampUniforms.uFalloff;
  let reach = max(max(fo.y, fo.x * 1.15), 1.0);
  let b = min(fo.x, reach) / reach;
  let f = d / reach;
  if (f >= 1.0) { return 0.0; }
  if (f < b) { return 1.0 - 0.1 * (f / b) * (f / b); }
  let u = (f - b) / (1.0 - b);
  return 0.9 * (1.0 - u * u * (3.0 - 2.0 * u));
}

@fragment
fn mainFrag(@location(0) world: vec2<f32>) -> @location(0) vec4<f32> {
  let lamp = lampUniforms.uLamp;
  let d = distance(world, lamp.xy);
  var light = 1.0;
  if (lamp.w < 0.5) { light = lightAlpha(d); }
  var hid = 0.0;
  let walls = min(i32(lampUniforms.uFalloff.z), ${MAX_WALLS});
  for (var i = 0; i < walls; i++) {
    if (hid >= 1.0 || light <= 0.0) { break; }
    hid += hidden(world, lampUniforms.uWalls[i]);
  }
  let blockers = min(i32(lampUniforms.uFalloff.w), ${MAX_BLOCKERS});
  for (var i = 0; i < blockers; i++) {
    if (hid >= 1.0 || light <= 0.0) { break; }
    let f = lampUniforms.uBlockers[i * 2 + 1];
    hid += f.x * hidden(world, lampUniforms.uBlockers[i * 2]) * (1.0 - smoothstep(f.y, f.z, d));
  }
  return vec4<f32>(light * (1.0 - min(hid, 1.0)));
}
`

let programs: { gl: GlProgram; gpu: GpuProgram } | null = null

/** Something that shadows a lamp's light part way, fading out with distance from the lamp: a token. */
export interface Blocker {
  seg: Segment
  strength: number
  fade: [number, number]
}

export interface LampState {
  at: Point
  /** The lamp's radius: how soft its shadows are. */
  radius: number
  /** Its falloff; null for sight, which is full everywhere it reaches. */
  falloff: { bright: number; dim: number } | null
  /** The area it's drawn over, in world space. */
  box: { x: number; y: number; w: number; h: number }
  walls: Segment[]
  blockers?: Blocker[]
}

/** A lamp or a viewer's sight: one quad, erased from the dark it's drawn over. */
export class Lamp {
  readonly mesh: Mesh<Geometry, Shader>
  private readonly uniforms: UniformGroup
  private readonly positions = new Float32Array(8)

  constructor() {
    programs ??= {
      gl: GlProgram.from({ vertex: glVertex, fragment: glFragment, name: 'lamp' }),
      gpu: GpuProgram.from({
        vertex: { source: wgsl, entryPoint: 'mainVert' },
        fragment: { source: wgsl, entryPoint: 'mainFrag' },
        name: 'lamp',
      }),
    }
    this.uniforms = new UniformGroup({
      uLamp: { value: new Float32Array(4), type: 'vec4<f32>' },
      uFalloff: { value: new Float32Array(4), type: 'vec4<f32>' },
      uWalls: { value: new Float32Array(MAX_WALLS * 4), type: 'vec4<f32>', size: MAX_WALLS },
      uBlockers: { value: new Float32Array(MAX_BLOCKERS * 8), type: 'vec4<f32>', size: MAX_BLOCKERS * 2 },
    })
    const geometry = new Geometry({
      // A bare array would make a buffer the GPU never rewrites; the quad moves with its lamp.
      attributes: {
        aPosition: {
          buffer: new Buffer({ data: this.positions, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST }),
          format: 'float32x2',
        },
      },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    })
    const shader = new Shader({ glProgram: programs.gl, gpuProgram: programs.gpu, resources: { lampUniforms: this.uniforms } })
    this.mesh = new Mesh({ geometry, shader, blendMode: 'erase' })
  }

  update(s: LampState) {
    const { x, y, w, h } = s.box
    this.positions.set([x, y, x + w, y, x + w, y + h, x, y + h])
    this.mesh.geometry.getBuffer('aPosition').update()

    const u = this.uniforms.uniforms
    const lamp = u.uLamp as Float32Array
    lamp.set([s.at.x, s.at.y, s.radius, s.falloff ? 0 : 1])
    // The nearest walls, if there are more than fit.
    const walls =
      s.walls.length > MAX_WALLS
        ? [...s.walls].sort((a, b) => distanceToSegment(s.at, a) - distanceToSegment(s.at, b)).slice(0, MAX_WALLS)
        : s.walls
    const wallData = u.uWalls as Float32Array
    walls.forEach((seg, i) => wallData.set([seg.a.x, seg.a.y, seg.b.x, seg.b.y], i * 4))
    const blockers = (s.blockers ?? []).slice(0, MAX_BLOCKERS)
    const blockerData = u.uBlockers as Float32Array
    blockers.forEach((b, i) => blockerData.set([b.seg.a.x, b.seg.a.y, b.seg.b.x, b.seg.b.y, b.strength, b.fade[0], b.fade[1], 0], i * 8))
    ;(u.uFalloff as Float32Array).set([s.falloff?.bright ?? 0, s.falloff?.dim ?? 0, walls.length, blockers.length])
    this.uniforms.update()
  }

  destroy() {
    this.mesh.shader?.destroy()
    this.mesh.geometry.destroy()
    this.mesh.destroy()
  }
}
