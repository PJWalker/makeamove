/* eslint-disable @typescript-eslint/no-magic-numbers, new-cap */
import {
  attribute,
  cameraProjectionMatrix,
  clamp,
  cos,
  Discard,
  dot,
  exp,
  float,
  floor,
  fract,
  Fn,
  If,
  int,
  ivec2,
  length,
  Loop,
  mat3,
  max,
  min,
  mix,
  modelViewMatrix,
  normalize,
  positionGeometry,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  textureLoad,
  uniform,
  uniformArray,
  varyingProperty,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Matrix3, Vector2, Vector3 } from "three/webgpu";
import type { DataTexture, Node } from "three/webgpu";
import { BRUSHES } from "./brushAtlas";
import { MOTION, STRIDE } from "./splat";

/*
 * The shaders that draw a cloud of splats (splatCloud.ts), in TSL, so three
 * builds them for WebGPU or, where that's missing, WebGL. The vertex stage
 * works each splat out at each corner of its quad: where its motion has taken
 * it, how the lights fall on it, and the outline of its ellipsoid on screen,
 * which the quad is stretched over. The fragment stage paints the quad: a soft
 * Gaussian for a glowing splat, a brush stroke from the atlas (brushAtlas.ts)
 * for the rest. The quad hugs the stroke, so no pixels are shaded only to be
 * thrown away.
 */

/** Splats in each row of the splat texture. */
export const PER_ROW = 800;
/** Texels each splat takes in the splat texture. */
export const TEXELS = STRIDE / 4;

const TAU = 6.283_185_3;
/** How long each stroke takes to paint in, as a share of the whole picture's. */
const STROKE = 0.38;
/** How many standard deviations out a glowing splat's quad reaches; a stroke fills its quad. */
const GLOW_EXTENT = 2.5;

/** A light as the cloud sees it; its vectors are shared, so moving them moves the light. */
export interface SplatLight {
  at: Vector3;
  /** How far it has wandered from where it started, which the splats that belong to it follow. */
  moved: Vector3;
  colour: Vector3;
  reach: number;
}

/** The values the shaders take from the stage, updated each frame. */
export function splatUniforms(lights: readonly SplatLight[]) {
  return {
    viewport: uniform(new Vector2(1, 1)),
    /** The projection's scale along each screen axis. */
    focal: uniform(new Vector2(1, 1)),
    /** The camera's rotation, from its own axes into the world's. */
    cameraTurn: uniform(new Matrix3()),
    time: uniform(0),
    drawProgress: uniform(1),
    lightAt: uniformArray<"vec3">(
      lights.map((light) => light.at),
      "vec3",
    ),
    lightMoved: uniformArray<"vec3">(
      lights.map((light) => light.moved),
      "vec3",
    ),
    lightColour: uniformArray<"vec3">(
      lights.map((light) => light.colour),
      "vec3",
    ),
    lightReach: uniformArray<"float">(
      lights.map((light) => light.reach),
      "float",
    ),
    flicker: uniformArray<"float">(
      lights.map(() => 1),
      "float",
    ),
    ambient: uniform(new Vector3()),
    haze: uniform(new Vector3()),
  };
}
export type SplatUniforms = ReturnType<typeof splatUniforms>;

type FloatNode = Node<"float">;
type Vec3Node = Node<"vec3">;

const exponentialEaseOut = (value: FloatNode) => float(1).sub(pow(2, clamp(value, 0, 1).mul(-10)));

/** The way strokes lie: a slow field of directions through the cave. */
const flowField = (point: Vec3Node, time: FloatNode) => {
  const drift = time.mul(0.035);
  return sin(point.z.mul(0.11).add(point.x.mul(0.14)).add(drift))
    .mul(0.48)
    .add(sin(point.x.mul(0.22).sub(point.z.mul(0.07)).sub(drift.mul(0.7))).mul(0.24))
    .add(sin(point.y.mul(0.19).add(point.x.mul(0.08)).add(drift.mul(0.45))).mul(0.18));
};

