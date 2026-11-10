/*
 * The fog's trace field on the CPU: a line-for-line mirror of the noise in
 * FogBackdrop's fragment shader (same integer hash, so the two agree to
 * float precision). Sparks read it to stay on the traces the shader draws.
 */

const hash = (x: number, y: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const noise = (px: number, py: number) => {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let fx = px - ix;
  let fy = py - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), fx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
    fy,
  );
};

const fbm = (px: number, py: number) => {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * noise(px, py);
    const x = 0.8 * px + 0.6 * py;
    py = (-0.6 * px + 0.8 * py) * 2;
    px = x * 2;
    a *= 0.5;
  }
  return v;
};

/** The shader's domain warp: the point fog space (x, y) is carried to at fog time t, before the fog and traces are sampled there. */
function warp(x: number, y: number, t: number): [number, number] {
  const qx = fbm(x, y + t * 0.03);
  const qy = fbm(x + 5.2 - t * 0.025, y + 1.3 - t * 0.025);
  return [x + 1.6 * (qx - 0.5) * 2, y + 1.6 * (qy - 0.5) * 2];
}

/** The trace field at (x, y) in the shader's fog space at fog time t; traces lie where it equals 0.5. */
export function traceField(x: number, y: number, t: number) {
  const [wx, wy] = warp(x, y, t);
  return fbm(wx * 1.7 - t * 0.05, wy * 1.7 + t * 0.04);
}

export const TRACE_LEVEL = 0.5;

/** The field is rough at fine scales; a wider step gives the direction of the trace's overall course. */
export const COARSE = 0.05;
const FINE = 0.004;

/** Field value and its gradient at (x, y), the gradient by forward differences over a fine step. */
export function traceSample(x: number, y: number, t: number) {
  const n = traceField(x, y, t);
  const gx = (traceField(x + FINE, y, t) - n) / FINE;
  const gy = (traceField(x, y + FINE, t) - n) / FINE;
  return { n, gx, gy };
}

/** The field's gradient at (x, y), measured over `eps` either side. */
export function traceGradient(x: number, y: number, t: number, eps: number) {
  const gx = (traceField(x + eps, y, t) - traceField(x - eps, y, t)) / (2 * eps);
  const gy = (traceField(x, y + eps, t) - traceField(x, y - eps, t)) / (2 * eps);
  return { gx, gy };
}

/** Where the shader reads the fog: the warped point, scrolled by (0.02, -0.015) per unit of fog time. */
const fogCoord = (x: number, y: number, t: number): [number, number] => {
  const [wx, wy] = warp(x, y, t);
  return [wx + t * 0.02, wy - t * 0.015];
};

/** Fastest the flow is allowed to be, in fog space per unit of fog time. Where the warp folds over, the estimate is unbounded. */
const MAX_FLOW = 0.3;

/**
 * How the fog at (x, y) is moving, in fog space per unit of fog time. The
 * shader's fog is a fixed pattern seen through a warp that changes with
 * time, so a wisp of fog is a point whose fog coordinate stays put: solving
 * J v + dc/dt = 0, with J the warp's Jacobian, gives its velocity.
 */
export function fogFlow(x: number, y: number, t: number): [number, number] {
  const e = 0.01;
  const dt = 0.05;
  const [ax, ay] = fogCoord(x + e, y, t);
  const [bx, by] = fogCoord(x - e, y, t);
  const [cx, cy] = fogCoord(x, y + e, t);
  const [dx, dy] = fogCoord(x, y - e, t);
  const [fx, fy] = fogCoord(x, y, t + dt);
  const [gx, gy] = fogCoord(x, y, t - dt);
  const j11 = (ax - bx) / (2 * e);
  const j21 = (ay - by) / (2 * e);
  const j12 = (cx - dx) / (2 * e);
  const j22 = (cy - dy) / (2 * e);
  const ux = (fx - gx) / (2 * dt);
  const uy = (fy - gy) / (2 * dt);
  const det = j11 * j22 - j12 * j21;
  if (Math.abs(det) < 1e-3) return [0, 0];
  const vx = -(j22 * ux - j12 * uy) / det;
  const vy = -(j11 * uy - j21 * ux) / det;
  const speed = Math.hypot(vx, vy);
  const k = speed > MAX_FLOW ? MAX_FLOW / speed : 1;
  return [vx * k, vy * k];
}
