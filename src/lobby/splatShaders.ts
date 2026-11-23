/* eslint-disable @typescript-eslint/no-magic-numbers */
import { BRUSHES } from "./brushAtlas";
import { MOTION, STRIDE } from "./splat";

/*
 * The shaders that draw a cloud of splats (splatCloud.ts). SPLAT works each
 * splat out at each corner of its quad: where its motion has taken it, how
 * the lights fall on it, and the outline of its ellipsoid on screen, which
 * the quad is stretched over. STROKE then paints the quad: a soft Gaussian
 * for a glowing splat, a brush stroke from the atlas (brushAtlas.ts) for the
 * rest. The quad hugs the stroke, so no pixels are shaded only to be thrown
 * away.
 */

/** Splats in each row of the splat texture. */
export const PER_ROW = 800;
/** Texels each splat takes in the splat texture. */
export const TEXELS = STRIDE / 4;

const glslInt = (value: number) => String(value);
const glslFloat = (value: number) => `${String(value)}.0`;

const EASE = /* glsl */ `
  float exponentialEaseOut(float value) {
    return 1.0 - pow(2.0, -10.0 * clamp(value, 0.0, 1.0));
  }
`;


export const SPLAT = /* glsl */ `
  in float splat;

  uniform highp sampler2D splats;
  uniform vec2 viewport;
  uniform float time;
  uniform float drawProgress;
  uniform vec3 lightAt[LIGHTS];
  uniform vec3 lightMoved[LIGHTS];
  uniform vec3 lightColour[LIGHTS];
  uniform float lightReach[LIGHTS];
  uniform float flicker[LIGHTS];
  uniform vec3 ambient;
  uniform vec3 haze;

  out vec4 vColour;
  out vec2 vOffset;
  out float vMajor;
  out float vGlow;
  out float vBrush;
  out float vStroke;

  const float TAU = 6.2831853;
  /** How long each stroke takes to paint in, as a share of the whole picture's. */
  const float STROKE = 0.38;
  /** How many standard deviations out a glowing splat's quad reaches; a stroke fills its quad. */
  const float GLOW_EXTENT = 2.5;

  ${EASE}

  float flowField(vec3 point) {
    float drift = time * 0.035;
    return
      sin(point.z * 0.11 + point.x * 0.14 + drift) * 0.48 +
      sin(point.x * 0.22 - point.z * 0.07 - drift * 0.7) * 0.24 +
      sin(point.y * 0.19 + point.x * 0.08 + drift * 0.45) * 0.18;
  }

  void hide() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }

  void main() {
    int index = int(splat);
    ivec2 base = ivec2((index % ${glslInt(PER_ROW)}) * ${glslInt(TEXELS)}, index / ${glslInt(PER_ROW)});
    vec4 t0 = texelFetch(splats, base, 0);
    vec4 t1 = texelFetch(splats, base + ivec2(1, 0), 0);
    vec4 t2 = texelFetch(splats, base + ivec2(2, 0), 0);
    vec4 t3 = texelFetch(splats, base + ivec2(3, 0), 0);
    vec4 t4 = texelFetch(splats, base + ivec2(4, 0), 0);
    vec3 centre = t0.xyz;
    vec3 spreadX = vec3(t0.w, t1.xy);
    vec3 spreadYZ = vec3(t1.zw, t2.x);
    vec3 tint = t2.yzw;
    float opacity = t3.x;
    vec3 facing = t3.yzw;
    vec3 motion = t4.xyz;
    float glow = t4.w;

    int light = int(motion.y + 0.5) - 1;
    float phase = motion.z;

    // Painting the picture in: each stroke starts at its own moment.
    float stagger = exponentialEaseOut(fract(phase * 1.618 + length(centre) * 0.031)) * 0.62;
    float painted = exponentialEaseOut(drawProgress);
    opacity *= smoothstep(stagger, stagger + STROKE, painted);
    float stroke = exponentialEaseOut((painted - stagger) / STROKE);

    vec3 at = centre;
    float size = 1.0;
    float brightness = 1.0;
    if (light >= 0) {
      at += lightMoved[light];
      brightness = flicker[light];
    }
    if (motion.x == ${glslFloat(MOTION.flame)}) {
      float life = fract(time * 1.7 + phase);
      float angle = flowField(at) + fract(phase * 19.0) * 0.12;
      at += vec3(
        cos(angle) * 0.09 * life + sin(time * 3.1 + phase * TAU) * 0.018 * life,
        life * 0.34,
        sin(angle) * 0.09 * life + cos(time * 2.3 + phase * TAU) * 0.012 * life
      );
      size = 1.0 - life * 0.65;
      opacity *= smoothstep(0.0, 0.12, life) * (1.0 - life);
      tint *= mix(vec3(1.0, 0.82, 0.45), vec3(0.95, 0.22, 0.04), smoothstep(0.05, 0.75, life));
    } else if (motion.x == ${glslFloat(MOTION.orbit)}) {
      vec3 middle = lightAt[light];
      vec3 from = centre - (middle - lightMoved[light]);
      float turn = time * 1.4;
      float c = cos(turn);
      float s = sin(turn);
      at = middle + vec3(c * from.x - s * from.z, from.y + sin(time * 2.0 + phase * TAU) * 0.03, s * from.x + c * from.z);
    } else if (motion.x == ${glslFloat(MOTION.smoke)}) {
      float rise = fract(time * 0.22 + phase);
      float angle = flowField(at) + fract(phase * 19.0) * 0.12;
      at += vec3(
        cos(angle) * rise * 0.55 + sin(time * 0.5 + phase * TAU) * 0.12 * rise,
        rise * 1.8,
        sin(angle) * rise * 0.55 + cos(time * 0.4 + phase * 9.0) * 0.12 * rise
      );
      size = 1.0 + rise * 4.0;
      opacity *= smoothstep(0.0, 0.15, rise) * (1.0 - rise);
    } else if (motion.x == ${glslFloat(MOTION.idle)}) {
      at += vec3(
        sin(time * 0.55 + phase * TAU) * 0.018,
        0.0,
        cos(time * 0.45 + phase * TAU) * 0.008
      );
    } else if (motion.x == ${glslFloat(MOTION.drip)}) {
      // Hangs and swells for most of its cycle, then falls under gravity.
      float period = 4.0 + phase * 5.0;
      float cycle = fract(time / period + phase);
      float fall = max(0.0, cycle - 0.8) * period;
      size = 0.4 + 0.6 * smoothstep(0.0, 0.8, cycle);
      at.y -= 4.9 * fall * fall;
      if (at.y < 0.0) opacity = 0.0;
    } else if (motion.x == ${glslFloat(MOTION.drift)}) {
      float cycle = fract(time * 0.045 + phase);
      float angle = flowField(at) + fract(phase * 19.0) * 0.12;
      at += vec3(
        cos(angle) * cycle * 0.55 + sin(time * 0.31 + phase * 17.0) * 0.08,
        cycle * 1.4 - 0.5,
        sin(angle) * cycle * 0.55 + cos(time * 0.27 + phase * 11.0) * 0.08
      );
      opacity *= sin(3.14159 * cycle);
    }

    vec4 seen = modelViewMatrix * vec4(at, 1.0);
    if (seen.z > -0.15 || opacity < 0.004) { hide(); return; }

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
        float falloff = max(0.0, 1.0 - distance / lightReach[index]);
        lit += lightColour[index] * flicker[index] * wrap * pow(falloff, 2.2);
      }
      shade = tint * lit;
    }
    shade = mix(haze, shade, exp(-max(0.0, -seen.z - 8.0) * (glow > 0.5 ? 0.03 : 0.05)));

    // The ellipsoid's outline on screen: its covariance, carried through the
    // camera and the perspective divide (linearised at its centre).
    mat3 spread = mat3(
      spreadX.x, spreadX.y, spreadX.z,
      spreadX.y, spreadYZ.x, spreadYZ.y,
      spreadX.z, spreadYZ.y, spreadYZ.z
    ) * (size * size);
    vec2 focal = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * viewport * 0.5;
    float inverse = 1.0 / -seen.z;
    mat3 project = mat3(
      focal.x * inverse, 0.0, 0.0,
      0.0, focal.y * inverse, 0.0,
      focal.x * seen.x * inverse * inverse, focal.y * seen.y * inverse * inverse, 0.0
    );
    mat3 toScreen = project * mat3(modelViewMatrix);
    mat3 screen = toScreen * spread * transpose(toScreen);
    // A little blur, so splats smaller than a pixel don't shimmer.
    float a = screen[0][0] + 0.3;
    float b = screen[0][1];
    float d = screen[1][1] + 0.3;
    float middle = 0.5 * (a + d);
    float radius = length(vec2(0.5 * (a - d), b));
    float major = min(sqrt((middle + radius) * 2.2), 1024.0);
    float minor = min(sqrt(max((middle - radius) * 0.9, 0.14)), 1024.0);
    // Strokes follow the flow of the rock rather than the ellipsoid's own axes.
    float angle = flowField(at) + fract(phase * 19.0) * 0.12;

    vec2 axis = vec2(cos(angle), sin(angle));
    float extent = glow > 0.5 ? GLOW_EXTENT : 1.0;
    vec2 offset = (position.x * major * axis + position.y * minor * vec2(-axis.y, axis.x)) * extent;
    vColour = vec4(pow(max(shade, 0.0), vec3(1.0 / 2.2)), opacity);
    vOffset = position.xy * extent;
    vMajor = position.x;
    vGlow = glow;
    vBrush = floor(fract(phase * 7.31) * ${glslFloat(BRUSHES)});
    vStroke = stroke;
    vec4 clip = projectionMatrix * seen;
    gl_Position = vec4(clip.xy / clip.w + offset * 2.0 / viewport, 0.0, 1.0);
  }
`;

export const STROKE = /* glsl */ `
  uniform sampler2D brushes;

  in vec4 vColour;
  in vec2 vOffset;
  in float vMajor;
  in float vGlow;
  in float vBrush;
  in float vStroke;

  layout(location = 0) out highp vec4 fragment;

  void main() {
    // While it's being painted in, the stroke's tip sweeps along it.
    float painted = 1.0;
    if (vStroke < 1.0) {
      float tip = vStroke * 2.3 - 1.15;
      painted = 1.0 - smoothstep(tip - 0.12, tip + 0.12, vMajor);
      if (painted < 0.004) discard;
    }

    if (vGlow > 0.5) {
      float alpha = vColour.a * exp(-0.5 * dot(vOffset, vOffset)) * painted;
      if (alpha < 1.0 / 255.0) discard;
      fragment = vec4(vColour.rgb * alpha, 0.0);
      return;
    }

    vec2 cell = vOffset * 0.5 + 0.5;
    float brush = texture(brushes, vec2((vBrush + cell.x) / ${glslFloat(BRUSHES)}, cell.y)).r;
    float alpha = vColour.a * brush * painted;
    if (alpha < 1.0 / 255.0) discard;
    fragment = vec4(vColour.rgb * alpha, alpha);
  }
`;
