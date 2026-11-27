import {
  Body,
  ContactMaterial,
  ConvexPolyhedron,
  GSSolver,
  Material,
  Plane,
  Quaternion,
  Vec3,
  World,
} from "cannon-es";
import { seededRandom } from "../../lib/seededRandom";

export interface DieHull {
  vertices: number[][];
  faces: number[][];
  /** For each face, the way the top of its label points; a die at rest is turned so the face up reads upright. */
  labelUps?: number[][];
  /** Comes to rest balanced with a face turned up, as a d4 is turned base-up so its roll faces the player. */
  faceUp?: boolean;
}

/** A flat round chip: a prism on a `sides`-gon, its faces towards +Z and −Z. */
export function discHull(radius: number, thickness: number, sides = 16): DieHull {
  const ring = (z: number) =>
    Array.from({ length: sides }, (_, index) => {
      const a = (index * 2 * Math.PI) / sides;
      return [radius * Math.cos(a), radius * Math.sin(a), z];
    });
  const next = (index: number) => (index + 1) % sides;
  return {
    // The top ring, then the bottom ring.
    vertices: [...ring(thickness / 2), ...ring(-thickness / 2)],
    // Corners anticlockwise seen from outside, as the solver wants them.
    faces: [
      Array.from({ length: sides }, (_, index) => index),
      Array.from({ length: sides }, (_, index) => 2 * sides - 1 - index),
      ...Array.from({ length: sides }, (_, index) => [
        sides + index,
        sides + next(index),
        next(index),
        index,
      ]),
    ],
  };
}

export interface DieTray {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const PHYSICS_STEP = 1 / 120;
const GRAVITY = 28;
/** How far a resting die's bottom face may tip from the floor before it counts as cocked. */
const COCKED = 0.995;
/** A die slower than this (units/s, and radians/s) for STILL_TIME has stopped. */
const STILL_SPEED = 0.3;
const STILL_TIME = 0.35;
/** A die that hasn't reached the tray this long after it's thrown is dropped in. */
const MAX_APPROACH = 1.5;
/** Times cocked dice are bumped before any still cocked are eased down onto a face. */
const MAX_NUDGES = 1;
/**
 * The finishing move, once the dice are still: at least this many steps to tip
 * onto a face and slide into place, and this many more per unit the farthest has to slide.
 */
const FINISH_STEPS = 18;
const FINISH_STEPS_PER_UNIT = 6;
const MAX_FINISH_STEPS = 72;
/** How much of its turn from upright the label on a resting die's top face keeps. */
const LABEL_TURN_KEPT = 0.5;
/**
 * A faint pull towards where a die will be shown once it's landed: this much
 * force per unit away from it, up to the most it can be, along the tray's floor.
 */
const TARGET_PULL = 0.5;
const MAX_TARGET_PULL = 5;
/** How many times heavier than a rolling die is one lying still while others roll. */
const HEAVY_MASS = 40;
/** Seconds after the last die is thrown before the dice lose their bounce. */
export const CALM_AFTER = 2.5;
const MAX_STEPS = 3600;

/** A die's position and motion in a tray, in the physics world's own axes (y up). */
export interface DieState {
  position: [number, number, number];
  quaternion: { x: number; y: number; z: number; w: number };
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
}

export interface DieThrow {
  hull: DieHull;
  seed: string;
  delay?: number;
  /**
   * Lying in the tray and not being rolled: knocked about by the dice that
   * are, but too heavy to be turned onto another face.
   */
  heavy?: boolean;
  /** Already in the tray and moving like this, rather than thrown in over its edge. */
  state?: DieState;
  /** Where it comes to rest, in a pose's axes (y down): drawn towards it as it rolls, then slid into it. */
  target: { x: number; y: number };
}

interface FlightBody {
  body: Body;
  vertices: Vec3[];
  target: Vec3;
  /** Lying still while others roll: it keeps the face it shows. */
  heavy: boolean;
  labelUps?: Vec3[] | undefined;
  faceUp: boolean;
  delay: number;
  active: boolean;
  captured: boolean;
  impact: number;
  /** Seconds since the die was thrown. */
  age: number;
  /** Seconds the die has been still. */
  still: number;
  /** How far through its finishing move, from 0 until it starts to 1 at rest in its target. */
  home: number;
}

export interface DiePose {
  x: number;
  y: number;
  z: number;
  quaternion: { x: number; y: number; z: number; w: number };
  captured: boolean;
  impact?: number;
  /** How far through its finishing move into its target: 0 until then, 1 once there. */
  home: number;
}

/** Groups: dice are 1, the tray floor and walls are 2. */
const DICE = 1;
const TRAY = 2;

/**
 * A felt-floored tray with walls at its edges: dice bounce off the walls and
 * each other, and lose their energy to the floor.
 */
class TrayWorld {
  readonly world = new World({
    gravity: new Vec3(0, 0, -GRAVITY),
    allowSleep: true,
  });
  readonly dieMaterial = new Material("die");
  private readonly floorMaterial = new Material("floor");
  private readonly wallMaterial = new Material("wall");
  private readonly contacts: Record<"dieDie" | "dieFloor" | "dieWall", ContactMaterial>;

