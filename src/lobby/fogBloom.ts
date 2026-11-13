import {
  Filter,
  GlProgram,
  Texture,
  TexturePool,
  type FilterSystem,
  type RenderSurface,
} from "pixi.js";

/** Maps the input's frame onto the output's frame for the final composite, where both are the same size. */
const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/**
 * Stretches the whole input over the whole output, so a pass can scale the
 * image down or up. Pixi's standard filter vertex sizes the quad by the input,
 * which only suits same-size passes.
 */
const resampleVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  gl_Position = vec4(aPosition.x * 2.0 - 1.0, (aPosition.y * 2.0 - 1.0) * uOutputTexture.z, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

// Dual Kawase: each step down halves the image with a 5-tap filter, each step
// back up doubles it with an 8-tap one. Reach grows with the number of steps
// rather than the number of taps, so a wide glow stays smooth and cheap.

/** Halves the image. On the first step it also drops everything under the threshold. */
const downFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
// threshold, first step (1 or 0), offset
uniform vec4 uParams;

vec3 tap(vec2 uv) {
  vec3 c = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
  return uParams.y > 0.5 ? max(c - uParams.x, 0.0) : c;
}

void main() {
  vec2 h = uInputSize.zw * uParams.z;
  vec2 uv = vTextureCoord;
  vec3 sum = tap(uv) * 4.0;
  sum += tap(uv + vec2(-h.x, -h.y));
  sum += tap(uv + vec2(h.x, -h.y));
  sum += tap(uv + vec2(-h.x, h.y));
  sum += tap(uv + vec2(h.x, h.y));
  finalColor = vec4(sum / 8.0, 1.0);
}
`;

/** Doubles the image. */
const upFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
// unused, unused, offset
uniform vec4 uParams;

vec3 tap(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
}

void main() {
  vec2 h = uInputSize.zw * uParams.z;
  vec2 uv = vTextureCoord;
  vec3 sum = tap(uv + vec2(-2.0 * h.x, 0.0));
  sum += tap(uv + vec2(-h.x, h.y)) * 2.0;
  sum += tap(uv + vec2(0.0, 2.0 * h.y));
  sum += tap(uv + vec2(h.x, h.y)) * 2.0;
  sum += tap(uv + vec2(2.0 * h.x, 0.0));
  sum += tap(uv + vec2(h.x, -h.y)) * 2.0;
  sum += tap(uv + vec2(0.0, -2.0 * h.y));
  sum += tap(uv + vec2(-h.x, -h.y)) * 2.0;
  finalColor = vec4(sum / 12.0, 1.0);
}
`;

/** Adds the blurred glow back onto the scene. */
const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uStrength;
// How much of the (power-of-two) bloom texture the glow fills
uniform vec2 uBloomScale;

void main() {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 frameUv = vTextureCoord / (uOutputFrame.zw * uInputSize.zw);
  finalColor = vec4(base.rgb + texture(uBloom, frameUv * uBloomScale).rgb * uStrength, 1.0);
}
`;

const params = () => ({ uParams: { value: [0, 0, 0, 0], type: "vec4<f32>" as const } });

function pass(fragment: string, name: string) {
  return new Filter({
    glProgram: GlProgram.from({ vertex: resampleVertex, fragment, name }),
    resources: { passUniforms: params() },
  });
}

function setParams(filter: Filter, values: number[]) {
  const group = filter.resources.passUniforms as {
    uniforms: { uParams: number[] };
    update(): void;
  };
  group.uniforms.uParams = values;
  group.update();
}

/**
 * Bloom for a whole scene using a dual Kawase blur. `radius` is roughly how
 * far the glow reaches, in pixels, and can be large without banding or cost.
 */
export class DualKawaseBloom extends Filter {
  private readonly threshold: number;
  private readonly strength: number;
  private readonly radius: number;
  private readonly down = pass(downFragment, "bloom-down");
  private readonly up = pass(upFragment, "bloom-up");

  constructor(options: { threshold: number; strength: number; radius: number }) {
    super({
      glProgram: GlProgram.from({ vertex, fragment: compositeFragment, name: "bloom" }),
      resources: {
        uBloom: Texture.EMPTY.source,
        compositeUniforms: {
          uStrength: { value: 1, type: "f32" },
          uBloomScale: { value: [1, 1], type: "vec2<f32>" },
        },
      },
    });
    this.threshold = options.threshold;
    this.strength = options.strength;
    this.radius = options.radius;
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ) {
    // Each step down doubles the reach, so the step count follows the radius; the offset takes up the rest.
    const steps = Math.min(8, Math.max(1, Math.ceil(Math.log2(Math.max(this.radius, 2)))));
    const offset = Math.max(0.25, this.radius / 2 ** steps);
    const { width, height } = input.frame;
    const resolution = input.source.resolution;

    const chain: Texture[] = [];
    for (let i = 0; i < steps; i++) {
      const size = 2 ** (i + 1);
      chain.push(
        // Half float keeps the faint, wide glow free of banding once it's scaled up.
        TexturePool.getOptimalTexture({
          width: Math.max(1, Math.round(width / size)),
          height: Math.max(1, Math.round(height / size)),
          resolution,
          format: "rgba16float",
        }),
      );
    }

    for (let i = 0; i < steps; i++) {
      setParams(this.down, [this.threshold, i === 0 ? 1 : 0, offset, 0]);
      filterManager.applyFilter(this.down, i === 0 ? input : chain[i - 1]!, chain[i]!, true);
    }
    for (let i = steps - 1; i > 0; i--) {
      setParams(this.up, [0, 0, offset, 0]);
      filterManager.applyFilter(this.up, chain[i]!, chain[i - 1]!, true);
    }

    const glow = chain[0]!;
    const composite = this.resources.compositeUniforms as {
      uniforms: { uStrength: number; uBloomScale: number[] };
      update(): void;
    };
    // A wider blur spreads thin lines over more pixels, so make up for it to keep the glow's brightness.
    composite.uniforms.uStrength = this.strength * 4 * Math.max(1, this.radius / 16);
    composite.uniforms.uBloomScale = [
      (glow.frame.width * resolution) / glow.source.pixelWidth,
      (glow.frame.height * resolution) / glow.source.pixelHeight,
    ];
    composite.update();
    this.resources.uBloom = glow.source;
    filterManager.applyFilter(this, input, output, clearMode);
    this.resources.uBloom = Texture.EMPTY.source;

    for (const texture of chain) TexturePool.returnTexture(texture);
  }
}
