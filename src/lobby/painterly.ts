import { ShaderMaterial, Vector2 } from "three";

/*
 * Paints the cave's finished picture over, for three's ShaderPass: the
 * lobby's art direction is an oil painting of a pixel-art dungeon.
 *
 * - Brushwork: each pixel is smeared along a stroke that follows the
 *   picture's contours, wandering with a slow flow field where the picture is
 *   flat, and given bristle grooves and a raised, lit edge like impasto.
 * - A night sky through a chasm in the cave roof: wind curling into great
 *   swirls, stars ringed with halos, and a crescent moon, all procedural.
 * - Chunky pixels: the stage renders at a fraction of the screen's resolution
 *   and the canvas is scaled up without smoothing; here the colours are
 *   posterised with ordered dither, like a limited pixel-art palette.
 * - A grade: highlights towards chrome yellow, shadows towards ultramarine.
 *
 * It works on the colours as drawn (sRGB, 0 to 1). `resolution` is the size
 * of the buffer in pixels.
 */
export default function painterly() {
  const uniforms = {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(1, 1) },
    /** Seconds, for the sky's slow turning and the stars' twinkle. */
    time: { value: 0 },
    /** Where the eye has swayed to, from -1 to 1 each way, for a little parallax in the sky. */
    sway: { value: new Vector2() },
  };
  return {
    material: new ShaderMaterial({
      name: "Painterly",
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }),
    uniforms,
  };
}

const VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