/** What the vertex stage hands the fragment stage. */
const passed = {
  colour: varyingProperty("vec4", "vColour"),
  offset: varyingProperty("vec2", "vOffset"),
  major: varyingProperty("float", "vMajor"),
  glow: varyingProperty("float", "vGlow"),
  brush: varyingProperty("float", "vBrush"),
  stroke: varyingProperty("float", "vStroke"),
};

/** Projects a splat's 3D ellipsoid covariance onto screen axes and returns its quad corner offset. */
function splatScreenOffset(
  u: SplatUniforms,
  params: {
    seen: Node<"vec4">;
    spread: Node<"mat3">;
    at: Vec3Node;
    time: FloatNode;
    phase: FloatNode;
    extent: FloatNode;
    corner: Node<"vec2">;
  },
) {
  const { seen, spread, at, time, phase, extent, corner } = params;
  // Each screen axis is a row of the Jacobian of the projection, turned
  // back into the world: the outline's covariance is then their products
  // through the ellipsoid's.
  const focal = u.focal.mul(u.viewport).mul(0.5);
  const inverse = float(1).div(seen.z.negate());
  const across = u.cameraTurn
    .mul(vec3(focal.x.mul(inverse), 0, focal.x.mul(seen.x).mul(inverse).mul(inverse)))
    .toVar();
  const up = u.cameraTurn
    .mul(vec3(0, focal.y.mul(inverse), focal.y.mul(seen.y).mul(inverse).mul(inverse)))
    .toVar();
  // A little blur, so splats smaller than a pixel don't shimmer.
  const a = dot(across, spread.mul(across)).add(0.3);
  const b = dot(across, spread.mul(up));
  const d = dot(up, spread.mul(up)).add(0.3);
  const middle = a.add(d).mul(0.5);
  const radius = length(vec2(a.sub(d).mul(0.5), b));
  const major = min(sqrt(middle.add(radius).mul(2.2)), 1024);
  const minor = min(sqrt(max(middle.sub(radius).mul(0.9), 0.14)), 1024);
  // Strokes follow the flow of the rock rather than the ellipsoid's own axes.
  const angle = flowField(at, time).add(fract(phase.mul(19)).mul(0.12));
  const axis = vec2(cos(angle), sin(angle));
  return axis
    .mul(corner.x.mul(major))
    .add(vec2(axis.y.negate(), axis.x).mul(corner.y.mul(minor)))
    .mul(extent);
}

