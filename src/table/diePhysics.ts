import {
  Body,
  ConvexPolyhedron,
  Plane,
  Quaternion,
  Vec3,
  World,
} from "cannon-es";


export interface DieHull {
  vertices: number[][];
  faces: number[][];
}

export interface DieTray {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const PHYSICS_STEP = 1 / 120;
const MAX_HOLD_HEIGHT = 8;
const MAX_HOLD_LIFT = 4;
const MAX_HOLD_UPWARD_SPEED = 10;

export interface DieThrow {
  hull: DieHull;
  seed: string;
  delay?: number;
}

interface FlightBody {
  body: Body;
  vertices: Vec3[];
  delay: number;
  active: boolean;
  captured: boolean;
}

export interface DiePose {
  x: number;
  y: number;
  z: number;
  quaternion: { x: number; y: number; z: number; w: number };
  captured: boolean;
  impact?: number;
}

/** Height of a die's centre when its resting orientation touches the tray floor. */
export function restingHeight(
  hull: DieHull,
  orientation: DiePose["quaternion"],
): number {
  const rotation = new Quaternion(
    orientation.x,
    orientation.y,
    orientation.z,
    orientation.w,
  );
  const lowest = Math.min(
    ...hull.vertices.map(([x, y, z]) => rotation.vmult(new Vec3(x, y, z)).z),
  );
  return Math.max(0.5, -lowest);
}

export interface HeldDie {
  hull: DieHull;
  x: number;
  y: number;
  z: number;
  quaternion: { x: number; y: number; z: number; w: number };
}

interface HeldBody {
  position: Vec3;
  quaternion: Quaternion;
  velocity: Vec3;
  angularVelocity: Vec3;
  radius: number;
}

/** Dice held at a cursor position, or carried inside a tray that can be jolted. */
export class DiceHold {
  private readonly dice: HeldBody[];

  constructor(
    private readonly tray: DieTray,
    dice: HeldDie[],
    private readonly mode: "locked" | "tray",
  ) {
    this.dice = dice.map((die) => {
      const quaternion = new Quaternion(
        die.quaternion.x,
        die.quaternion.y,
        die.quaternion.z,
        die.quaternion.w,
      );
      return {
        position: new Vec3(die.x, -die.y, die.z),
        quaternion,
        velocity: new Vec3(),
        angularVelocity: new Vec3(8, 11, 6),
        radius: die.hull.vertices.reduce(
          (largest, vertex) => Math.max(largest, Math.hypot((vertex)[0]!, (vertex)[1]!, (vertex)[2]!)),
          0,
        ),
      };
    });
  }

  jolt(x: number, y: number) {
    if (this.mode !== "tray") return;
    for (const die of this.dice) {
      die.velocity.x += x;
      die.velocity.y -= y;
      die.velocity.z = Math.min(
        MAX_HOLD_UPWARD_SPEED,
        die.velocity.z + Math.min(MAX_HOLD_LIFT, Math.hypot(x, y) * 0.7),
      );
      die.angularVelocity.x += y * 3;
      die.angularVelocity.y += x * 3;
    }
  }

  step() {
    const dt = PHYSICS_STEP;
    for (const die of this.dice) {
      if (this.mode === "tray") {
        die.velocity.z -= 28 * dt;
        die.position.vadd(die.velocity.scale(dt, new Vec3()), die.position);
        const floor = Math.max(0.5, die.radius);
        const ceiling = Math.max(MAX_HOLD_HEIGHT, floor + 1);
        if (die.position.z < floor) {
          die.position.z = floor;
          if (die.velocity.z < 0) die.velocity.z *= -0.55;
        }
        if (die.position.z > ceiling) {
          die.position.z = ceiling;
          if (die.velocity.z > 0) die.velocity.z *= -0.4;
        }
        const minX = this.tray.left + die.radius;
        const maxX = this.tray.right - die.radius;
        const minY = -this.tray.bottom + die.radius;
        const maxY = -this.tray.top - die.radius;
        for (const [axis, minimum, maximum] of [
          ["x", minX, maxX],
          ["y", minY, maxY],
        ] as const) {
          if (die.position[axis] < minimum || die.position[axis] > maximum) {
            die.position[axis] = Math.max(
              minimum,
              Math.min(maximum, die.position[axis]),
            );
            die.velocity[axis] *= -0.5;
          }
        }
        die.velocity.scale(0.995, die.velocity);
      }
      const speed = die.angularVelocity.length();
      if (speed) {
        const axis = die.angularVelocity.scale(1 / speed, new Vec3());
        const delta = new Quaternion().setFromAxisAngle(axis, speed * dt);
        die.quaternion.mult(delta, die.quaternion);
      }
    }
  }