const FRAGMENT = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform vec2 sway;
    varying vec2 vUv;

    const float TAU = 6.2831853;
    const vec3 ULTRAMARINE = vec3(0.07, 0.12, 0.34);
    const vec3 COBALT = vec3(0.16, 0.31, 0.62);
    const vec3 CERULEAN = vec3(0.42, 0.62, 0.82);
    const vec3 CHROME = vec3(0.98, 0.82, 0.3);
    const vec3 LEMON = vec3(1.0, 0.95, 0.66);

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x),
        u.y
      );
    }
    float fbm(vec2 p) {
      float sum = 0.0;
      float weight = 0.5;
      for (int octave = 0; octave < 4; octave++) {
        sum += weight * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        weight *= 0.5;
      }
      return sum / 0.9375;
    }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 at(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }

    /** Turns p about a vortex at c, most at its eye and fading out past its radius. */
    vec2 swirl(vec2 p, vec2 c, float turns, float radius) {
      vec2 d = p - c;
      float angle = turns * TAU * exp(-dot(d, d) / (radius * radius));
      float s = sin(angle);
      float k = cos(angle);
      return c + mat2(k, s, -s, k) * d;
    }

    /** Ordered dither, 0 to 1, for a pixel. */
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    /** Now and then, a spike of rock jutting up, for x in cells of 1. */
    float crag(float x) {
      float h = hash(vec2(floor(x), 2.0));
      return smoothstep(0.55, 1.0, h) * max(0.0, 1.0 - abs(fract(x) - 0.5) * 2.0 / 0.7);
    }

    /** Where the chasm's edge is, as a height up the picture, at x; it's flatter on a narrow screen. */
    float chasm(float x, float aspect) {
      float sides = pow(abs(x - 0.5) * 2.0 * min(1.0, aspect), 2.2);
      return 0.71 + 0.2 * sides
        + 0.06 * (fbm(vec2(x * 7.0, 3.1)) - 0.5)
        + 0.018 * (noise(vec2(x * 46.0, 8.0)) - 0.5)
        + crag(x * 23.0) * 0.05 + crag(x * 61.0 + 0.5) * 0.02;
    }

    /** A star of Van Gogh's sort: a bright heart ringed with halos. */
    vec3 star(vec2 q, vec2 c, float size, float phase) {
      float d = length(q - c) / size;
      float heart = 1.0 - smoothstep(0.0, 1.0, d);
      float halo = exp(-d * 0.9) * 0.55;
      float rings = pow(0.5 + 0.5 * cos(d * 4.2 - time * 0.8 - phase), 6.0) * exp(-d * 0.42) * 0.7;
      float twinkle = 0.85 + 0.15 * sin(time * 1.7 + phase * 3.0);
      return (mix(CHROME, LEMON, heart) * (heart * 1.4 + halo) + mix(CERULEAN, CHROME, 0.6) * rings) * twinkle;
    }

    /** The night sky at q (the picture's x scaled to its aspect, y up from the middle). */
    vec3 sky(vec2 q, float aspect) {
      // Wind blows across the sky in streams; the vortices curl them into swirls.
      float drift = time * 0.012;
      vec2 p = q - sway * 0.015;
      p = swirl(p, vec2(-0.12 * aspect, 0.36), 0.55 + 0.04 * sin(time * 0.1), 0.17);
      p = swirl(p, vec2(0.07 * aspect, 0.41), -0.45, 0.12);
      p = swirl(p, vec2(-0.38 * aspect, 0.44), 0.3, 0.1);
      float body = fbm(p * vec2(3.0, 9.0) + vec2(drift, 0.0));
      float streaks = noise(p * vec2(5.0, 64.0) + vec2(drift * 3.0, 0.0));
      float wind = smoothstep(0.55, 0.85, fbm(p * vec2(1.5, 5.0) - vec2(drift, 0.0)));
      vec3 colour = mix(ULTRAMARINE, COBALT, body);
      colour = mix(colour, CERULEAN, wind * 0.55);
      colour += mix(COBALT, LEMON, wind * 0.6) * smoothstep(0.55, 0.95, streaks) * 0.35;
      colour *= 0.82 + 0.3 * streaks;

      // The stars, kept clear of the middle where the title sits, and smaller on a narrow screen.
      float k = sqrt(min(1.0, aspect / 1.6));
      colour += star(q, vec2(-0.43 * aspect, 0.33), 0.012 * k, 0.0);
      colour += star(q, vec2(-0.3 * aspect, 0.43), 0.009 * k, 1.3);
      colour += star(q, vec2(-0.2 * aspect, 0.29), 0.007 * k, 2.1);
      colour += star(q, vec2(0.2 * aspect, 0.31), 0.008 * k, 3.7);
      colour += star(q, vec2(0.29 * aspect, 0.45), 0.006 * k, 4.4);
      colour += star(q, vec2(-0.05 * aspect, 0.47), 0.005 * k, 5.9);

      // A crescent moon, burning orange-yellow in its own halo.
      vec2 moon = vec2(0.4 * aspect, 0.38);
      vec2 fromMoon = (q - moon) / k;
      float m = length(fromMoon);
      float lit = (1.0 - smoothstep(0.03, 0.034, m)) * smoothstep(0.024, 0.029, length(fromMoon - vec2(-0.014, 0.008)));
      float glow = exp(-m * 14.0) * 0.8 + pow(0.5 + 0.5 * cos(m * 130.0 - time * 0.6), 8.0) * exp(-m * 9.0) * 0.5;
      colour = mix(colour, vec3(1.0, 0.78, 0.28), lit);
      colour += vec3(0.95, 0.75, 0.3) * glow;
      return colour;
    }

    /** How many pixels apart the brush's dabs are. */
    const float DAB = 4.0;

    /** Which way the brush goes at uv: along the picture's contours where it
     *  has them, otherwise along a slowly wandering flow. */
    vec2 strokeAt(vec2 uv, vec2 texel) {
      vec2 gradient = vec2(
        luma(at(uv + vec2(texel.x, 0.0))) - luma(at(uv - vec2(texel.x, 0.0))),
        luma(at(uv + vec2(0.0, texel.y))) - luma(at(uv - vec2(0.0, texel.y)))
      ) * 0.5 + vec2(
        luma(at(uv + vec2(texel.x * 2.0, 0.0))) - luma(at(uv - vec2(texel.x * 2.0, 0.0))),
        luma(at(uv + vec2(0.0, texel.y * 2.0))) - luma(at(uv - vec2(0.0, texel.y * 2.0)))
      ) * 0.5;
      float wander = fbm(uv * vec2(4.0, 2.5) + vec2(time * 0.01, 0.0)) * TAU * 1.5;
      vec2 flow = vec2(cos(wander), sin(wander));
      float strength = length(gradient);
      if (strength < 0.0001) return flow;
      vec2 contour = vec2(-gradient.y, gradient.x) / strength;
      if (dot(contour, flow) < 0.0) contour = -contour;
      return normalize(mix(flow, contour, smoothstep(0.01, 0.08, strength)) + 1e-4);
    }

    void main() {
      vec2 texel = 1.0 / resolution;
      float aspect = resolution.x / resolution.y;
      vec2 q = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
      vec2 pixel = vUv * resolution;

      // The brushwork: the picture is laid down in short dabs, each a
      // single colour taken from its middle, turned along the picture's
      // contours, or along a slowly wandering flow where it's flat. Each
      // pixel belongs to the nearest dab, measured in that dab's own long,
      // narrow shape, so they overlap like strokes rather than tiles.
      vec2 cellAt = floor(pixel / DAB);
      float nearest = 1e9;
      vec3 paint = vec3(0.0);
      vec2 offset = vec2(0.0);
      vec2 across = vec2(0.0, 1.0);
      float seed = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 cell = cellAt + vec2(float(i), float(j));
          vec2 jitter = vec2(hash(cell), hash(cell + 17.31));
          vec2 centre = (cell + jitter) * DAB;
          vec2 along = strokeAt(centre / resolution, texel);
          vec2 d = pixel - centre;
          vec2 shape = vec2(dot(d, along), dot(d, vec2(-along.y, along.x)))
            / (DAB * vec2(1.15 + 0.5 * jitter.x, 0.42 + 0.18 * jitter.y));
          float reach = length(shape) + jitter.y * 0.35;
          if (reach < nearest) {
            nearest = reach;
            paint = at(centre / resolution);
            offset = d;
            across = vec2(-along.y, along.x);
            seed = jitter.x;
          }
        }
      }
      // Keep the finest detail (flames, blades, the stars on a robe) where the picture has it.
      vec3 here = at(vUv);
      paint = mix(paint, here, 0.2 + 0.5 * smoothstep(0.15, 0.5, abs(luma(here) - luma(paint))));

      // Lift the cave out of the murk, as paint can't be truly black.
      paint = paint * 1.7 / (1.0 + paint * 0.7);
      float light = luma(paint);

      // Bristle grooves along each dab, and its rim raised and lit from above like impasto.
      paint *= 0.9 + 0.12 * sin(dot(offset, across) * 2.6 + seed * TAU);
      float rim = smoothstep(0.55, 1.1, nearest);
      float facing = dot(normalize(offset + 1e-4), normalize(vec2(-0.4, 1.0)));
      paint *= 1.0 + rim * facing * 0.35 * smoothstep(0.02, 0.3, light);

      // Broken colour: each dab leans a little towards chrome or towards cobalt.
      paint += (seed - 0.5) * vec3(0.09, 0.04, -0.1) * smoothstep(0.02, 0.25, light);
      paint += (0.5 - seed) * COBALT * 0.14 * (1.0 - smoothstep(0.0, 0.2, light));

      // The chasm in the roof, its lip a ragged dark silhouette with the sky's light on it.
      float lip = chasm(vUv.x + sway.x * 0.004, aspect);
      float open = step(lip, vUv.y);
      float below = lip - vUv.y;
      vec3 colour = paint;
      colour *= 1.0 - (1.0 - smoothstep(0.0, 0.08, below)) * 0.85 * (1.0 - open);
      colour += COBALT * 0.35 * exp(-max(below, 0.0) * 30.0) * (1.0 - open);
      colour += CERULEAN * 0.5 * (1.0 - smoothstep(0.0, 0.006, abs(below))) * (1.0 - open);
      colour = mix(colour, sky(q, aspect), open);

      // A grade: highlights lean to chrome yellow, shadows to ultramarine.
      float brightness = luma(colour);
      float bright = smoothstep(0.35, 0.9, brightness);
      float dark = 1.0 - smoothstep(0.0, 0.3, brightness);
      colour *= mix(vec3(1.0), vec3(1.06, 1.0, 0.74), bright);
      colour = mix(colour, colour * vec3(0.9, 0.92, 1.3), dark);
      colour += ULTRAMARINE * 0.16 * dark;
      colour = mix(vec3(luma(colour)), colour, 1.18);

      // Darken the corners, as a painting in a dim room.
      vec2 v = vUv - 0.5;
      colour *= 1.0 - dot(v, v) * 0.45;

      // A limited palette, dithered between its steps, which are closer together in the dark.
      const float LEVELS = 12.0;
      colour = sqrt(clamp(colour, 0.0, 1.0));
      colour = floor(colour * LEVELS + 0.2 + 0.6 * bayer4(pixel)) / LEVELS;
      colour *= colour;
      gl_FragColor = vec4(colour, 1.0);
    }
  `;
