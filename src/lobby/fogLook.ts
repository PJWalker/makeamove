/** The look of the lobby's fog backdrop: the fog shader, its traces, the sparks along them and the bloom over it all. */

export const FOG = { speed: 1.1, scale: 0.85, brightness: 0.91, colour: 0x293347 } as const;

export const TRACES = { brightness: 0.46, width: 120, colour: 0x8c73ff } as const;

export const SPARKS = {
  count: 2,
  /** Fog space per second. */
  speed: 0.1,
  /** Seconds. */
  life: 8,
  /** Seconds a point of trail lasts. */
  trailLength: 0.6,
  /** Pixels. */
  size: 3,
  brightness: 1.15,
  /** Forks per second, per spark. */
  branchRate: 0.65,
  /** How strongly the fog carries a trail off, at its tail end. */
  trailDrift: 0.6,
} as const;

export const BLOOM = { threshold: 0.27, strength: 2.22, radius: 62 } as const;

export const rgb = (hex: number): [number, number, number] => [
  (hex >> 16) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

/** Writes a number as a GLSL float literal. */
export const glslFloat = (n: number) => n.toFixed(5);

/** Writes a colour as a GLSL vec3 literal. */
export const glslColour = (hex: number) => `vec3(${rgb(hex).map(glslFloat).join(", ")})`;