  constructor(private readonly tray: DieTray) {
    const solver = new GSSolver();
    solver.iterations = 20;
    solver.tolerance = 1e-4;
    this.world.solver = solver;
    this.world.quatNormalizeFast = false;
    this.world.quatNormalizeSkip = 0;
    this.contacts = {
      dieDie: new ContactMaterial(this.dieMaterial, this.dieMaterial, {
        friction: 0.25,
        restitution: 0.45,
      }),
      dieFloor: new ContactMaterial(this.dieMaterial, this.floorMaterial, {
        friction: 0.55,
        restitution: 0.3,
      }),
      dieWall: new ContactMaterial(this.dieMaterial, this.wallMaterial, {
        friction: 0.15,
        restitution: 0.6,
      }),
    };
    for (const contact of Object.values(this.contacts)) this.world.addContactMaterial(contact);
    this.addPlane(new Vec3(), new Vec3(0, 0, 1), this.floorMaterial);
    this.addPlane(new Vec3(tray.left, 0, 0), new Vec3(1, 0, 0));
    this.addPlane(new Vec3(tray.right, 0, 0), new Vec3(-1, 0, 0));
    this.addPlane(new Vec3(0, -tray.top, 0), new Vec3(0, -1, 0));
    this.addPlane(new Vec3(0, -tray.bottom, 0), new Vec3(0, 1, 0));
  }

  private addPlane(position: Vec3, normal: Vec3, material: Material = this.wallMaterial) {
    const wall = new Body({
      mass: 0,
      shape: new Plane(),
      material,
      position,
      collisionFilterGroup: TRAY,
      collisionFilterMask: DICE,
    });
    wall.quaternion.setFromVectors(new Vec3(0, 0, 1), normal);
    this.world.addBody(wall);
  }

  /** Once a roll has gone on long enough, the dice lose their bounce and come to rest. */
  calm() {
    for (const contact of Object.values(this.contacts)) {
      contact.restitution = 0.1;
      contact.friction = 0.85;
    }
  }

  dieBody(hull: DieHull, vertices: Vec3[], heavy: boolean) {
    return new Body({
      mass: heavy ? HEAVY_MASS : 1,
      // Nothing turns it: not knocks, nor the bump that tips cocked dice over.
      fixedRotation: heavy,
      angularFactor: heavy ? new Vec3(0, 0, 0) : new Vec3(1, 1, 1),
      material: this.dieMaterial,
      shape: new ConvexPolyhedron({ vertices, faces: hull.faces }),
      linearDamping: 0.3,
      angularDamping: 0.35,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.6,
      collisionFilterGroup: DICE,
      collisionFilterMask: DICE,
    });
  }

