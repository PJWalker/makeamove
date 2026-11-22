/* eslint-disable @typescript-eslint/no-magic-numbers */
import {
  BufferAttribute,
  CustomBlending,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3
  
} from "three";
import type {Matrix4} from "three";
import { MOTION, STRIDE } from "./splat";

/*
 * Draws a cloud of Gaussian splats (splat.ts) lit by a few point lights. Each
 * splat is a quad, sized and turned on the GPU to its ellipsoid's outline on
 * screen, and shaded as a soft Gaussian. They're blended back to front, so the
 * cloud is sorted by depth whenever the camera has moved far enough. The splats
 * sit still in a float texture, each a run of TEXELS texels along a row; only
 * their order, one index per quad, changes when they're sorted.
 */

const TEXELS = STRIDE / 4;
/** Splats in each row of the texture. */
const PER_ROW = 800;

const VERTEX = /* glsl */ `
  in float splat;

  uniform highp sampler2D splats;
  uniform vec2 viewport;
  uniform float time;
  uniform vec3 lightAt[LIGHTS];
  uniform vec3 lightMoved[LIGHTS];
  uniform vec3 lightColour[LIGHTS];
  uniform float lightReach[LIGHTS];
  uniform float flicker[LIGHTS];
  uniform vec3 ambient;
  uniform vec3 haze;

  out vec4 vColour;
  out vec2 vOffset;
  out float vGlow;
  out float vPhase;

  const float TAU = 6.2831853;
  /** How many standard deviations out each quad reaches. */
  const float EXTENT = 2.5;

  void hide() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }

  void main() {
    int index = int(splat);
    ivec2 base = ivec2((index % ${String(PER_ROW)}) * ${String(TEXELS)}, index / ${String(PER_ROW)});
    vec4 t0 = texelFetch(splats, base, 0);
    vec4 t1 = texelFetch(splats, base + ivec2(1, 0), 0);
    vec4 t2 = texelFetch(splats, base + ivec2(2, 0), 0);
    vec4 t3 = texelFetch(splats, base + ivec2(3, 0), 0);
    vec4 t4 = texelFetch(splats, base + ivec2(4, 0), 0);
    vec3 centre = t0.xyz;
    vec3 spreadX = vec3(t0.w, t1.xy);
    vec3 spreadYZ = vec3(t1.zw, t2.x);
    vec4 colour = vec4(t2.yzw, t3.x);
    vec3 facing = t3.yzw;
    vec3 motion = t4.xyz;
    float glow = t4.w;

    vec3 at = centre;
    float opacity = colour.a;
    float size = 1.0;
    vec3 tint = colour.rgb;
    int light = int(motion.y + 0.5) - 1;
    float phase = motion.z;
    float brightness = 1.0;
    if (light >= 0) {
      at += lightMoved[light];
      brightness = flicker[light];
    }
    if (motion.x == ${String(MOTION.flame)}.0) {
      float life = fract(time * 1.7 + phase);
      at += vec3(
        sin(time * 3.1 + phase * TAU) * 0.035 * life,
        life * 0.34,
        cos(time * 2.3 + phase * TAU) * 0.02 * life
      );
      size = 1.0 - life * 0.65;
      opacity *= smoothstep(0.0, 0.12, life) * (1.0 - life);
      tint *= mix(vec3(1.0, 0.82, 0.45), vec3(0.95, 0.22, 0.04), smoothstep(0.05, 0.75, life));
    } else if (motion.x == ${String(MOTION.orbit)}.0) {
      vec3 middle = lightAt[light];
      vec3 from = centre - (middle - lightMoved[light]);
      float turn = time * 1.4;
      float c = cos(turn);
      float s = sin(turn);
      at = middle + vec3(c * from.x - s * from.z, from.y + sin(time * 2.0 + phase * TAU) * 0.03, s * from.x + c * from.z);
    } else if (motion.x == ${String(MOTION.smoke)}.0) {
      float rise = fract(time * 0.22 + phase);
      at += vec3(
        sin(time * 0.5 + phase * TAU) * 0.5 * rise + rise * 0.4,
        rise * 1.8,
        cos(time * 0.4 + phase * 9.0) * 0.4 * rise
      );
      size = 1.0 + rise * 4.0;
      opacity *= smoothstep(0.0, 0.15, rise) * (1.0 - rise);
    } else if (motion.x == ${String(MOTION.drip)}.0) {
      // Hangs and swells for most of its cycle, then falls under gravity.
      float period = 4.0 + phase * 5.0;
      float cycle = fract(time / period + phase);
      float fall = max(0.0, cycle - 0.8) * period;
      size = 0.4 + 0.6 * smoothstep(0.0, 0.8, cycle);
      at.y -= 4.9 * fall * fall;
      if (at.y < 0.0) opacity = 0.0;
    } else if (motion.x == ${String(MOTION.drift)}.0) {
      float cycle = fract(time * 0.045 + phase);
      at += vec3(sin(time * 0.31 + phase * 17.0) * 0.35, cycle * 1.4 - 0.5, cos(time * 0.27 + phase * 11.0) * 0.3);
      opacity *= sin(3.14159 * cycle);
    }

    vec3 shade;
    if (glow > 0.5) {
      shade = tint * brightness;
    } else {
      vec3 normal = normalize(facing);
      vec3 lit = ambient;
      for (int index = 0; index < LIGHTS; index++) {
        vec3 toLight = lightAt[index] - at;
        float distance = length(toLight);
        float wrap = max(0.0, (dot(normal, toLight / distance) + 0.45) / 1.45);
        float falloff = pow(max(0.0, 1.0 - distance / lightReach[index]), 2.2);
        lit += lightColour[index] * flicker[index] * wrap * falloff;
      }
      shade = tint * lit;
    }

    vec4 view = modelViewMatrix * vec4(at, 1.0);
    if (view.z > -0.15 || opacity < 0.004) { hide(); return; }
    shade = mix(haze, shade, exp(-max(0.0, -view.z - 8.0) * (glow > 0.5 ? 0.03 : 0.05)));
    vColour = vec4(pow(max(shade, 0.0), vec3(1.0 / 2.2)), opacity);
    vGlow = glow;
    vPhase = phase;

    // The ellipsoid's outline on screen: its covariance, carried through the
    // camera and the perspective divide (linearised at its centre).
    mat3 spread = mat3(
      spreadX.x, spreadX.y, spreadX.z,
      spreadX.y, spreadYZ.x, spreadYZ.y,
      spreadX.z, spreadYZ.y, spreadYZ.z
    ) * (size * size);
    vec2 focal = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * viewport * 0.5;
    float inverse = 1.0 / -view.z;
    mat3 project = mat3(
      focal.x * inverse, 0.0, 0.0,
      0.0, focal.y * inverse, 0.0,
      focal.x * view.x * inverse * inverse, focal.y * view.y * inverse * inverse, 0.0
    );
    mat3 toScreen = project * mat3(modelViewMatrix);
    mat3 screen = toScreen * spread * transpose(toScreen);
    // A little blur, so splats smaller than a pixel don't shimmer.
    float a = screen[0][0] + 0.3;
    float b = screen[0][1];
    float d = screen[1][1] + 0.3;
    float middle = 0.5 * (a + d);
    float radius = length(vec2(0.5 * (a - d), b));
    float major = (middle + radius) * 2.2;
    float minor = max((middle - radius) * 0.9, 0.14);
    float flow =
      sin(at.z * 0.11 + at.x * 0.14) * 0.48 +
      sin(at.x * 0.22 - at.z * 0.07) * 0.24 +
      sin(at.y * 0.19 + at.x * 0.08) * 0.18;
    float angle = flow + fract(phase * 19.0) * 0.12;
    vec2 axis = vec2(cos(angle), sin(angle));
    vec2 offset =
      position.x * min(sqrt(major), 1024.0) * axis +
      position.y * min(sqrt(minor), 1024.0) * vec2(-axis.y, axis.x);
    vOffset = position.xy * EXTENT;
    vec4 clip = projectionMatrix * view;
    gl_Position = vec4(clip.xy / clip.w + offset * EXTENT * 2.0 / viewport, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  in vec4 vColour;
  in vec2 vOffset;
  in float vGlow;
  in float vPhase;

  float brushNoise(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 point = vOffset;
    float radial = dot(point, point);

    if (vGlow > 0.5) {
      float alpha = vColour.a * exp(-0.5 * radial);
      if (alpha < 1.0 / 255.0) discard;
      gl_FragColor = vec4(vColour.rgb * alpha, 0.0);
      return;
    }

    float angle = atan(point.y, point.x);
    float edgeNoise =
      sin(angle * 7.0 + vPhase * 41.0) * 0.012 +
      sin(angle * 13.0 - vPhase * 67.0) * 0.008;
    float edge = 1.0 - smoothstep(0.68 + edgeNoise, 1.06 + edgeNoise, radial);

    vec2 pigmentCell = floor(gl_FragCoord.xy / 2.1);
    float grain = brushNoise(pigmentCell + vec2(vPhase * 127.0, vPhase * 311.0));
    float bristle = 0.92 + 0.08 * grain;
    float stipple = 0.84 + 0.16 * brushNoise(pigmentCell * 0.73 + vec2(vPhase * 91.0, 1.0));
    float alpha = vColour.a * edge * bristle * mix(stipple, 1.0, smoothstep(0.2, 0.9, 1.0 - radial));

    if (alpha < 1.0 / 255.0) discard;
    gl_FragColor = vec4(vColour.rgb * alpha, alpha);
  }
`;

