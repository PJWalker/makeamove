import { Buffer, BufferUsage, Geometry, Mesh, Shader } from "pixi.js";
import { COARSE, fogFlow, TRACE_LEVEL, traceGradient, traceSample } from "./fogField";
import { FOG, rgb, SPARKS, TRACES } from "./fogLook";

interface Point {
  x: number;
  y: number;
  /** The spark's age when the point was laid. */
  at: number;
  /** The spark's brightness when the point was laid, so the trail keeps it as it fades. */
  glow: number;
}

interface Spark {
  x: number;
  y: number;
  hx: number;
  hy: number;
  age: number;
  life: number;
  speed: number;
  /** Total change of heading so far, in radians. */
  turned: number;
  /** The trace field value this spark follows. Branches follow one just beside their parent's, so they split away from it. */
  level: number;
  /** How many forks back to a spark that started on its own. */
  depth: number;
  /** The age at which the spark stopped; its trail then fades out where it lies. */
  stoppedAt: number | null;
  trail: Point[];
}

/** Where fog space sits on the screen: fog space (0, 0) is the screen's centre, y up, `unit` pixels to one fog unit. */
export interface SparkView {
  halfW: number;
  halfH: number;
  unit: number;
  width: number;
  height: number;
}

/** How far from the trace a new spark may start, in field units. */
const SPAWN_TOLERANCE = 0.008;
/** How far a spark may stray from the trace before it's dropped. */
const OFF_TRACE = 0.05;
/** Largest Newton step when snapping onto a trace, in fog space. */
const MAX_STEP = 0.06;
/** Close enough to the trace to stop refining, in field units. */
const ON_TRACE = 1e-4;
/** How quickly a spark follows a change of course, per step. */
const STEER = 0.15;
/** Most a spark may turn in total, in radians, before it's dropped: four full turns. */
const MAX_TURN = Math.PI * 8;
/** Furthest a spark moves in one step, in fog space; it takes more steps per frame if it would go further. */
const MAX_MOVE = 0.01;
/** Gap between the points of a trail, in fog space: about three pixels. */
const POINT_GAP = 0.008;
/** How long a spark's head takes to fade once it stops, in seconds. */
const HEAD_FADE = 0.2;
/** How far a branch's trace level sits from its parent's, at most. */
const BRANCH_SPREAD = 0.05;
/** Branches of branches stop here. */
const MAX_DEPTH = 2;
/** Most quads drawn in a frame; anything past this is left out. */
const MAX_QUADS = 1024;
/** Floats per vertex: position (2), shape (3), colour (4). */
const STRIDE = 9;

