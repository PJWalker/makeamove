/*
 * A slight cross-processed grade, for three's ShaderPass: bright colours lean
 * towards yellow and dark ones towards indigo, like film developed in the
 * wrong chemistry. It works on the colours as drawn (sRGB, 0 to 1).
 */
export const CROSS_PROCESS = {
  name: "CrossProcess",
  uniforms: {

    tDiffuse: { value: null },
    /** How strong the grade is, from 0 (none) to 1. */
    strength: { value: 1 },
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
    varying vec2 vUv;

    void main() {
      vec3 colour = texture2D(tDiffuse, vUv).rgb;
      float light = dot(colour, vec3(0.299, 0.587, 0.114));
      float bright = smoothstep(0.3, 0.9, light) * strength;
      float dark = (1.0 - smoothstep(0.0, 0.3, light)) * strength;
      // Highlights: hold red and green, pull blue down, towards yellow.
      colour *= mix(vec3(1.0), vec3(1.05, 1.01, 0.78), bright);
      // Shadows: tint towards indigo, and lift the blacks a touch into it.
      colour = mix(colour, colour * vec3(0.86, 0.8, 1.3), dark);
      colour += vec3(0.012, 0.004, 0.035) * dark;
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
};
