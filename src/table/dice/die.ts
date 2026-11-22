import { Quaternion, Vector3 } from "three";
import { chipModel, dieModel, paint, resolveColour  } from "./painter";
import type {Model} from "./painter";
import type { DieHull, DiePose, DieThrow, DieTray } from "./physics";
import { chipHull, firstFaceFor, SCALE, shapeFor, SLOT } from "./shapes";
import { simulateDiceInWorker, warmDice } from "./simulation";
import { centreOf, glideTrack, lyingAt, rollTrack, struck } from "./tracks";
import type { DieLook, Point, Pose, Track } from "./types";

/*
 * A die: one canvas, in its slot, for as long as the slot is there. At rest it's
 * drawn in its slot; while it moves, the same canvas is lifted into the top layer
 * and carried over the page, and lowered back into its slot when it comes to rest.
 * It plays one motion at a time, and every motion ends with it at rest in its slot.
 */

/** Radians per second a tumbling die turns, and how long it takes to settle back. */
const SPIN_SPEED = 12;
const SETTLE_MS = 220;

const dice = new WeakMap<HTMLCanvasElement, Die>();
/** The die drawn in `canvas`, if any. */
export const dieOf = (canvas: HTMLCanvasElement) => dice.get(canvas);

export class Die {
  private readonly colour: string;
  /** The number on its first face, which sets how all its faces are numbered. */
  private first: number;
  private model: Model;
  /** How it lies at rest. */
  private readonly rotation: Quaternion;
  private motion: { stop: () => void } | undefined;
  /** A copy of its canvas, in a copy of its tray carried over the page: it's drawn there instead. */
  private carriedIn: HTMLCanvasElement | undefined;
  private disposed = false;

  /** A die drawn in `canvas`, which must sit in the die's slot, in the document. */
  constructor(
    readonly canvas: HTMLCanvasElement,
    private look: DieLook,
  ) {
    canvas.popover = "manual";
    this.colour = resolveColour(look.colour, this.slot);
    this.rotation = "chip" in look ? new Quaternion() : shapeFor(look.sides).rest.clone();
    this.first = "chip" in look ? 0 : look.value;
    this.model = this.build();
    dice.set(canvas, this);
    void warmDice();
  }

  get slot(): HTMLElement {
    return this.canvas.parentElement ?? this.canvas;
  }
  get alive() {
    return !this.disposed && this.canvas.isConnected;
  }
  get hull(): DieHull {
    return "chip" in this.look ? chipHull : shapeFor(this.look.sides).hull;
  }
  /** How it lies at rest. */
  get restingRotation() {
    return this.rotation.clone();
  }
  get moving() {
    return !!this.motion;
  }

  private build() {
    return "chip" in this.look
      ? chipModel(this.look.chip, this.colour)
      : dieModel(this.look.sides, this.first, this.colour);
  }

  /** Numbers the die so that, lying as `rotation` turns it, it shows its value. */
  private numberFor(rotation: Quaternion) {
    if ("chip" in this.look) return;
    const first = firstFaceFor(this.look.sides, this.look.value, rotation);
    if (first === this.first) return;
    this.model.dispose();
    this.first = first;
    this.model = this.build();
  }

  private draw(rotation: Quaternion, into = this.canvas) {
    paint(this.model, rotation, into);
  }

  /** Into the top layer, over everything on the page, free of its slot. */
  private lift() {
    if (this.canvas.isConnected && !this.canvas.matches(":popover-open")) this.canvas.showPopover();
  }

  private place({ x, y, lift }: Pose) {
    const copy = this.carriedIn;
    if (copy?.parentElement) {
      // Its tray is being carried: it moves with the copy of its tray.
      const here = centreOf(this.slot);
      const there = centreOf(copy.parentElement);
      x += there.x - here.x;
      y += there.y - here.y;
    }
    this.canvas.style.transform = `translate(${x - SLOT / 2}px, ${y - SLOT / 2}px) scale(${1 + lift * 0.05})`;
    this.canvas.style.setProperty("--lift", String(lift));
  }

  /** Back into its slot. */
  private lower() {
    if (this.canvas.matches(":popover-open")) this.canvas.hidePopover();
    this.canvas.style.removeProperty("transform");
    this.canvas.style.removeProperty("--lift");
  }