const TRAIL_RGB = rgb(TRACES.colour);
const HEAD_RGB = [1, 1, 1] as const;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec3 aShape;
in vec4 aColor;
out vec3 vShape;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((m * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vShape = aShape;
  vColor = aColor;
}
`;

// xy runs from the centre (0) to the edge (1), across a trail or out from a head;
// z is that distance in pixels, so the edge is anti-aliased over one pixel.
const fragment = /* glsl */ `#version 300 es
precision mediump float;
in vec3 vShape;
in vec4 vColor;
out vec4 finalColor;
void main() {
  float cover = clamp((1.0 - length(vShape.xy)) * vShape.z, 0.0, 1.0);
  float a = vColor.a * cover;
  finalColor = vec4(vColor.rgb * a, a);
}
`;

/** Pulls (x, y) onto the trace at `level` with Newton steps, or returns null if there isn't one close by. */
function snap(x: number, y: number, t: number, level: number, tolerance: number) {
  for (let i = 0; i < 8; i++) {
    const { n, gx, gy } = traceSample(x, y, t);
    if (Math.abs(n - level) < ON_TRACE) return { x, y, gx, gy };
    const g2 = gx * gx + gy * gy;
    if (g2 < 1e-6) return null;
    const k = (n - level) / g2;
    const len = Math.abs(k) * Math.sqrt(g2);
    const s = len > MAX_STEP ? MAX_STEP / len : 1;
    x -= k * gx * s;
    y -= k * gy * s;
  }
  const { n, gx, gy } = traceSample(x, y, t);
  return Math.abs(n - level) < tolerance ? { x, y, gx, gy } : null;
}

/** Fades a spark in quickly and out over the last stretch of its life. */
function envelope(s: Spark) {
  const k = s.age / s.life;
  return Math.max(0, Math.min(1, k / 0.1, (1 - k) / 0.3));
}

/**
 * Sparks that run along the fog's traces. Each one follows the contour of
 * the trace field it was born on (moving perpendicular to the field's
 * gradient, so it keeps to paths of equal value) and is pulled back onto it
 * as the fog drifts, so it travels through the fog instead of replaying a
 * fixed pattern. Running sparks fork now and then, and trails drift off
 * with the fog as they fade.
 *
 * All of them are drawn as one mesh from a preallocated buffer refilled in
 * place each frame, so they cost a single draw call.
 */
export class Sparks {
  readonly mesh: Mesh<Geometry, Shader>;
  view: SparkView = { halfW: 1, halfH: 1, unit: 1, width: 1, height: 1 };
  private live: Spark[] = [];
  private readonly vertices = new Float32Array(MAX_QUADS * 4 * STRIDE);
  private readonly buffer: Buffer;
  /** Floats written this frame and last. */
  private used = 0;
  private lastUsed = 0;

  constructor() {
    this.buffer = new Buffer({
      data: this.vertices,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
    });
    const indices = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    const attribute = (format: "float32x2" | "float32x3" | "float32x4", offset: number) => ({
      buffer: this.buffer,
      format,
      stride: STRIDE * 4,
      offset: offset * 4,
    });
    const geometry = new Geometry({
      attributes: {
        aPosition: attribute("float32x2", 0),
        aShape: attribute("float32x3", 2),
        aColor: attribute("float32x4", 5),
      },
      indexBuffer: indices,
    });
    this.mesh = new Mesh({ geometry, shader: Shader.from({ gl: { vertex, fragment } }) });
    this.mesh.blendMode = "add";
  }

  /** Advance by dt seconds at fog time t (the shader's t), then redraw. */
  update(dt: number, t: number) {
    const roots = this.live.filter((s) => s.depth === 0 && s.stoppedAt === null).length;
    if (roots < SPARKS.count && Math.random() < (dt * SPARKS.count * 2) / SPARKS.life) {
      // Most random points are nowhere near a trace, so try a few.
      for (let tries = 0; tries < 8 && !this.spawn(t); tries++);
    }
    for (const s of [...this.live]) {
      if (s.depth < MAX_DEPTH && s.stoppedAt === null && Math.random() < dt * SPARKS.branchRate) {
        this.branch(s);
      }
    }
    for (const s of this.live) this.advance(s, dt, t);
    // A stopped spark stays until its trail has faded.
    this.live = this.live.filter((s) => s.stoppedAt === null || s.trail.length > 0);
    this.draw();
  }

  private spawn(t: number): boolean {
    const { halfW, halfH } = this.view;
    const start = snap(
      (Math.random() * 2 - 1) * halfW,
      (Math.random() * 2 - 1) * halfH,
      t,
      TRACE_LEVEL,
      SPAWN_TOLERANCE,
    );
    if (!start) return false;
    const len = Math.hypot(start.gx, start.gy);
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.live.push({
      x: start.x,
      y: start.y,
      hx: (-start.gy / len) * dir,
      hy: (start.gx / len) * dir,
      age: 0,
      life: SPARKS.life * (0.5 + Math.random()),
      speed: SPARKS.speed * (0.6 + Math.random() * 0.8),
      turned: 0,
      level: TRACE_LEVEL,
      depth: 0,
      stoppedAt: null,
      trail: [{ x: start.x, y: start.y, at: 0, glow: 0 }],
    });
    return true;
  }

  /** Forks a new spark off this one's head, onto a trace level just beside its own. */
  private branch(parent: Spark) {
    const side = Math.random() < 0.5 ? 1 : -1;
    this.live.push({
      x: parent.x,
      y: parent.y,
      hx: parent.hx,
      hy: parent.hy,
      age: 0,
      life: SPARKS.life * (0.3 + Math.random() * 0.5),
      speed: parent.speed * (0.8 + Math.random() * 0.4),
      turned: 0,
      level: parent.level + side * BRANCH_SPREAD * (0.4 + Math.random() * 0.6),
      depth: parent.depth + 1,
      stoppedAt: null,
      // Start where the parent is, so the fork joins its trail.
      trail: [{ x: parent.x, y: parent.y, at: 0, glow: 0 }],
    });
  }

  /** Moves a spark on by dt, in as few steps as keep it on its trace, and lets its trail age and drift. */
  private advance(s: Spark, dt: number, t: number) {
    const steps = Math.max(1, Math.ceil((s.speed * dt) / MAX_MOVE));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s.age += h;
      if (s.stoppedAt === null && !this.move(s, h, t)) s.stoppedAt = s.age;
    }
    if (s.stoppedAt === null) {
      const last = s.trail[s.trail.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= POINT_GAP) {
        s.trail.push({ x: s.x, y: s.y, at: s.age, glow: envelope(s) });
      }
    }
    while (s.trail.length && s.age - s.trail[0]!.at > SPARKS.trailLength) s.trail.shift();
    this.drift(s, dt, t);
  }

  /**
   * Carries a trail off with the fog: barely at the head, at full rate by the
   * tail. A trail is small next to the fog's swirls, so one flow sample does.
   */
  private drift(s: Spark, dt: number, t: number) {
    if (!s.trail.length) return;
    const mid = s.trail[s.trail.length >> 1]!;
    const [vx, vy] = fogFlow(mid.x, mid.y, t);
    // The fog moves at fog time, which runs FOG.speed times as fast as real time.
    const rate = (dt * FOG.speed * SPARKS.trailDrift) / SPARKS.trailLength;
    for (const pt of s.trail) {
      const k = rate * Math.min(SPARKS.trailLength, s.age - pt.at);
      pt.x += vx * k;
      pt.y += vy * k;
    }
  }

  /** Moves a spark along its trace; false when it has reached the end of its run. */
  private move(s: Spark, dt: number, t: number) {
    if (s.age >= s.life) return false;
    const { gx, gy } = traceGradient(s.x, s.y, t, COARSE);
    const len = Math.hypot(gx, gy);
    if (len < 1e-3) return false;
    // Run along the contour, keeping the direction it was already heading.
    let tx = -gy / len;
    let ty = gx / len;
    if (tx * s.hx + ty * s.hy < 0) {
      tx = -tx;
      ty = -ty;
    }
    // Ease toward the new course so the fine roughness of the field doesn't jitter it.
    tx = s.hx + (tx - s.hx) * STEER;
    ty = s.hy + (ty - s.hy) * STEER;
    const norm = Math.hypot(tx, ty);
    tx /= norm;
    ty /= norm;
    // A spark circling a peak never gets anywhere: let it go once it has curled round.
    s.turned += Math.acos(Math.min(1, tx * s.hx + ty * s.hy));
    if (s.turned > MAX_TURN) return false;
    s.hx = tx;
    s.hy = ty;
    const moved = snap(s.x + tx * s.speed * dt, s.y + ty * s.speed * dt, t, s.level, OFF_TRACE);
    if (!moved) return false;
    s.x = moved.x;
    s.y = moved.y;
    return Math.abs(s.x) <= this.view.halfW * 1.1 && Math.abs(s.y) <= this.view.halfH * 1.1;
  }

  private draw() {
    this.used = 0;
    for (const s of this.live) {
      this.trail(s);
      const head = s.stoppedAt === null ? 1 : 1 - (s.age - s.stoppedAt) / HEAD_FADE;
      if (head > 0) {
        const alpha = Math.min(1, SPARKS.brightness * envelope(s)) * head;
        this.disc(s.x, s.y, SPARKS.size * 0.9, alpha);
      }
    }
    // Collapse whatever last frame drew past this one's end, so it draws nothing.
    if (this.lastUsed > this.used) this.vertices.fill(0, this.used, this.lastUsed);
    this.buffer.update(Math.max(this.used, this.lastUsed) * 4);
    this.lastUsed = this.used;
  }

  /**
   * Draws a trail as a strip of quads that share their edges, so nothing
   * overlaps and the joins don't show under additive blending. A running
   * spark's trail reaches on to its head.
   */
  private trail(s: Spark) {
    const pts = s.trail;
    const running = s.stoppedAt === null;
    const count = pts.length + (running ? 1 : 0);
    if (count < 2) return;
    const head = running ? { x: s.x, y: s.y, at: s.age, glow: envelope(s) } : null;
    const at = (i: number) => (i < pts.length ? pts[i]! : head!);
    // The previous point's edge: left x, y, right x, y, half width, alpha.
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    let half0 = 0;
    let alpha0 = 0;
    for (let i = 0; i < count; i++) {
      const p = at(i);
      const a = at(Math.max(0, i - 1));
      const b = at(Math.min(count - 1, i + 1));
      const fade = Math.max(0, 1 - (s.age - p.at) / SPARKS.trailLength);
      const half = (SPARKS.size * (0.4 + 0.6 * fade)) / 2 + 0.5;
      const alpha = Math.min(1, SPARKS.brightness * p.glow * fade * fade);
      // Across the average of the segments either side, in screen pixels (y down).
      const dx = b.x - a.x;
      const dy = a.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      const sx = this.screenX(p.x);
      const sy = this.screenY(p.y);
      if (i > 0 && (alpha0 > 0.004 || alpha > 0.004)) {
        this.vertex(lx, ly, 0, -1, half0, alpha0, TRAIL_RGB);
        this.vertex(sx + nx, sy + ny, 0, -1, half, alpha, TRAIL_RGB);
        this.vertex(sx - nx, sy - ny, 0, 1, half, alpha, TRAIL_RGB);
        this.vertex(rx, ry, 0, 1, half0, alpha0, TRAIL_RGB);
      }
      lx = sx + nx;
      ly = sy + ny;
      rx = sx - nx;
      ry = sy - ny;
      half0 = half;
      alpha0 = alpha;
    }
  }

  /** A soft round dot, for a spark's head. */
  private disc(x: number, y: number, radius: number, alpha: number) {
    const sx = this.screenX(x);
    const sy = this.screenY(y);
    const r = radius + 0.5;
    this.vertex(sx - r, sy - r, -1, -1, r, alpha, HEAD_RGB);
    this.vertex(sx + r, sy - r, 1, -1, r, alpha, HEAD_RGB);
    this.vertex(sx + r, sy + r, 1, 1, r, alpha, HEAD_RGB);
    this.vertex(sx - r, sy + r, -1, 1, r, alpha, HEAD_RGB);
  }

  /** Writes a vertex: screen position, shape (centre-to-edge u, v and the edge's distance in pixels), colour. */
  private vertex(
    x: number,
    y: number,
    u: number,
    v: number,
    edge: number,
    alpha: number,
    colour: readonly [number, number, number],
  ) {
    const o = this.used;
    if (o >= this.vertices.length) return;
    const d = this.vertices;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = u;
    d[o + 3] = v;
    d[o + 4] = edge;
    d[o + 5] = colour[0];
    d[o + 6] = colour[1];
    d[o + 7] = colour[2];
    d[o + 8] = alpha;
    this.used = o + STRIDE;
  }

  private screenX(x: number) {
    return this.view.width / 2 + x * this.view.unit;
  }

  private screenY(y: number) {
    return this.view.height / 2 - y * this.view.unit;
  }
}