/** Where a splat's quad corner lands on screen, in clip space; it also fills `passed`. */
export function splatVertex(splats: DataTexture, lights: number, u: SplatUniforms) {
  return Fn(() => {
    const index = int(attribute("splat", "float"));
    const base = ivec2(index.mod(PER_ROW).mul(TEXELS), index.div(PER_ROW));
    const fetch = (texel: number) => textureLoad(splats, base.add(ivec2(texel, 0))).toVar();
    const t0 = fetch(0);
    const t1 = fetch(1);
    const t2 = fetch(2);
    const t3 = fetch(3);
    const t4 = fetch(4);
    const centre = t0.xyz;
    const tint = t2.yzw.toVar();
    const opacity = t3.x.toVar();
    const facing = t3.yzw;
    const motion = t4.xyz;
    const glow = t4.w;
    const light = int(motion.y.add(0.5)).sub(1);
    const phase = motion.z;
    const time: FloatNode = u.time;

    // Painting the picture in: each stroke starts at its own moment.
    const stagger = exponentialEaseOut(fract(phase.mul(1.618).add(length(centre).mul(0.031)))).mul(
      0.62,
    );
    const painted = exponentialEaseOut(u.drawProgress);
    opacity.mulAssign(smoothstep(stagger, stagger.add(STROKE), painted));
    const stroke = exponentialEaseOut(painted.sub(stagger).div(STROKE));

    const at = centre.toVar();
    const size = float(1).toVar();
    const brightness = float(1).toVar();
    If(light.greaterThanEqual(0), () => {
      at.addAssign(u.lightMoved.element(light));
      brightness.assign(u.flicker.element(light));
    });
    const wander = flowField(at, time)
      .add(fract(phase.mul(19)).mul(0.12))
      .toVar();
    If(motion.x.equal(MOTION.flame), () => {
      const life = fract(time.mul(1.7).add(phase));
      at.addAssign(
        vec3(
          cos(wander)
            .mul(0.09)
            .mul(life)
            .add(
              sin(time.mul(3.1).add(phase.mul(TAU)))
                .mul(0.018)
                .mul(life),
            ),
          life.mul(0.34),
          sin(wander)
            .mul(0.09)
            .mul(life)
            .add(
              cos(time.mul(2.3).add(phase.mul(TAU)))
                .mul(0.012)
                .mul(life),
            ),
        ),
      );
      size.assign(float(1).sub(life.mul(0.65)));
      opacity.mulAssign(smoothstep(0, 0.12, life).mul(float(1).sub(life)));
      tint.mulAssign(
        mix(vec3(1, 0.82, 0.45), vec3(0.95, 0.22, 0.04), smoothstep(0.05, 0.75, life)),
      );
    })
      .ElseIf(motion.x.equal(MOTION.orbit), () => {
        const middle = u.lightAt.element(light);
        const from = centre.sub(middle.sub(u.lightMoved.element(light)));
        const turn = time.mul(1.4);
        const c = cos(turn);
        const s = sin(turn);
        at.assign(
          middle.add(
            vec3(
              c.mul(from.x).sub(s.mul(from.z)),
              from.y.add(sin(time.mul(2).add(phase.mul(TAU))).mul(0.03)),
              s.mul(from.x).add(c.mul(from.z)),
            ),
          ),
        );
      })
      .ElseIf(motion.x.equal(MOTION.smoke), () => {
        const rise = fract(time.mul(0.22).add(phase));
        at.addAssign(
          vec3(
            cos(wander)
              .mul(rise)
              .mul(0.55)
              .add(
                sin(time.mul(0.5).add(phase.mul(TAU)))
                  .mul(0.12)
                  .mul(rise),
              ),
            rise.mul(1.8),
            sin(wander)
              .mul(rise)
              .mul(0.55)
              .add(
                cos(time.mul(0.4).add(phase.mul(9)))
                  .mul(0.12)
                  .mul(rise),
              ),
          ),
        );
        size.assign(float(1).add(rise.mul(4)));
        opacity.mulAssign(smoothstep(0, 0.15, rise).mul(float(1).sub(rise)));
      })
      .ElseIf(motion.x.equal(MOTION.idle), () => {
        at.addAssign(
          vec3(
            sin(time.mul(0.55).add(phase.mul(TAU))).mul(0.018),
            0,
            cos(time.mul(0.45).add(phase.mul(TAU))).mul(0.008),
          ),
        );
      })
      .ElseIf(motion.x.equal(MOTION.drip), () => {
        // Hangs and swells for most of its cycle, then falls under gravity.
        const period = phase.mul(5).add(4);
        const cycle = fract(time.div(period).add(phase));
        const fall = max(0, cycle.sub(0.8)).mul(period);
        size.assign(smoothstep(0, 0.8, cycle).mul(0.6).add(0.4));
        at.y.subAssign(fall.mul(fall).mul(4.9));
        If(at.y.lessThan(0), () => {
          opacity.assign(0);
        });
      })
      .ElseIf(motion.x.equal(MOTION.drift), () => {
        const cycle = fract(time.mul(0.045).add(phase));
        at.addAssign(
          vec3(
            cos(wander)
              .mul(cycle)
              .mul(0.55)
              .add(sin(time.mul(0.31).add(phase.mul(17))).mul(0.08)),
            cycle.mul(1.4).sub(0.5),
            sin(wander)
              .mul(cycle)
              .mul(0.55)
              .add(cos(time.mul(0.27).add(phase.mul(11))).mul(0.08)),
          ),
        );
        opacity.mulAssign(sin(cycle.mul(Math.PI)));
      });

    const seen = modelViewMatrix.mul(vec4(at, 1)).toVar();

    const shade = vec3(0).toVar();
    If(glow.greaterThan(0.5), () => {
      shade.assign(tint.mul(brightness));
    }).Else(() => {
      const normal = normalize(facing);
      const lit = vec3(u.ambient).toVar();
      Loop(lights, ({ i }) => {
        const toLight = u.lightAt.element(i).sub(at);
        const distance = length(toLight);
        const wrap = max(0, dot(normal, toLight.div(distance)).add(0.45).div(1.45));
        const falloff = max(0, float(1).sub(distance.div(u.lightReach.element(i))));
        lit.addAssign(
          u.lightColour.element(i).mul(u.flicker.element(i)).mul(wrap).mul(pow(falloff, 2.2)),
        );
      });
      shade.assign(tint.mul(lit));
    });
    const fog = exp(
      max(0, seen.z.negate().sub(8))
        .negate()
        .mul(select(glow.greaterThan(0.5), 0.03, 0.05)),
    );
    shade.assign(mix(u.haze, shade, fog));

    // The ellipsoid's outline on screen: its covariance, carried through the
    // camera and the perspective divide (linearised at its centre).
    const spread = mat3(t0.w, t1.x, t1.y, t1.x, t1.z, t1.w, t1.y, t1.w, t2.x)
      .mul(size.mul(size))
      .toVar();
    const extent = select(glow.greaterThan(0.5), GLOW_EXTENT, 1);
    const corner = positionGeometry.xy;
    const offset = splatScreenOffset(u, { seen, spread, at, time, phase, extent, corner });

    passed.colour.assign(vec4(pow(max(shade, 0), vec3(1 / 2.2)), opacity));
    passed.offset.assign(corner.mul(extent));
    passed.major.assign(corner.x);
    passed.glow.assign(glow);
    passed.brush.assign(floor(fract(phase.mul(7.31)).mul(BRUSHES)));
    passed.stroke.assign(stroke);

    const clip = cameraProjectionMatrix.mul(seen);
    const hidden = seen.z.greaterThan(-0.15).or(opacity.lessThan(0.004));
    return select(
      hidden,
      vec4(0, 0, 2, 1),
      vec4(clip.xy.div(clip.w).add(offset.mul(2).div(u.viewport)), 0, 1),
    );
  })();
}