/** Orders a cloud's splats back to front, from a camera's point of view. */
function sorter(source: Float32Array) {
  const count = source.length / STRIDE;
  const order = new Float32Array(count);
  const depths = new Float32Array(count);
  const buckets = new Uint16Array(count);
  const starts = new Uint32Array(65_536);
  return (view: Matrix4) => {
    const { elements } = view;
    const [ex, ey, ez, ew] = [elements[2], elements[6], elements[10], elements[14]];
    let near = -Infinity;
    let far = Infinity;
    for (let index = 0; index < count; index++) {
      const row = index * STRIDE;
      const depth =
        ex * (source[row] ?? 0) + ey * (source[row + 1] ?? 0) + ez * (source[row + 2] ?? 0) + ew;
      depths[index] = depth;
      if (depth > near) near = depth;
      if (depth < far) far = depth;
    }
    const step = 65_535 / (near - far || 1);
    starts.fill(0);
    for (let index = 0; index < count; index++) {
      const bucket = Math.floor(((depths[index] ?? 0) - far) * step);
      buckets[index] = bucket;
      starts[bucket] = (starts[bucket] ?? 0) + 1;
    }
    let total = 0;
    for (let bucket = 0; bucket < starts.length; bucket++) {
      const size = starts[bucket] ?? 0;
      starts[bucket] = total;
      total += size;
    }
    for (let index = 0; index < count; index++) {
      const bucket = buckets[index] ?? 0;
      const place = starts[bucket] ?? 0;
      starts[bucket] = place + 1;
      order[place] = index;
    }
    return order;
  };
}

