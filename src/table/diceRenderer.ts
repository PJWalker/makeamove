import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
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
import { discHull, PHYSICS_STEP, simulateDice, type DieHull, type DiePose } from "./diePhysics";

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
/** A die showing `value`, or a flat round chip with `chip` on both faces (lines split by \n). */
export type Piece = { sides: number; value: number; seed: string } | { chip: string; seed: string };

export interface DiceRenderer {
  mount(
    canvas: HTMLCanvasElement,
    slot: HTMLElement,
    piece: Piece,
    thrown?: { from: Point; delay: number },
  ): { landed: Promise<void>; dispose: () => void };
  /**
   * Tumbles the landed dice drawn in `originals` in the canvases at the same
   * places in `copies`; the returned function settles them back as they were.
   */
  spin(originals: HTMLCanvasElement[], copies: HTMLCanvasElement[]): () => void;
}

/** A die's canvas, in CSS px; dice are drawn at SCALE px per unit. */
const SLOT = 64;
const SCALE = 24;
/**
 * Settling dice are pulled into their slots, starting this long before the roll
 * ends, and this much sooner for every px they'll come to rest from their slot.
 */
const PULL_LEAD_MS = 800;
const PULL_LEAD_PER_PX_MS = 1.5;
/** The pull's spring: its natural frequency (radians/s) and damping ratio, low enough to overshoot. */
const PULL_STIFFNESS = 12;
const PULL_DAMPING = 0.75;
/** Seconds per step of the pull's spring, whatever the frame rate. */
const PULL_STEP = 1 / 240;
/** Close enough to its slot, in px and px/s, for a pulled die to drop into it. */
const PULL_REST = 0.5;
const PULL_REST_SPEED = 20;
/** Radians per second a carried die tumbles at, and how long it takes to settle back. */
const SPIN_SPEED = 12;
const SETTLE_MS = 220;
const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);
/** A chip's radius and thickness, in units. */
const CHIP_RADIUS = 0.95;
const CHIP_THICKNESS = 0.22;