/** The colour of a point on a splat's quad, premultiplied: a glow adds light, a stroke covers. */
export function splatFragment(brushes: DataTexture) {
  return Fn(() => {
    // While it's being painted in, the stroke's tip sweeps along it.
    const painted = float(1).toVar();
    If(passed.stroke.lessThan(1), () => {
      const tip = passed.stroke.mul(2.3).sub(1.15);
      painted.assign(float(1).sub(smoothstep(tip.sub(0.12), tip.add(0.12), passed.major)));
    });
    const result = vec4(0).toVar();
    If(passed.glow.greaterThan(0.5), () => {
      const alpha = passed.colour.a
        .mul(exp(dot(passed.offset, passed.offset).mul(-0.5)))
        .mul(painted);
      Discard(alpha.lessThan(1 / 255));
      result.assign(vec4(passed.colour.rgb.mul(alpha), 0));
    }).Else(() => {
      const cell = passed.offset.mul(0.5).add(0.5);
      const uv = vec2(passed.brush.add(clamp(cell.x, 0, 1)).div(BRUSHES), cell.y);
      const alpha = passed.colour.a.mul(texture(brushes, uv).r).mul(painted);
      Discard(alpha.lessThan(1 / 255));
      result.assign(vec4(passed.colour.rgb.mul(alpha), alpha));
    });
    return result;
  })();
}
