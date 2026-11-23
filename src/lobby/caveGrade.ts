/*
 * The finish on the cave's picture, for three's ShaderPass. It works on the
 * colours as drawn (sRGB, 0 to 1):
 *   - a slight cross-processed grade: bright colours lean towards yellow and
 *     dark ones towards indigo, like film developed in the wrong chemistry;
 *   - a vignette, darkening the corners into the cave's dark;
 *   - the grain of the paper it's painted on, still on the screen while the
 *     strokes move over it;
 *   - a fade into the dark across the top, behind the lobby's title.
 */
export const CAVE_GRADE = {
  name: "CaveGrade",
  uniforms: {
    tDiffuse: { value: null },
    /** How strong the cross-processing is, from 0 (none) to 1. */
    strength: { value: 1 },
    /** The dark the picture fades into, in sRGB. */
    dark: { value: [0, 0, 0] as [number, number, number] },
    /** Device pixels per CSS pixel, so the paper's grain stays the same size. */
    pixelRatio: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec3 dark;
    uniform float pixelRatio;
    varying vec2 vUv;

    /** How far down the picture the fade from the dark reaches. */
    const float FADE = 0.22;

    float paper(vec2 point) {
      vec3 p3 = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yxz + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 colour = texture2D(tDiffuse, vUv).rgb;
      float light = dot(colour, vec3(0.299, 0.587, 0.114));
      float bright = smoothstep(0.3, 0.9, light) * strength;
      float shadow = (1.0 - smoothstep(0.0, 0.3, light)) * strength;
      // Highlights: hold red and green, pull blue down, towards yellow.
      colour *= mix(vec3(1.0), vec3(1.05, 1.01, 0.78), bright);
      // Shadows: tint towards indigo, and lift the blacks a touch into it.
      colour = mix(colour, colour * vec3(0.86, 0.8, 1.3), shadow);
      colour += vec3(0.012, 0.004, 0.035) * shadow;

      vec2 cell = floor(gl_FragCoord.xy / (2.0 * pixelRatio));
      colour *= 0.95 + 0.08 * paper(cell) + 0.03 * paper(cell * 0.37 + 17.0);

      float corner = length((vUv - 0.5) * vec2(1.0, 0.8)) * 1.6;
      colour = mix(colour, dark, 0.3 * smoothstep(0.55, 1.1, corner));
      colour = mix(dark, colour, clamp((1.0 - vUv.y) / FADE, 0.0, 1.0));
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
};