  /** Keeps a die's hull inside the walls, however fast it was going. */
  contain(body: Body, vertices: Vec3[], restitution: number) {
    const { tray } = this;
    const offsets = vertices.map((vertex) => body.quaternion.vmult(vertex));
    for (const [axis, minimum, maximum] of [
      ["x", tray.left, tray.right],
      ["y", -tray.bottom, -tray.top],
    ] as const) {
      const lower = minimum - Math.min(...offsets.map((vertex) => vertex[axis]));
      const upper = maximum - Math.max(...offsets.map((vertex) => vertex[axis]));
      const position = body.position[axis];
      body.position[axis] =
        lower > upper ? (minimum + maximum) / 2 : Math.max(lower, Math.min(upper, position));
      if (
        (position < lower && body.velocity[axis] < 0) ||
        (position > upper && body.velocity[axis] > 0)
      ) {
        body.velocity[axis] *= -restitution;
      }
    }
    // Only a die that's gone well into the floor; the solver handles ordinary contact.
    const floor = -Math.min(...offsets.map((vertex) => vertex.z));
    if (body.position.z < floor - 0.15) {
      body.position.z = floor;
      if (body.velocity.z < 0) body.velocity.z *= -restitution;
    }
  }
}

/** The index of the face whose normal, turned by `quaternion`, points most nearly along `sign` × Z. */
function faceTowards(body: Body, quaternion: Quaternion, sign: -1 | 1) {
  const { faceNormals } = body.shapes[0] as ConvexPolyhedron;
  let best = 0;
  let bestZ = -Infinity;
  for (const [index, normal] of faceNormals.entries()) {
    const z = sign * quaternion.vmult(normal).z;
    if (z > bestZ) [best, bestZ] = [index, z];
  }
  return best;
}

/** The face of a die turned most nearly towards the floor, as a direction in the world. */
const downFace = (body: Body) =>
  body.quaternion.vmult(
    (body.shapes[0] as ConvexPolyhedron).faceNormals[faceTowards(body, body.quaternion, -1)]!,
  );

const lowestPoint = (quaternion: Quaternion, vertices: Vec3[]) =>
  Math.min(...vertices.map((vertex) => quaternion.vmult(vertex).z));

/** Whether a die at rest is tipped up on an edge or corner, against a wall or another die. */
const tilted = (body: Body) => downFace(body).z > -COCKED;

/** Whether a die at rest is lying on another die instead of the floor. */
const raised = (body: Body, vertices: Vec3[]) =>
  body.position.z + lowestPoint(body.quaternion, vertices) > 0.1;

interface Ease {
  die: FlightBody;
  from: Quaternion;
  to: Quaternion;
  fromPosition: Vec3;
  toPosition: Vec3;
}

function poseOf({ body, captured, impact, home }: FlightBody): DiePose {
  return {
    x: body.position.x,
    y: -body.position.y,
    z: body.position.z,
    quaternion: {
      x: body.quaternion.x,
      y: body.quaternion.y,
      z: body.quaternion.z,
      w: body.quaternion.w,
    },
    captured,
    ...(impact ? { impact } : {}),
    home,
  };
}

/** How hard a die was knocked this step: the change in its speed beyond what gravity alone does. */
function impactOf(before: Vec3, body: Body) {
  const change = body.velocity.vsub(before);
  change.z += GRAVITY * PHYSICS_STEP;
  const size = change.length();
  return size > 1 ? size : 0;
}

/**
 * A roll thrown into a tray: the dice fly in over its top edge, then bounce
 * off its walls and each other until every one lies flat on a face.
 */
export class DiceFlight {
  private readonly trayWorld: TrayWorld;
  readonly dice: FlightBody[];
  private elapsed = 0;
  private calmed = false;

  constructor(
    private readonly tray: DieTray,
    throws: DieThrow[],
    private readonly calmAfter = CALM_AFTER,
  ) {
    const trayWorld = new TrayWorld(tray);
    this.trayWorld = trayWorld;
    const width = tray.right - tray.left;
    this.dice = throws.map(
      ({ hull, seed, delay = 0, state, target: toward, heavy = false }, index) => {
        const random = seededRandom(seed);
        const target = new Vec3(toward.x, -toward.y, 0);
        const vertices = hull.vertices.map(([x, y, z]) => new Vec3(x, y, z));
        const labelUps = hull.labelUps?.map(([x, y, z]) => new Vec3(x, y, z));
        const faceUp = hull.faceUp ?? false;
        const body = trayWorld.dieBody(hull, vertices, heavy);
        if (state) {
          body.position.set(...state.position);
          const q = state.quaternion;
          body.quaternion.set(q.x, q.y, q.z, q.w);
          body.velocity.set(...state.velocity);
          body.angularVelocity.set(...state.angularVelocity);
          return {
            body,
            vertices,
            target,
            heavy,
            labelUps,
            faceUp,
            delay: delay / 1000,
            active: false,
            captured: true,
            impact: 0,
            age: 0,
            still: 0,
            home: 0,
          };
        }
        // Spread across the tray's width so dice thrown together don't start inside each other.
        const lane = (index + 0.25 + random() * 0.5) / throws.length;
        body.position.set(tray.left + (0.15 + lane * 0.7) * width, -tray.top + 2, 4 + random() * 2);
        body.quaternion.setFromEuler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
        body.velocity.set((random() - 0.5) * 5, -10 - random() * 6, 3 + random() * 4);
        body.angularVelocity.set(random() * 24 - 12, random() * 24 - 12, random() * 24 - 12);
        return {
          body,
          vertices,
          target,
          heavy,
          labelUps,
          faceUp,
          delay: delay / 1000,
          active: false,
          captured: false,
          impact: 0,
          age: 0,
          still: 0,
          home: 0,
        };
      },
    );
  }