type Tone = "plain" | "max" | "min";
const TONE_TOKEN: Record<Tone, string> = {
  plain: "--die-colour",
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
/** A die or token ready to draw; dispose() frees its labels. */
interface Drawn {
  die: Mesh;
  dispose: () => void;
}
interface Shape {
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  faces: Face[];
  hull: DieHull;
  /** The pose that turns the first face to the viewer. */
  rest: Quaternion;
  /** How each face's label is turned on the die: the first reads upright at rest. */
  labelRotations: Quaternion[];
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
  const labelRotations = faces.map((face, index) =>
    index === 0 ? rest.clone().invert() : face.rotation,
  );
  shape = {
    geometry,
    edges: new EdgesGeometry(geometry),
    faces,
    hull: {
      ...hull,
      labelUps: labelRotations.map((rotation) => Y.clone().applyQuaternion(rotation).toArray()),
      faceUp: key === 4,
    },
    rest,
    labelRotations,
  };
  shapes.set(key, shape);
  return shape;
}

let chipGeometry: CylinderGeometry | undefined;
/** A chip: a flat disc, its faces towards and away from the viewer. Groups: rim, front, back. */
function chipShape() {
  if (chipGeometry) return chipGeometry;
  chipGeometry = new CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_THICKNESS, 48);
  chipGeometry.rotateX(Math.PI / 2);
  return chipGeometry;
}
const chipHull = discHull(CHIP_RADIUS, CHIP_THICKNESS);
// Both labels read upright with the chip unturned; the back's is flipped about Y.
chipHull.labelUps = chipHull.faces.map(() => Y.toArray());
const hullOf = (piece: Piece) => ("chip" in piece ? chipHull : shapeFor(piece.sides).hull);

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
/** A colour token as rgb(), which three can read; the tokens are written in oklch. */
function token(name: string, from: Element = document.documentElement): string {
  probe.fillStyle = "#888";
  probe.fillStyle = getComputedStyle(from).getPropertyValue(name).trim() || "#888";
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
        specularIntensity: 1,
        iridescence: 0.12,
        flatShading: true,
      }),
    ]),
  ) as Record<Tone, MeshPhysicalMaterial>;
  const edgeMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  // Satin rather than glossy: a flat face turned to the light would shine its label away.
  const chipFace = materials.plain.clone();
  chipFace.flatShading = false;
  chipFace.roughness = 0.55;
  chipFace.clearcoat = 0.3;
  chipFace.iridescence = 0;
  const chipRim = chipFace.clone();

  /**
   * A face's number or text, drawn on a square `size` units across, facing +Z.
   * Text of two lines puts a smaller caption over the main line.
   */
  function label(text: string, colour: string, size: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const font = (px: number) => `700 ${px}px ${getComputedStyle(document.body).fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = colour;
    const [first, second] = text.split("\n");
    if (second === undefined) {
      context.font = font(104);
      context.fillText(text, 64, 67, 120);
    } else {
      context.font = font(38);
      context.fillText(first!, 64, 38, 96);
      context.font = font(64);
      context.fillText(second, 64, 84, 104);
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
    );
  }
  const disposeLabels = (labels: ReturnType<typeof label>[]) => () => {
    for (const mesh of labels) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
  };

  /** A chip with `text` on both faces, in the colour `--chip-face` has where `canvas` sits. */
  function chipMesh(text: string, canvas: HTMLCanvasElement): Drawn {
    const face = token("--chip-face", canvas);
    chipFace.color.set(face);
    chipRim.color.set(face).multiplyScalar(0.5);
    const disc = new Mesh(chipShape(), [chipRim, chipFace, chipFace]);
    disc.scale.setScalar(SCALE);
    const labels = [1, -1].map((side) => {
      const mesh = label(text, token("--text"), CHIP_RADIUS * 1.3);
      mesh.position.z = side * (CHIP_THICKNESS / 2 + 0.003);
      if (side < 0) mesh.rotation.y = Math.PI;
      disc.add(mesh);
      return mesh;
    });
    return { die: disc, dispose: disposeLabels(labels) };
  }

  /**
   * A die showing `value` on its first face, with every face numbered, in the
   * colours of the slot `canvas` sits in; dispose() frees its labels.
   */
  function dieMesh(shape: Shape, value: number, sides: number, canvas: HTMLCanvasElement): Drawn {
    for (const tone of ["plain", "max", "min"] as const)
      materials[tone].color.set(token(TONE_TOKEN[tone], canvas));
    const die = new Mesh(
      shape.geometry,
      shape.faces.map((_, i) => materials[toneOf(faceValue(value, i, sides), sides)]),
    );
    die.scale.setScalar(SCALE);
    die.add(new LineSegments(shape.edges, edgeMaterial));
    const labels = shape.faces.map((face, index) => {
      const number = faceValue(value, index, sides);
      const colour = token(toneOf(number, sides) === "max" ? "--accent-ink" : "--text");
      const mesh = label(String(number), colour, face.size);
      mesh.position.copy(face.centre).addScaledVector(face.normal, 0.003);
      mesh.quaternion.copy(shape.labelRotations[index]!);
      die.add(mesh);
      return mesh;
    });
    return { die, dispose: disposeLabels(labels) };
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

  /** How each landed die or token is drawn again, into another canvas, and its pose. */
  const posed = new WeakMap<
    HTMLCanvasElement,
    { build: (canvas: HTMLCanvasElement) => Drawn; rotation: Quaternion }
  >();

  /** Draws a die or token at rest in its slot's canvas. */
  function still(
    canvas: HTMLCanvasElement,
    build: (canvas: HTMLCanvasElement) => Drawn,
    rotation: Quaternion,
  ) {
    const { die, dispose } = build(canvas);
    die.quaternion.copy(rotation);
    draw(die, canvas);
    dispose();
    posed.set(canvas, { build, rotation });
  }
  const stillPiece = (canvas: HTMLCanvasElement, piece: Piece) =>
    "chip" in piece
      ? still(canvas, (into) => chipMesh(piece.chip, into), new Quaternion())
      : still(
          canvas,
          (into) => dieMesh(shapeFor(piece.sides), piece.value, piece.sides, into),
          shapeFor(piece.sides).rest,
        );

  /** How a landed piece is drawn: a die numbered so the face that lands up shows its roll. */
  function landedAs(piece: Piece, final: Quaternion): (canvas: HTMLCanvasElement) => Drawn {
    if ("chip" in piece) return (into) => chipMesh(piece.chip, into);
    const shape = shapeFor(piece.sides);
    const up = shape.faces.map((face) => face.normal.clone().applyQuaternion(final).z);
    const top = up.indexOf(Math.max(...up));
    const first = ((piece.value - 1 - top + piece.sides) % piece.sides) + 1;
    return (into) => dieMesh(shape, first, piece.sides, into);
  }

  const quaternion = (q: DiePose["quaternion"]) => new Quaternion(q.x, q.y, q.z, q.w);

  /** Plays one piece's simulated flight over the window, from where it was thrown into its slot. */
  function fly(job: Job, tray: HTMLElement, frames: DiePose[], start: number) {
    const { canvas, slot, piece, thrown } = job;
    const rest = frames.at(-1)!;
    const final = quaternion(rest.quaternion);
    const from = new Quaternion();
    const to = new Quaternion();
    const interpolated = new Quaternion();
    const build = landedAs(piece, final);
    const { die, dispose } = build(canvas);
    die.quaternion.copy(final);
    draw(die, canvas);
    posed.set(canvas, { build, rotation: final });

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
    const end = start + (frames.length - 1) * step;
    /**
     * Once pulled, the die leaves its simulated path: it's drawn to its slot on a
     * spring, as it turns on another into its final pose, overshooting both a little.
     */
    let pull:
      | { x: number; y: number; vx: number; vy: number; turn: number; spin: number; time: number }
      | undefined;
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
      // oxlint-disable-next-line react-doctor/three-prefer-set-animation-loop -- Concurrent dice use independent DOM-positioned flights.
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
      const home = slot.getBoundingClientRect();
      const homeX = home.left + home.width / 2;
      const homeY = home.top + home.height / 2;
      const resting = screen(rest);
      const away = Math.hypot(homeX - resting.x, homeY - resting.y);
      if (!pull && now >= end - PULL_LEAD_MS - away * PULL_LEAD_PER_PX_MS) {
        // It sets off at the speed it was moving through the tray.
        const p = screen(a);
        const q = screen(b);
        const perSecond = 1000 / step;
        pull = {
          x,
          y,
          vx: index < entry ? 0 : (q.x - p.x) * perSecond,
          vy: index < entry ? 0 : (q.y - p.y) * perSecond,
          turn: 0,
          spin: 0,
          time: now,
        };
      }
      let turn = 0;
      if (pull) {
        const k = PULL_STIFFNESS ** 2;
        const c = 2 * PULL_DAMPING * PULL_STIFFNESS;
        for (; pull.time < now; pull.time += PULL_STEP * 1000) {
          pull.vx += (k * (homeX - pull.x) - c * pull.vx) * PULL_STEP;
          pull.vy += (k * (homeY - pull.y) - c * pull.vy) * PULL_STEP;
          pull.spin += (k * (1 - pull.turn) - c * pull.spin) * PULL_STEP;
          pull.x += pull.vx * PULL_STEP;
          pull.y += pull.vy * PULL_STEP;
          pull.turn += pull.spin * PULL_STEP;
        }
        x = pull.x;
        y = pull.y;
        turn = pull.turn;
      }
      const lift = Math.max(0, a.z + (b.z - a.z) * mix - rest.z);
      // It turns into its final pose as it's pulled, rather than snapping there on landing.
      from.set(a.quaternion.x, a.quaternion.y, a.quaternion.z, a.quaternion.w);
      to.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      die.quaternion.copy(interpolated.copy(from).slerp(to, mix).slerp(final, turn));
      draw(die, air);
      air.style.visibility = "";
      air.style.transform = `translate(${x - SLOT / 2}px, ${y - SLOT / 2}px) scale(${1 + lift * 0.05})`;
      air.style.setProperty("--lift", String(lift));
      const settled =
        pull &&
        at === frames.length - 1 &&
        Math.hypot(homeX - pull.x, homeY - pull.y) < PULL_REST &&
        Math.hypot(pull.vx, pull.vy) < PULL_REST_SPEED &&
        Math.abs(1 - pull.turn) < 0.01 &&
        Math.abs(pull.spin) < 0.1;
      if (settled) finish();
    };
    frame = requestAnimationFrame(tick);
  }

  interface Job {
    canvas: HTMLCanvasElement;
    slot: HTMLElement;
    piece: Piece;
    thrown: { from: Point; delay: number };
    land: () => void;
    cancel?: () => void;
    cancelled: boolean;
  }
  /** Dice and chips thrown in the same task land in their roll card together, knocking into each other. */
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
          jobs.map(({ piece, thrown, slot }) => {
            const home = slot.getBoundingClientRect();
            return {
              hull: hullOf(piece),
              seed: piece.seed,
              delay: thrown.delay,
              target: {
                x: (home.left + home.width / 2 - box.left) / SCALE,
                y: (home.top + home.height / 2 - box.top) / SCALE,
              },
            };
          }),
        );
      } catch {
        // Without a flight, the dice are simply there.
      }
      const start = performance.now();
      jobs.forEach((job, index) => {
        if (frames) return fly(job, tray, frames[index]!, start);
        stillPiece(job.canvas, job.piece);
        job.land();
      });
    }
    pending.clear();
  }

  function spin(originals: HTMLCanvasElement[], copies: HTMLCanvasElement[]) {
    const dice = copies.flatMap((canvas, index) => {
      const pose = posed.get(originals[index]!);
      if (!pose) return [];
      const { die, dispose } = pose.build(canvas);
      die.quaternion.copy(pose.rotation);
      const axis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      return [{ canvas, die, dispose, rest: pose.rotation, axis: axis.normalize() }];
    });
    let settling: { start: number; from: Quaternion[] } | undefined;
    let last = performance.now();
    const spin = new Quaternion();
    let frame = requestAnimationFrame(function tick(now) {
      const turn = (SPIN_SPEED * (now - last)) / 1000;
      last = now;
      const t = settling ? Math.min(1, (now - settling.start) / SETTLE_MS) : 0;
      dice.forEach(({ canvas, die, rest, axis }, index) => {
        if (settling) die.quaternion.copy(settling.from[index]!).slerp(rest, t * t * (3 - 2 * t));
        else die.quaternion.premultiply(spin.setFromAxisAngle(axis, turn));
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
    mount(canvas, slot, piece, thrown) {
      if (!thrown) {
        stillPiece(canvas, piece);
        return { landed: Promise.resolve(), dispose() {} };
      }
      let land!: () => void;
      const landed = new Promise<void>((resolve) => (land = resolve));
      const job: Job = { canvas, slot, piece, thrown, land, cancelled: false };
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