/** A light as the cloud sees it; its vectors are shared, so moving them moves the light. */
export interface SplatLight {
  at: Vector3;
  /** How far it has wandered from where it started, which the splats that belong to it follow. */
  moved: Vector3;
  colour: Vector3;
  reach: number;
}

export function splatCloud(data: Float32Array, lights: readonly SplatLight[]) {
  const count = data.length / STRIDE;
  const sort = sorter(data);
  const rows = Math.ceil(count / PER_ROW);
  const texels = new Float32Array(PER_ROW * rows * STRIDE);
  texels.set(data);
  const texture = new DataTexture(texels, PER_ROW * TEXELS, rows, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  const order = new InstancedBufferAttribute(new Float32Array(count), 1);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("splat", order);
  geometry.instanceCount = count;

  const uniforms = {
    splats: { value: texture },
    viewport: { value: new Vector2(1, 1) },
    time: { value: 0 },
    lightAt: { value: lights.map((light) => light.at) },
    lightMoved: { value: lights.map((light) => light.moved) },
    lightColour: { value: lights.map((light) => light.colour) },
    lightReach: { value: lights.map((light) => light.reach) },
    flicker: { value: lights.map(() => 1) },
    ambient: { value: new Vector3() },
    haze: { value: new Vector3() },
  };
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
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
      texture.dispose();
    },
  };
}