  private entersTray(from: Vec3, to: Vec3, tray: DieTray) {
    let enter = 0;
    let exit = 1;
    for (const [start, end, minimum, maximum] of [
      [from.x, to.x, tray.left, tray.right],
      [-from.y, -to.y, tray.top, tray.bottom],
    ] as const) {
      const delta = end - start;
      if (Math.abs(delta) < 1e-8) {
        if (start < minimum || start > maximum) return false;
      } else {
        const first = (minimum - start) / delta;
        const last = (maximum - start) / delta;
        enter = Math.max(enter, Math.min(first, last));
        exit = Math.min(exit, Math.max(first, last));
        if (enter > exit) return false;
      }
    }
    return true;
  }

  private nudges = 0;
  private finishing?: { eases: Ease[]; step: number; steps: number };

  /**
   * A die's finishing move into its final pose: slid into its target and,
   * unless it's heavy, laid flat and its label turned towards upright.
   */
  private ease(die: FlightBody): Ease {
    const { body, vertices } = die;
    const from = body.quaternion.clone();
    const to = die.heavy ? from.clone() : this.layFlat(die);
    // It comes to rest on the floor of the tray, in its target.
    const toPosition = new Vec3(die.target.x, die.target.y, -lowestPoint(to, vertices));
    body.collisionFilterMask = 0;
    return { die, from, to, fromPosition: body.position.clone(), toPosition };
  }

  /**
   * How a die comes to lie: down onto the face it leans towards (or a face-up
   * die up onto its point), turned about the vertical so its top label is
   * turned only half as far from upright.
   */
  private layFlat({ body, labelUps, faceUp }: FlightBody) {
    const { faceNormals } = body.shapes[0] as ConvexPolyhedron;
    const from = body.quaternion;
    const sign = faceUp ? 1 : -1;
    const lying = from.vmult(faceNormals[faceTowards(body, from, sign)]!);
    const to = new Quaternion().setFromVectors(lying, new Vec3(0, 0, sign)).mult(from);
    to.normalize();
    const labelUp = labelUps?.[faceTowards(body, to, 1)];
    if (labelUp) {
      const up = to.vmult(labelUp);
      // Anticlockwise from upright, as the player sees it.
      const turn = Math.atan2(-up.x, up.y);
      const twist = new Quaternion().setFromAxisAngle(
        new Vec3(0, 0, 1),
        -turn * (1 - LABEL_TURN_KEPT),
      );
      to.copy(twist.mult(to)).normalize();
    }
    return to;
  }

  /** Starts every die's finishing move, however they lie. */
  finish() {
    if (this.finishing) return;
    for (const die of this.dice) {
      if (die.active) continue;
      die.active = true;
      this.trayWorld.world.addBody(die.body);
    }
    for (const die of this.dice) if (!die.captured) this.dropIn(die);
    const eases = this.dice.map((die) => this.ease(die));
    const farthest = Math.max(
      ...eases.map(({ fromPosition, toPosition }) =>
        Math.hypot(toPosition.x - fromPosition.x, toPosition.y - fromPosition.y),
      ),
    );
    const steps = Math.min(
      MAX_FINISH_STEPS,
      Math.round(FINISH_STEPS + farthest * FINISH_STEPS_PER_UNIT),
    );
    this.finishing = { eases, step: 0, steps };
  }

  private stepFinish() {
    const finishing = this.finishing!;
    finishing.step++;
    const t = Math.min(1, finishing.step / finishing.steps);
    const eased = t * t * (3 - 2 * t);
    for (const { die, from, to, fromPosition, toPosition } of finishing.eases) {
      from.slerp(to, eased, die.body.quaternion);
      fromPosition.lerp(toPosition, eased, die.body.position);
      // Turning as it slides, it rocks up over its corners rather than through the floor.
      const { position, quaternion } = die.body;
      position.z = Math.max(position.z, -lowestPoint(quaternion, die.vertices));
      die.body.velocity.setZero();
      die.body.angularVelocity.setZero();
      die.impact = 0;
      die.home = eased;
    }
    return t === 1;
  }

  /** Wakes a die left cocked and tips it off, the way a tray settles when it's bumped. */
  private uncock(die: FlightBody, random: () => number) {
    const { body } = die;
    body.wakeUp();
    die.still = 0;
    const centre = {
      x: (this.tray.left + this.tray.right) / 2 - body.position.x,
      y: -(this.tray.top + this.tray.bottom) / 2 - body.position.y,
    };
    const toCentre = Math.hypot(centre.x, centre.y) || 1;
    body.velocity.set(
      (centre.x / toCentre) * 2 + (random() - 0.5) * 3,
      (centre.y / toCentre) * 2 + (random() - 0.5) * 3,
      3,
    );
    body.angularVelocity.set((random() - 0.5) * 12, (random() - 0.5) * 12, (random() - 0.5) * 4);
  }

