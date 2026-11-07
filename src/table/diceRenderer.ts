import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DodecahedronGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OctahedronGeometry,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  TetrahedronGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { playDiceImpact } from "../ui/sounds";
import { PHYSICS_STEP, simulateDice, type DieHull, type DiePose } from "./diePhysics";

/*
 * Dice in 3D. One small renderer draws a die and the result is copied into the
 * die's canvas in the chat. The dice of a roll are thrown together into their
 * roll card's tray (table/diePhysics.ts); each is drawn the same way, every
 * frame, into a canvas that follows its flight across the window.
 */

export interface Point {
  x: number;
  y: number;
}
export interface DiceRenderer {
  mount(
    canvas: HTMLCanvasElement,
    slot: HTMLElement,
    die: { sides: number; value: number; seed: string },
    thrown?: { from: Point; delay: number },
  ): { landed: Promise<void>; dispose(): void };
  /**
   * Tumbles the landed dice drawn in `originals` in the canvases at the same
   * places in `copies`; the returned function settles them back as they were.
   */
  spin(originals: HTMLCanvasElement[], copies: HTMLCanvasElement[]): () => void;
}

/** A die's canvas, in CSS px; dice are drawn at SCALE px per unit. */
const SLOT = 64;
const SCALE = 24;
/** Settled dice glide into their slots, starting this long before the roll ends. */
const GLIDE_LEAD_MS = 800;
const GLIDE_MS = 650;
/** Radians per second a carried die tumbles at, and how long it takes to settle back. */
const SPIN_SPEED = 12;
const SETTLE_MS = 220;
const Z = new Vector3(0, 0, 1);

type Tone = "plain" | "max" | "min";
const TONE_TOKEN: Record<Tone, string> = {
  plain: "--gem-smoky",
  max: "--accent",
  min: "--gem-danger",
};
const toneOf = (value: number, sides: number): Tone =>
  value === sides && sides > 1 ? "max" : value === 1 ? "min" : "plain";
/** The number on each face, counting on from the one turned to the viewer. */
const faceValue = (value: number, index: number, sides: number) =>
  ((value - 1 + index) % sides) + 1;

interface Face {
  centre: Vector3;
  normal: Vector3;
  rotation: Quaternion;
  size: number;
  points: Vector3[];
}
interface Shape {
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  faces: Face[];
  hull: DieHull;
  /** The pose that turns the first face to the viewer. */
  rest: Quaternion;
}

