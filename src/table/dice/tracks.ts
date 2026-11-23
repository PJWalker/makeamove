import { Quaternion, Vector3 } from "three/webgpu";
import { playDiceImpact } from "../../ui/sounds";
import { PHYSICS_STEP    } from "./physics";
import type {DieHull, DiePose, DieState} from "./physics";
import { SCALE } from "./shapes";
import type { Point, Track } from "./types";

/*
 * The motions a die plays: a roll worked out by the physics, seen in its tray
 * wherever the tray is now, or carried at rest into its slot.
 */

/** How long a die carried at rest takes to reach its slot. */
const GLIDE_MS = 220;
/** How hard (units/s) a die is struck to roll it where it lies. */
const ROLL_SPEED = 8;
/**
 * How hard a die rolled where it lies is thrown towards the bottom of its tray:
 * this many units/s per square root of the tray's height (the speed it takes to
 * slide a distance grows as its square root), so it bounces off the bottom and,
 * in a tray of a row or two, often gets back to the top.
 */
const THROW_SPEED = 10;
/** How much softer or harder than that each die is thrown. */
const THROW_SOFTEST = 0.8;
const THROW_HARDEST = 1.2;
/** How fast (units/s) a die rolled where it lies is tossed up off the floor. */
const HOP_SLOWEST = 4;
const HOP_FASTEST = 8;

const between = (low: number, high: number) => low + Math.random() * (high - low);
/** How hard a die must strike something to be heard. */
const AUDIBLE_IMPACT = 2.5;

export const centreOf = (element: Element): Point => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** A die lying still in its slot (`slot`, in tray units), turned as `rotation`. */
export function lyingAt(hull: DieHull, rotation: Quaternion, slot: Point): DieState {
  const lowest = Math.min(
    ...hull.vertices.map(([x, y, z]) => new Vector3(x, y, z).applyQuaternion(rotation).z),
  );
  return {
    position: [slot.x, -slot.y, -lowest + 0.02],
    quaternion: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
}

/**
 * A die lying in its slot, thrown to roll where it lies towards the bottom of
 * its tray (`trayHeight` units tall), as the tray moves at `trayVelocity` px/s.
 */
export function struck(
  hull: DieHull,
  rotation: Quaternion,
  slot: Point,
  trayVelocity: Point,
  trayHeight: number,
): DieState {
  const strike = () => (Math.random() - 0.5) * ROLL_SPEED;
  const toBottom = THROW_SPEED * Math.sqrt(trayHeight) * between(THROW_SOFTEST, THROW_HARDEST);
  return {
    ...lyingAt(hull, rotation, slot),
    // The die stays where it was as the tray is pulled from under it.
    velocity: [
      strike() - trayVelocity.x / SCALE,
      strike() + trayVelocity.y / SCALE - toBottom,
      between(HOP_SLOWEST, HOP_FASTEST),
    ],
    angularVelocity: [strike() * 4, strike() * 4, strike() * 4],
  };
}

const quaternion = ({ x, y, z, w }: DiePose["quaternion"], into: Quaternion) => into.set(x, y, z, w);

/**
 * A die's simulated roll, as it's seen: in its tray, wherever the tray is now,
 * thrown in from `from` if it was, and drawn into its slot, wherever that is now, as it comes to rest.
 */
export function rollTrack(
  frames: DiePose[],
  tray: HTMLElement,
  slot: HTMLElement,
  delay: number,
  from?: Point,
): Track {
  const step = PHYSICS_STEP * 1000;
  const last = frames.length - 1;
  const rest = frames[last]!;
  const entry = Math.max(0, frames.findIndex((pose) => pose.captured));
  const launch = delay / step;
  const a = new Quaternion();
  const b = new Quaternion();
  const rotation = new Quaternion();
  let sounded = -1;
  return (ms) => {
    const at = Math.min(ms / step, last);
    const index = Math.floor(at);
    const mix = at - index;
    const p = frames[index]!;
    const q = frames[Math.min(index + 1, last)]!;
    if (index !== sounded) {
      sounded = index;
      if ((p.impact ?? 0) > AUDIBLE_IMPACT) playDiceImpact(p.impact!);
    }
    const box = tray.getBoundingClientRect();
    const screen = (pose: DiePose) => ({
      x: box.left + pose.x * SCALE,
      y: box.top + pose.y * SCALE,
    });
    let point: Point;
    if (from && index < entry) {
      // Until it's over the tray, it flies straight from the hand.
      const over = screen(frames[entry]!);
      const k = entry > launch ? Math.max(0, (at - launch) / (entry - launch)) : 1;
      point = { x: from.x + (over.x - from.x) * k, y: from.y + (over.y - from.y) * k };
    } else {
      const [s, t] = [screen(p), screen(q)];
      point = { x: s.x + (t.x - s.x) * mix, y: s.y + (t.y - s.y) * mix };
    }
    // Its slot may have moved in the tray since the roll was worked out: it's drawn there as it comes home.
    const home = p.home + (q.home - p.home) * mix;
    if (home > 0) {
      const target = screen(rest);
      const now = centreOf(slot);
      point = { x: point.x + (now.x - target.x) * home, y: point.y + (now.y - target.y) * home };
    }
    rotation.slerpQuaternions(quaternion(p.quaternion, a), quaternion(q.quaternion, b), mix);
    const lift = Math.max(0, p.z + (q.z - p.z) * mix - rest.z);
    return { pose: { ...point, lift, rotation }, done: at === last };
  };
}

/** A die carried at rest, turned as `rotation`, from `from` into its slot. */
export function glideTrack(slot: HTMLElement, from: Point, delay: number, rotation: Quaternion): Track {
  return (ms) => {
    const t = Math.min(1, (ms - delay) / GLIDE_MS);
    const eased = 1 - (1 - t) ** 3;
    const to = centreOf(slot);
    return {
      pose: {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        lift: 0,
        rotation,
      },
      done: t === 1,
    };
  };
}