  /** Ends any motion, leaving it at rest in its slot. */
  private stop() {
    this.motion?.stop();
  }

  /** Draws it at rest in its slot. */
  rest() {
    this.stop();
    this.draw(this.rotation);
  }

  /**
   * Plays `track`, from `delay` ms after now, to rest lying as `final` turns it;
   * until then it stays as it was. Settles when it's at rest, or stopped.
   */
  play(track: Track, delay: number, final: Quaternion): Promise<void> {
    this.stop();
    if (!this.alive) return Promise.resolve();
    this.numberFor(final);
    return new Promise((resolve) => {
      let frame = 0;
      let start: number | undefined;
      const stop = () => {
        cancelAnimationFrame(frame);
        this.motion = undefined;
        this.lower();
        this.rotation.copy(final);
        if (!this.disposed) {
          this.draw(this.rotation);
          this.showCopy();
        }
        resolve();
      };
      this.motion = { stop };
      let shown = false;
      const tick = (now: number) => {
        start ??= now;
        const ms = now - start;
        if (!this.alive) { stop(); return; }
        if (ms >= delay) {
          const { pose, done } = track(ms);
          if (done) { stop(); return; }
          this.lift();
          if (this.carriedIn) this.carriedIn.style.visibility = "hidden";
          this.place(pose);
          this.draw(pose.rotation);
          // However long its first frame took to draw (the renderer may have just started), the motion plays out from there.
          if (!shown) start += performance.now() - now;
          shown = true;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
  }

  /** Shows it at rest in the copy of its tray being carried, if there is one. */
  private showCopy() {
    if (!this.carriedIn) return;
    this.draw(this.rotation, this.carriedIn);
    this.carriedIn.style.removeProperty("visibility");
  }

  /**
   * While its tray is carried, as a copy of it, over the page: a die still moving
   * moves with the copy, and comes to rest in it. The returned function ends that.
   */
  carry(copy: HTMLCanvasElement): () => void {
    this.carriedIn = copy;
    // The copy was made of the canvas as it was, wherever it had been carried to.
    copy.style.removeProperty("transform");
    copy.style.removeProperty("--lift");
    if (this.moving) copy.style.visibility = "hidden";
    return () => {
      if (this.carriedIn === copy) this.carriedIn = undefined;
    };
  }

  /** Thrown from `from` into its slot, with the other dice thrown into its tray now. */
  throwIn(from: Point, delay: number, seed: string) {
    return throwDie(this, { from, delay, seed });
  }

  /** Rolled where it lies, showing `value` once it stops, as its tray moves at `trayVelocity` px/s. */
  rollInPlace(value: number, seed: string, delay: number, trayVelocity: Point) {
    if (!("chip" in this.look)) this.look = { ...this.look, value };
    return throwDie(this, { delay, seed, trayVelocity });
  }

  /** Carried, at rest, from `from` into its slot. */
  glideIn(from: Point, delay: number) {
    return this.play(glideTrack(this.slot, from, delay, this.rotation.clone()), delay, this.rotation);
  }

  /**
   * Tumbles the die where it is, drawn into `into` (its own canvas, or a copy
   * of it); the returned function settles it back to rest.
   */
  tumble(into = this.canvas): () => void {
    const rest = this.rotation.clone();
    const rotation = rest.clone();
    const axis = new Vector3().randomDirection();
    const spin = new Quaternion();
    let settling: { start: number; from: Quaternion } | undefined;
    let last = performance.now();
    const tick = (now: number) => {
      const turn = (SPIN_SPEED * (now - last)) / 1000;
      last = now;
      const t = settling ? Math.min(1, (now - settling.start) / SETTLE_MS) : 0;
      if (settling) rotation.slerpQuaternions(settling.from, rest, t * t * (3 - 2 * t));
      else rotation.premultiply(spin.setFromAxisAngle(axis, turn));
      if (!this.disposed) this.draw(rotation, into);
      if (t < 1 && into.isConnected) frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);
    return () => {
      if (!into.isConnected) cancelAnimationFrame(frame);
      settling ??= { start: performance.now(), from: rotation.clone() };
    };
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.model.dispose();
    dice.delete(this.canvas);
  }
}

/*
 * Rolls: the dice thrown into a tray in the same task are rolled together,
 * knocking into each other, and each comes to rest in its own slot. The roll is
 * worked out in the tray's own frame, so the dice follow the tray as it moves.
 */

interface Throw {
  die: Die;
  seed: string;
  delay: number;
  /** Thrown from here, over the tray's edge; else rolled where it lies as the tray moves this fast. */
  from?: Point;
  trayVelocity?: Point;
  settle: (landed: Promise<void>) => void;
}

const pending = new Map<HTMLElement, Throw[]>();
/** Each tray's latest roll, so the next one there waits until its dice are moving. */
const rolling = new WeakMap<HTMLElement, Promise<void>>();

function throwDie(
  die: Die,
  options: { seed: string; delay: number } & ({ from: Point } | { trayVelocity: Point }),
): Promise<void> {
  return new Promise((settle) => {
    const tray = die.slot.closest<HTMLElement>(".roll-card") ?? die.slot;
    if (pending.size === 0) queueMicrotask(rollPending);
    pending.set(tray, [...(pending.get(tray) ?? []), { die, ...options, settle }]);
  });
}

function rollPending() {
  const batches = [...pending];
  pending.clear();
  for (const [tray, all] of batches) {
    for (const gone of all) if (!gone.die.alive) gone.settle(Promise.resolve());
    const throws = all.filter(({ die }) => die.alive);
    if (throws.length > 0)
      rolling.set(tray, (rolling.get(tray) ?? Promise.resolve()).then(() => roll(tray, throws)));
  }
}

/** The dice lying still in `tray` that aren't being thrown. */
function lyingIn(tray: HTMLElement, throws: Throw[]) {
  return [...tray.querySelectorAll<HTMLCanvasElement>(".die-canvas")].flatMap((canvas) => {
    const die = dieOf(canvas);
    return die?.alive && !die.moving && !throws.some((thrown) => thrown.die === die) ? [die] : [];
  });
}

/** The roll of `throws` among the dice `lying` in `tray`, in the tray's own frame, for the physics. */
function inTrayFrame(tray: HTMLElement, throws: Throw[], lying: Die[]): [DieTray, DieThrow[]] {
  const box = tray.getBoundingClientRect();
  const inTray = ({ x, y }: Point) => ({ x: (x - box.left) / SCALE, y: (y - box.top) / SCALE });
  return [
    { left: 0, top: 0, right: box.width / SCALE, bottom: box.height / SCALE },
    [
      ...throws.map(({ die, seed, delay, trayVelocity }) => {
        const target = inTray(centreOf(die.slot));
        return {
          hull: die.hull,
          seed,
          delay,
          target,
          ...(trayVelocity
            ? { state: struck(die.hull, die.restingRotation, target, trayVelocity) }
            : {}),
        };
      }),
      ...lying.map((die) => {
        const target = inTray(centreOf(die.slot));
        return {
          hull: die.hull,
          seed: "",
          target,
          heavy: true,
          state: lyingAt(die.hull, die.restingRotation, target),
        };
      }),
    ],
  ];
}

/**
 * Rolls `throws` into `tray`, among the dice lying still there: those are knocked
 * about by the rolling dice, but keep the faces they show.
 */
async function roll(tray: HTMLElement, throws: Throw[]) {
  const lying = lyingIn(tray, throws);
  let frames: DiePose[][] | undefined;
  try {
    frames = await simulateDiceInWorker(...inTrayFrame(tray, throws, lying));
  } catch (error) {
    console.error("The dice couldn't be rolled; they're shown at rest.", error);
  }
  for (const [index, { die, delay, from, settle }] of throws.entries()) {
    const poses = frames?.[index];
    // Gone while the roll was worked out.
    if (!die.alive) {
      settle(Promise.resolve());
      continue;
    }
    if (!poses) {
      die.rest();
      settle(Promise.resolve());
      continue;
    }
    const { x, y, z, w } = poses.at(-1)!.quaternion;
    const track = rollTrack(poses, tray, die.slot, delay, from);
    settle(die.play(track, delay, new Quaternion(x, y, z, w)));
  }
  for (const [index, die] of lying.entries()) {
    const poses = frames?.[throws.length + index];
    if (poses && die.alive) void die.play(rollTrack(poses, tray, die.slot, 0), 0, die.restingRotation);
  }
}