  private drawTowardsTarget({ body, target }: FlightBody) {
    const pull = new Vec3(target.x - body.position.x, target.y - body.position.y, 0);
    pull.scale(TARGET_PULL, pull);
    const size = pull.length();
    if (size > MAX_TARGET_PULL) pull.scale(MAX_TARGET_PULL / size, pull);
    body.applyForce(pull);
  }

  /** Catches a die that was knocked off course before it reached the tray. */
  private dropIn(die: FlightBody) {
    const { body } = die;
    body.position.set(
      (this.tray.left + this.tray.right) / 2,
      -(this.tray.top + this.tray.bottom) / 2,
      4,
    );
    body.velocity.set(0, 0, 0);
    this.capture(die);
  }

  private capture(die: FlightBody) {
    die.captured = true;
    die.body.collisionFilterMask = DICE | TRAY;
    die.body.position.z = Math.max(1.5, die.body.position.z);
  }

  /** Moves the roll on a step; true once every die is at rest in its target. */
  step() {
    if (this.finishing) return this.stepFinish();
    for (const die of this.dice) {
      if (!die.active && this.elapsed >= die.delay) {
        die.active = true;
        // Dice hit each other in the air, but only meet the walls once over the tray.
        die.body.collisionFilterMask = die.captured ? DICE | TRAY : DICE;
        this.trayWorld.world.addBody(die.body);
      }
    }
    this.elapsed += PHYSICS_STEP;
    if (
      !this.calmed &&
      this.elapsed >= this.calmAfter + Math.max(0, ...this.dice.map((die) => die.delay))
    ) {
      this.calmed = true;
      for (const { body } of this.dice) {
        body.linearDamping = 0.95;
        body.angularDamping = 0.98;
      }
      this.trayWorld.calm();
    }
    for (const die of this.dice) if (die.active) this.drawTowardsTarget(die);
    const previous = this.dice.map(({ body }) => body.position.clone());
    const before = this.dice.map(({ body }) => body.velocity.clone());
    this.trayWorld.world.step(PHYSICS_STEP);
    for (const [index, die] of this.dice.entries()) {
      if (!die.active) continue;
      die.age += PHYSICS_STEP;
      if (!die.captured && this.entersTray(previous[index]!, die.body.position, this.tray))
        this.capture(die);
      else if (!die.captured && die.age > MAX_APPROACH) this.dropIn(die);
      if (!die.captured) continue;
      this.trayWorld.contain(die.body, die.vertices, 0.6);
      die.impact = impactOf(before[index]!, die.body);
      // Dice touching in a heap keep each other just awake; one that has all but stopped is put to sleep.
      const { velocity, angularVelocity } = die.body;
      die.still =
        velocity.length() < STILL_SPEED && angularVelocity.length() < STILL_SPEED
          ? die.still + PHYSICS_STEP
          : 0;
      if (die.still >= STILL_TIME && die.body.sleepState !== Body.SLEEPING) die.body.sleep();
    }
    const resting = this.dice.every((die) => die.captured && die.still >= STILL_TIME);
    if (!resting) return false;
    const leaning = this.dice.filter(
      (die) =>
        (!die.heavy && tilted(die.body)) ||
        (this.nudges < MAX_NUDGES && raised(die.body, die.vertices)),
    );
    if (leaning.length > 0 && this.nudges < MAX_NUDGES) {
      const random = seededRandom(`${this.nudges}:${this.elapsed}`);
      this.nudges++;
      for (const die of leaning) this.uncock(die, random);
      return false;
    }
    this.finish();
    return false;
  }

  poses(): DiePose[] {
    return this.dice.map(poseOf);
  }
}

/**
 * Every frame of a roll, per die, from the throw until all the dice are at rest
 * in their targets. A roll that hasn't stopped by the time limit is finished from where it is.
 */
export function simulateDice(tray: DieTray, throws: DieThrow[], calmAfter = CALM_AFTER) {
  const flight = new DiceFlight(tray, throws, calmAfter);
  const frames = flight.poses().map((pose) => [pose]);
  for (let step = 0; ; step++) {
    if (step === MAX_STEPS) flight.finish();
    const done = flight.step();
    for (const [index, pose] of flight.poses().entries()) frames[index]!.push(pose);
    if (done) return frames;
  }
}