  poses(): DiePose[] {
    return this.dice.map((die) => ({
      x: die.position.x,
      y: -die.position.y,
      z: die.position.z,
      quaternion: {
        x: die.quaternion.x,
        y: die.quaternion.y,
        z: die.quaternion.z,
        w: die.quaternion.w,
      },
      captured: true,
    }));
  }
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed)
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class DiceFlight {
  private readonly world = new World({
    gravity: new Vec3(0, 0, -28),
    allowSleep: true,
  });
  readonly dice: FlightBody[];
  private elapsed = 0;

  constructor(
    private readonly tray: DieTray,
    throws: DieThrow[],
  ) {
    this.dice = throws.map(({ hull, seed, delay = 0 }) => {
      const random = seededRandom(seed);
      const vertices = hull.vertices.map(([x, y, z]) => new Vec3(x, y, z));
      const body = new Body({
        mass: 1,
        shape: new ConvexPolyhedron({ vertices, faces: hull.faces }),
        position: new Vec3(
          tray.left + (0.3 + random() * 0.4) * (tray.right - tray.left),
          -tray.top + 2,
          4 + random() * 2,
        ),
        linearDamping: 0.2,
        angularDamping: 0.25,
        allowSleep: true,
        sleepSpeedLimit: 0.15,
        sleepTimeLimit: 0.6,
        collisionFilterGroup: 1,
        collisionFilterMask: 0,
      });
      body.quaternion.setFromEuler(
        random() * Math.PI,
        random() * Math.PI,
        random() * Math.PI,
      );
      body.velocity.set(
        (random() - 0.5) * 5,
        -10 - random() * 6,
        3 + random() * 4,
      );
      body.angularVelocity.set(
        random() * 24 - 12,
        random() * 24 - 12,
        random() * 24 - 12,
      );
      return {
        body,
        vertices,
        delay: delay / 1000,
        active: false,
        captured: false,
      };
    });
    this.world.defaultContactMaterial.restitution = 0.65;
    this.world.defaultContactMaterial.friction = 0.45;
    this.addPlane(new Vec3(), new Vec3(0, 0, 1));
    this.addPlane(new Vec3(tray.left, 0, 0), new Vec3(1, 0, 0));
    this.addPlane(new Vec3(tray.right, 0, 0), new Vec3(-1, 0, 0));
    this.addPlane(new Vec3(0, -tray.top, 0), new Vec3(0, -1, 0));
    this.addPlane(new Vec3(0, -tray.bottom, 0), new Vec3(0, 1, 0));
  }

  private addPlane(position: Vec3, normal: Vec3) {
    const wall = new Body({
      mass: 0,
      shape: new Plane(),
      position,
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    wall.quaternion.setFromVectors(new Vec3(0, 0, 1), normal);
    this.world.addBody(wall);
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

  private contain({ body, vertices }: FlightBody) {
    const tray = this.tray;
    const offsets = vertices.map((vertex) => body.quaternion.vmult(vertex));
    for (const [axis, minimum, maximum] of [
      ["x", tray.left, tray.right],
      ["y", -tray.bottom, -tray.top],
    ] as const) {
      const lower =
        minimum - Math.min(...offsets.map((vertex) => vertex[axis]));
      const upper =
        maximum - Math.max(...offsets.map((vertex) => vertex[axis]));
      const position = body.position[axis];
      body.position[axis] =
        lower > upper
          ? (minimum + maximum) / 2
          : Math.max(lower, Math.min(upper, position));
      if (
        (position < lower && body.velocity[axis] < 0) ||
        (position > upper && body.velocity[axis] > 0)
      ) {
        body.velocity[axis] *= -0.65;
      }
    }
  }

  step() {
    for (const die of this.dice) {
      if (!die.active && this.elapsed >= die.delay) {
        die.active = true;
        die.body.collisionFilterMask = 1;
        this.world.addBody(die.body);
      }
    }
    this.elapsed += PHYSICS_STEP;
    if (this.elapsed >= 4 + Math.max(0, ...this.dice.map((die) => die.delay))) {
      for (const { body } of this.dice) {
        body.linearDamping = 0.95;
        body.angularDamping = 0.98;
      }
      this.world.defaultContactMaterial.restitution = 0.1;
      this.world.defaultContactMaterial.friction = 0.85;
    }
    const previous = this.dice.map(({ body }) => body.position.clone());
    this.world.step(PHYSICS_STEP);
    for (const [index, die] of this.dice.entries()) {
      if (!die.active) continue;
      if (
        !die.captured &&
        this.entersTray((previous)[index]!, die.body.position, this.tray)
      ) {
        die.captured = true;
        die.body.collisionFilterMask = 3;
        die.body.position.z = Math.max(1.5, die.body.position.z);
      }
      if (die.captured) this.contain(die);
    }
    return this.dice.every(
      (die) => die.captured && die.body.sleepState === Body.SLEEPING,
    );
  }

  poses(): DiePose[] {
    return this.dice.map(({ body: { position, quaternion }, captured }) => ({
      x: position.x,
      y: -position.y,
      z: position.z,
      quaternion: {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      },
      captured,
    }));
  }
}

export function simulateDice(tray: DieTray, throws: DieThrow[]) {
  const flight = new DiceFlight(tray, throws);
  const frames = flight.poses().map((pose) => [pose]);
  for (let step = 0; step < 3600; step++) {
    const sleeping = flight.step();
    flight.poses().forEach((pose, index) => (frames)[index]!.push(pose));
    if (sleeping) return frames;
  }
  throw new Error("Dice did not settle naturally");
}