/** A d10: ten kites, which stay flat when the poles stand this far above the zig-zag rim. */
function trapezohedron(): BufferGeometry {
  const c = Math.cos(Math.PI / 5);
  const pole = 1.15;
  const rim = pole / (1 + (2 * c) / (1 - c));
  const top = new Vector3(0, pole, 0);
  const bottom = new Vector3(0, -pole, 0);
  const zigzag = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5;
    return new Vector3(Math.cos(a), i % 2 ? -rim : rim, Math.sin(a));
  });
  const positions: number[] = [];
  for (let k = 0; k < 10; k += 2) {
    const [up, down, nextUp, nextDown] = [0, 1, 2, 3].map((i) => zigzag[(k + i) % 10]!) as [
      Vector3,
      Vector3,
      Vector3,
      Vector3,
    ];
    for (const [a, b, c] of [
      [top, up, down],
      [top, down, nextUp],
      [bottom, down, nextUp],
      [bottom, nextUp, nextDown],
    ] as const) {
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const outward = normal.dot(a.clone().add(b).add(c)) > 0;
      positions.push(...(outward ? [a, b, c] : [a, c, b]).flatMap((v) => v.toArray()));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Groups the triangles of a convex solid into its faces, one material group each. */
function facesOf(geometry: BufferGeometry): { faces: Face[]; hull: DieHull } {
  const position = geometry.getAttribute("position");
  const planes: { normal: Vector3; points: Vector3[] }[] = [];
  geometry.clearGroups();
  for (let offset = 0; offset < position.count; offset += 3) {
    const [a, b, c] = [0, 1, 2].map((i) => new Vector3().fromBufferAttribute(position, offset + i));
    const normal = b!.clone().sub(a!).cross(c!.clone().sub(a!)).normalize();
    let index = planes.findIndex((plane) => plane.normal.distanceTo(normal) < 1e-4);
    if (index < 0) index = planes.push({ normal, points: [] }) - 1;
    const { points } = planes[index]!;
    for (const v of [a!, b!, c!]) if (!points.some((p) => p.distanceTo(v) < 1e-4)) points.push(v);
    geometry.addGroup(offset, 3, index);
  }
  const vertices: Vector3[] = [];
  const faces = planes.map(({ normal, points }) => {
    const centre = points.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(points.length);
    const radius = Math.min(...points.map((p) => p.distanceTo(centre)));
    const rotation = new Quaternion().setFromUnitVectors(Z, normal);
    // Corners in order around the face, as the physics hull wants them.
    const inverse = rotation.clone().invert();
    const angle = (v: Vector3) => {
      const local = v.clone().sub(centre).applyQuaternion(inverse);
      return Math.atan2(local.y, local.x);
    };
    const indices = [...points]
      .sort((a, b) => angle(a) - angle(b))
      .map((v) => {
        const index = vertices.findIndex((w) => w.distanceTo(v) < 1e-4);
        return index < 0 ? vertices.push(v) - 1 : index;
      });
    const face = {
      centre,
      normal,
      points,
      rotation,
      size: radius * Math.cos(Math.PI / points.length) * 1.65,
    };
    return { face, indices };
  });
  return {
    faces: faces.map(({ face }) => face),
    hull: {
      vertices: vertices.map((v) => v.toArray()),
      faces: faces.map(({ indices }) => indices),
    },
  };
}

const shapes = new Map<number, Shape>();
function shapeFor(sides: number): Shape {
  const key = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 20;
  let shape = shapes.get(key);
  if (shape) return shape;
  const geometry =
    key === 4
      ? new TetrahedronGeometry(1.15)
      : key === 6
        ? new BoxGeometry(1.3, 1.3, 1.3).toNonIndexed()
        : key === 8
          ? new OctahedronGeometry(1.2)
          : key === 10
            ? trapezohedron()
            : key === 12
              ? new DodecahedronGeometry(1.1)
              : new IcosahedronGeometry(1.15);
  geometry.computeBoundingSphere();
  const scale = 28 / (SCALE * geometry.boundingSphere!.radius);
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  const { faces, hull } = facesOf(geometry);
  const first = faces[0]!;
  const rest = new Quaternion().setFromUnitVectors(first.normal, Z);
  // A cube sits square; the rest stand on a corner.
  if (key !== 6) {
    const far = first.points.reduce((best, v) =>
      v.distanceTo(first.centre) > best.distanceTo(first.centre) ? v : best,
    );
    const tip = far.clone().sub(first.centre).applyQuaternion(rest);
    rest.premultiply(new Quaternion().setFromAxisAngle(Z, Math.PI / 2 - Math.atan2(tip.y, tip.x)));
  }
  shape = { geometry, edges: new EdgesGeometry(geometry), faces, hull, rest };
  shapes.set(key, shape);
  return shape;
}

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
/** A colour token as rgb(), which three can read; the tokens are written in oklch. */
function token(name: string): string {
  probe.fillStyle = "#888";
  probe.fillStyle =
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

export function createDiceRenderer(): DiceRenderer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(SLOT, SLOT, false);

  const scene = new Scene();
  const reflections = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = reflections.fromScene(room, 0.02).texture;
  scene.environmentIntensity = 0.8;
  room.dispose();
  reflections.dispose();
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-2, 3, 4);
  const rim = new DirectionalLight(0xc8e8ff, 1.8);
  rim.position.set(3, -1, 2);
  scene.add(new HemisphereLight(0xffffff, 0x334055, 1.6), key, rim);
  const camera = new OrthographicCamera(-SLOT / 2, SLOT / 2, SLOT / 2, -SLOT / 2, -100, 100);

  const materials = Object.fromEntries(
    (["plain", "max", "min"] as const).map((tone) => [
      tone,
      new MeshPhysicalMaterial({
        roughness: 0.2,
        metalness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        specularIntensity: 1.3,
        iridescence: 0.12,
        flatShading: true,
      }),
    ]),
  ) as Record<Tone, MeshPhysicalMaterial>;
  const edgeMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

  /** A die showing `value` on its first face, with every face numbered; dispose() frees its labels. */
  function dieMesh(shape: Shape, value: number, sides: number) {
    for (const tone of ["plain", "max", "min"] as const)
      materials[tone].color.set(token(TONE_TOKEN[tone]));
    const die = new Mesh(
      shape.geometry,
      shape.faces.map((_, i) => materials[toneOf(faceValue(value, i, sides), sides)]),
    );
    die.scale.setScalar(SCALE);
    die.add(new LineSegments(shape.edges, edgeMaterial));
    const font = `700 104px ${getComputedStyle(document.body).fontFamily}`;
    const labels = shape.faces.map((face, index) => {
      const number = faceValue(value, index, sides);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d")!;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = token(toneOf(number, sides) === "max" ? "--accent-ink" : "--text");
      context.fillText(String(number), 64, 67, 120);
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      const label = new Mesh(
        new PlaneGeometry(face.size, face.size),
        new MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
      );
      label.position.copy(face.centre).addScaledVector(face.normal, 0.003);
      label.quaternion.copy(index === 0 ? shape.rest.clone().invert() : face.rotation);
      die.add(label);
      return label;
    });
    const dispose = () => {
      for (const label of labels) {
        label.geometry.dispose();
        label.material.map?.dispose();
        label.material.dispose();
      }
    };
    return { die, dispose };
  }

  function draw(die: Mesh, canvas: HTMLCanvasElement) {
    scene.add(die);
    renderer.render(scene, camera);
    scene.remove(die);
    const source = renderer.domElement;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
  }

  /** How each landed die is drawn: its first face's number and its pose. */
  const posed = new WeakMap<
    HTMLCanvasElement,
    { sides: number; value: number; rotation: Quaternion }
  >();

  /** Draws a die at rest in its slot's canvas. */
  function still(canvas: HTMLCanvasElement, sides: number, value: number) {
    const shape = shapeFor(sides);
    const { die, dispose } = dieMesh(shape, value, sides);
    die.quaternion.copy(shape.rest);
    draw(die, canvas);
    dispose();
    posed.set(canvas, { sides, value, rotation: shape.rest });
  }

  const quaternion = (q: DiePose["quaternion"]) => new Quaternion(q.x, q.y, q.z, q.w);

  /** Plays one die's simulated flight over the window, from where it was thrown into its slot. */
  function fly(job: Job, tray: HTMLElement, frames: DiePose[], start: number) {
    const { canvas, slot, die: roll, thrown } = job;
    const shape = shapeFor(roll.sides);
    const rest = frames.at(-1)!;
    const final = quaternion(rest.quaternion);
    // Number the faces so the one that lands facing up shows the roll.
    const up = shape.faces.map((face) => face.normal.clone().applyQuaternion(final).z);
    const top = up.indexOf(Math.max(...up));
    const first = ((roll.value - 1 - top + roll.sides) % roll.sides) + 1;
    const { die, dispose } = dieMesh(shape, first, roll.sides);
    die.quaternion.copy(final);
    draw(die, canvas);
    posed.set(canvas, { sides: roll.sides, value: first, rotation: final });

    const air = document.createElement("canvas");
    air.className = "dice-flight";
    air.setAttribute("aria-hidden", "true");
    air.style.width = air.style.height = `${SLOT}px`;
    air.style.visibility = "hidden";
    document.body.append(air);
    const step = PHYSICS_STEP * 1000;
    const entry = Math.max(
      0,
      frames.findIndex((pose) => pose.captured),
    );
    const launch = thrown.delay / step;
    const glide = start + (frames.length - 1) * step - GLIDE_LEAD_MS;
    let frame = 0;
    let sounded = -1;
    const finish = () => {
      cancelAnimationFrame(frame);
      air.remove();
      dispose();
      job.land();
    };
    job.cancel = finish;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now < start + thrown.delay) return;
      if (!slot.isConnected) return finish();
      const at = Math.min((now - start) / step, frames.length - 1);
      const index = Math.floor(at);
      const mix = at - index;
      const a = frames[index]!;
      const b = frames[Math.min(index + 1, frames.length - 1)]!;
      if (index !== sounded) {
        sounded = index;
        if ((a.impact ?? 0) > 2.5) playDiceImpact(a.impact!);
      }
      const box = tray.getBoundingClientRect();
      const screen = (pose: DiePose) => ({
        x: box.left + pose.x * SCALE,
        y: box.top + pose.y * SCALE,
      });
      let x: number;
      let y: number;
      if (index < entry) {
        // Until it's over the tray, it flies straight from the hand.
        const target = screen(frames[entry]!);
        const k = entry > launch ? Math.max(0, (at - launch) / (entry - launch)) : 1;
        x = thrown.from.x + (target.x - thrown.from.x) * k;
        y = thrown.from.y + (target.y - thrown.from.y) * k;
      } else {
        const p = screen(a);
        const q = screen(b);
        x = p.x + (q.x - p.x) * mix;
        y = p.y + (q.y - p.y) * mix;
      }
      const g = Math.min(1, Math.max(0, (now - glide) / GLIDE_MS)) ** 2;
      const home = slot.getBoundingClientRect();
      x += (home.left + home.width / 2 - x) * g;
      y += (home.top + home.height / 2 - y) * g;
      const lift = Math.max(0, a.z + (b.z - a.z) * mix - rest.z);
      die.quaternion.copy(quaternion(a.quaternion).slerp(quaternion(b.quaternion), mix));
      draw(die, air);
      air.style.visibility = "";
      air.style.transform = `translate(${x - SLOT / 2}px, ${y - SLOT / 2}px) scale(${1 + lift * 0.05})`;
      air.style.filter = `drop-shadow(${3 + lift * 2}px ${5 + lift * 3}px ${2 + lift * 2}px rgb(0 0 0 / 0.3))`;
      if (g === 1) finish();
    };
    frame = requestAnimationFrame(tick);
  }

  interface Job {
    canvas: HTMLCanvasElement;
    slot: HTMLElement;
    die: { sides: number; value: number; seed: string };
    thrown: { from: Point; delay: number };
    land: () => void;
    cancel?: () => void;
    cancelled: boolean;
  }
  /** Dice thrown in the same task land in their roll card together, knocking into each other. */
  const pending = new Map<HTMLElement, Job[]>();

  function flush() {
    for (const [tray, all] of pending) {
      const jobs = all.filter((job) => !job.cancelled);
      if (!jobs.length) continue;
      const box = tray.getBoundingClientRect();
      let frames: DiePose[][] | undefined;
      try {
        frames = simulateDice(
          { left: 0, top: 0, right: box.width / SCALE, bottom: box.height / SCALE },
          jobs.map(({ die, thrown }) => ({
            hull: shapeFor(die.sides).hull,
            seed: die.seed,
            delay: thrown.delay,
          })),
        );
      } catch {
        // Without a flight, the dice are simply there.
      }
      const start = performance.now();
      jobs.forEach((job, index) => {
        if (frames) return fly(job, tray, frames[index]!, start);
        still(job.canvas, job.die.sides, job.die.value);
        job.land();
      });
    }
    pending.clear();
  }

  function spin(originals: HTMLCanvasElement[], copies: HTMLCanvasElement[]) {
    const dice = copies.flatMap((canvas, index) => {
      const pose = posed.get(originals[index]!);
      if (!pose) return [];
      const { die, dispose } = dieMesh(shapeFor(pose.sides), pose.value, pose.sides);
      die.quaternion.copy(pose.rotation);
      const axis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      return [{ canvas, die, dispose, rest: pose.rotation, axis: axis.normalize() }];
    });
    let settling: { start: number; from: Quaternion[] } | undefined;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const turn = (SPIN_SPEED * (now - last)) / 1000;
      last = now;
      const t = settling ? Math.min(1, (now - settling.start) / SETTLE_MS) : 0;
      dice.forEach(({ canvas, die, rest, axis }, index) => {
        if (settling) die.quaternion.copy(settling.from[index]!).slerp(rest, t * t * (3 - 2 * t));
        else die.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, turn));
        draw(die, canvas);
      });
      if (t === 1 || !dice.every(({ canvas }) => canvas.isConnected)) {
        for (const { dispose } of dice) dispose();
      } else frame = requestAnimationFrame(tick);
    });
    return () => {
      if (!dice.length) cancelAnimationFrame(frame);
      settling ??= {
        start: performance.now(),
        from: dice.map(({ die }) => die.quaternion.clone()),
      };
    };
  }

  return {
    spin,
    mount(canvas, slot, die, thrown) {
      if (!thrown) {
        still(canvas, die.sides, die.value);
        return { landed: Promise.resolve(), dispose() {} };
      }
      let land!: () => void;
      const landed = new Promise<void>((resolve) => (land = resolve));
      const job: Job = { canvas, slot, die, thrown, land, cancelled: false };
      const tray = slot.closest<HTMLElement>(".roll-card") ?? slot;
      if (!pending.size) queueMicrotask(flush);
      pending.set(tray, [...(pending.get(tray) ?? []), job]);
      return {
        landed,
        dispose() {
          job.cancelled = true;
          job.cancel?.();
          land();
        },
      };
    },
  };
}
