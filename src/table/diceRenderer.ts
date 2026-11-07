import {
  BoxGeometry,
  BufferGeometry,
  CanvasTarget,
  CanvasTexture,
  CircleGeometry,
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
  WebGPURenderer,
} from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { playDiceImpact } from "../ui/sounds";
import {
  simulateDice,
  restingHeight,
  DiceHold,
  PHYSICS_STEP,
  type DieHull,
  type DiePose,
} from "./diePhysics";

/*
 * Dice in 3D. One renderer draws each landed die into its own canvas in the
 * chat, so it scrolls and stacks with the message, and draws dice still in the
 * air on one canvas over the whole window. Where there's no WebGPU, the same
 * renderer runs on WebGL 2, and landed dice are drawn by a second, slot-sized
 * renderer and copied into their canvases.
 */

export type DieTone = "plain" | "max" | "min";
export interface Point {
  x: number;
  y: number;
}
export interface MountedDie {
  settled: Promise<void>;
  landed: Promise<void>;
  dispose(): void;
}
export interface DiceRenderer {
  mount(
    canvas: HTMLCanvasElement,
    slot: HTMLElement,
    die: { sides: number; value: number; tone: DieTone; seed: string },
    thrown?: { from: Point; delay: number },
  ): MountedDie;
  /**
   * Wakes the landed dice inside an element that's been picked up, carried by
   * `carrier` (the element itself, or a copy of it lifted above the page).
   * The returned function puts them back.
   */
  pickUp(element: HTMLElement, carrier?: HTMLElement): () => void;
}

/** A landed die's canvas, in CSS px; dice are drawn at SCALE px per unit. */
const SLOT = 64;
const SCALE = 24;
const Z = new Vector3(0, 0, 1);
/** How much of the carried tray's change in speed the dice feel, and the most they feel at once (units/s). */
const JOLT = 0.8;
const MAX_JOLT = 30;
const RETURN_MS = 280;
const ARRANGEMENT_LEAD_MS = 800;
const ARRANGEMENT_DURATION_MS = 650;

const toQuaternion = (q: DiePose["quaternion"]) =>
  new Quaternion(q.x, q.y, q.z, q.w);

interface Shape {
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  rest: Quaternion;
  hull: DieHull;
  faces: {
    centre: Vector3;
    normal: Vector3;
    rotation: Quaternion;
    size: number;
  }[];
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
  const triangles: [Vector3, Vector3, Vector3][] = [];
  for (let k = 0; k < 10; k += 2) {
    const up = (zigzag)[k]!;
    const down = (zigzag)[(k + 1) % 10]!;
    const nextUp = (zigzag)[(k + 2) % 10]!;
    const nextDown = (zigzag)[(k + 3) % 10]!;
    triangles.push(
      [top, up, down],
      [top, down, nextUp],
      [bottom, down, nextUp],
      [bottom, nextUp, nextDown],
    );
  }
  const positions = triangles.flatMap(([a, b, c]) => {
    const normal = new Vector3()
      .subVectors(b, a)
      .cross(new Vector3().subVectors(c, a));
    const outward = normal.dot(a.clone().add(b).add(c)) > 0;
    return (outward ? [a, b, c] : [a, c, b]).flatMap((v) => v.toArray());
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The pose that turns the first face to the viewer (a corner up, if `upright`), and where that face's centre lands. */
function facing(geometry: BufferGeometry, upright: boolean): Quaternion {
  const position = geometry.getAttribute("position");
  const corners = Array.from({ length: position.count }, (_, i) =>
    new Vector3().fromBufferAttribute(position, i),
  );
  const a = (corners)[0]!;
  const b = (corners)[1]!;
  const c = (corners)[2]!;
  const normal = new Vector3()
    .subVectors(b, a)
    .cross(new Vector3().subVectors(c, a))
    .normalize();
  const face = corners.filter(
    (v, i) =>
      Math.abs(normal.dot(v.clone().sub(a))) < 1e-4 &&
      corners.findIndex((w) => w.distanceTo(v) < 1e-4) === i,
  );
  const centre = face
    .reduce((sum, v) => sum.add(v), new Vector3())
    .divideScalar(face.length);
  const rest = new Quaternion().setFromUnitVectors(normal, Z);
  if (upright) {
    const far = face.reduce((best, v) =>
      v.distanceTo(centre) > best.distanceTo(centre) ? v : best,
    );
    const tip = far.clone().sub(centre).applyQuaternion(rest);
    rest.premultiply(
      new Quaternion().setFromAxisAngle(
        Z,
        Math.PI / 2 - Math.atan2(tip.y, tip.x),
      ),
    );
  }
  return rest;
}

function faceData(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const vertices: Vector3[] = [];
  const planes: {
    normal: Vector3;
    distance: number;
    indices: Set<number>;
    triangles: number[];
  }[] = [];
  for (let offset = 0; offset < positions.count; offset += 3) {
    const triangle = [0, 1, 2].map((index) =>
      new Vector3().fromBufferAttribute(positions, offset + index),
    );
    const normal = (triangle)[1]!
      .clone()
      .sub((triangle)[0]!)
      .cross((triangle)[2]!.clone().sub((triangle)[0]!))
      .normalize();
    const distance = normal.dot((triangle)[0]!);
    let plane = planes.find(
      (candidate) =>
        candidate.normal.distanceTo(normal) < 1e-4 &&
        Math.abs(candidate.distance - distance) < 1e-4,
    );
    if (!plane) {
      plane = { normal, distance, indices: new Set(), triangles: [] };
      planes.push(plane);
    }
    plane.triangles.push(offset);
    for (const vertex of triangle) {
      let index = vertices.findIndex(
        (candidate) => candidate.distanceTo(vertex) < 1e-4,
      );
      if (index < 0) {
        index = vertices.length;
        vertices.push(vertex);
      }
      plane.indices.add(index);
    }
  }
  const faces = planes.map((plane) => {
    const indices = [...plane.indices];
    const centre = indices
    .reduce((sum, index) => sum.add((vertices)[index]!), new Vector3())
      .divideScalar(indices.length);
    const rotation = new Quaternion().setFromUnitVectors(Z, plane.normal);
    const inverse = rotation.clone().invert();
    indices.sort((first, second) => {
      const a = (vertices)[first]!.clone().sub(centre).applyQuaternion(inverse);
      const b = (vertices)[second]!.clone().sub(centre).applyQuaternion(inverse);
      return Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x);
    });
    let inset = Infinity;
    indices.forEach((index, offset) => {
      const a = (vertices)[index]!.clone().sub(centre);
      const edge = (vertices)[indices[(offset + 1) % indices.length]!]!.clone()
        .sub((vertices)[index]!);
      inset = Math.min(inset, a.clone().cross(edge).length() / edge.length());
    });
    return {
      centre,
      normal: plane.normal,
      rotation,
      size: inset * 1.65,
      indices,
    };
  });
  geometry.clearGroups();
  planes.forEach((plane, index) =>
    plane.triangles.forEach((offset) => geometry.addGroup(offset, 3, index)),
  );
  return {
    faces,
    hull: {
      vertices: vertices.map((vertex) => vertex.toArray()),
      faces: faces.map((face) => face.indices),
    },
  };
}

const shapes = new Map<number, Shape>();
function shapeFor(sides: number): Shape {
  const key = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 20;
  let shape = shapes.get(key);
  if (!shape) {
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
    // A cube sits square; the rest stand on a corner.
    const rest = facing(geometry, key !== 6);
    geometry.computeBoundingSphere();
    const scale = 28 / (SCALE * geometry.boundingSphere!.radius);
    geometry.scale(scale, scale, scale);
    const data = faceData(geometry);
    shape = { geometry, edges: new EdgesGeometry(geometry), rest, ...data };
    shapes.set(key, shape);
  }
  return shape;
}

const probe = document
  .createElement("canvas")
  .getContext("2d", { willReadFrequently: true })!;
/** A colour token as rgb(), which three can read; the tokens are written in oklch. */
function token(name: string): string {
  probe.fillStyle = "#888";
  probe.fillStyle =
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    "#888";
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
const TONE_TOKEN: Record<DieTone, string> = {
  plain: "--gem-smoky",
  max: "--accent",
  min: "--gem-danger",
};

function lights() {
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-2, 3, 4);
  const rim = new DirectionalLight(0xc8e8ff, 1.8);
  rim.position.set(3, -1, 2);
  return [new HemisphereLight(0xffffff, 0x334055, 1.6), key, rim];
}

const faceValue = (value: number, index: number, sides: number) =>
  ((value - 1 + index) % sides) + 1;
const faceTone = (value: number, sides: number): DieTone =>
  value === sides && sides > 1 ? "max" : value === 1 ? "min" : "plain";

interface Flight {
  die: Mesh;
  shadow: Mesh;
  slot: HTMLElement;
  start: number;
  delay: number;
  frames: DiePose[];
  from: Point;
  entry: number;
  tray: HTMLElement;
  settle: () => void;
  land: () => void;
  lastImpactFrame: number;
}

/** A landed die, drawn still in its slot's canvas until it's picked up. */
interface Resting {
  canvas: HTMLCanvasElement;
  shape: Shape;
  material: MeshPhysicalMaterial[];
  value: number;
  sides: number;
  rotation: Quaternion;
  z: number;
  held?: Held;
}

interface Held {
  slot: HTMLElement;
  rest: Resting;
  hold: Hold;
  index: number;
  die: Mesh;
  shadow: Mesh;
  dispose: () => void;
  returning?: {
    start: number;
    x: number;
    y: number;
    z: number;
    quaternion: Quaternion;
  };
}

/** Dice awake in an element being carried; its box, grown to give a lone die room, is their tray. */
interface Hold {
  element: HTMLElement;
  offset: Point;
  physics: DiceHold;
  dice: Held[];
  time: number;
  last?: { x: number; y: number; vx: number; vy: number; t: number };
  released: boolean;
}

function reflectionsFor(renderer: WebGPURenderer) {
  const environmentScene = new RoomEnvironment();
  const reflections = new PMREMGenerator(renderer);
  const environment = reflections.fromScene(environmentScene, 0.02);
  environmentScene.dispose();
  reflections.dispose();
  return environment;
}

/** A renderer with a transparent background: WebGPU where there is one, otherwise WebGL 2. */
async function startRenderer(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: true,
    forceWebGL,
  });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

export async function createDiceRenderer(): Promise<DiceRenderer | null> {
  const renderer = await startRenderer(!("gpu" in navigator));
  const webgpu = !!(
    renderer.backend as unknown as { isWebGPUBackend?: boolean }
  ).isWebGPUBackend;
  const environment = reflectionsFor(renderer);
  // WebGL can't draw into other canvases, so landed dice get a renderer of their own.
  const slotRenderer = webgpu ? undefined : await startRenderer(true);
  slotRenderer?.setPixelRatio(devicePixelRatio);
  slotRenderer?.setSize(SLOT, SLOT, false);

  const overlay = renderer.getCanvasTarget();
  const screen = overlay.domElement as HTMLCanvasElement;
  screen.className = "dice-flight";
  screen.setAttribute("aria-hidden", "true");
  screen.style.display = "none";
  document.body.append(screen);

  const surface = () =>
    new MeshPhysicalMaterial({
      roughness: 0.2,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      specularIntensity: 1.3,
      iridescence: 0.12,
      flatShading: true,
    });
  const materials: Record<DieTone, MeshPhysicalMaterial> = {
    plain: surface(),
    max: surface(),
    min: surface(),
  };
  const edgeMaterial = new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
  });
  const shadowGeometry = new CircleGeometry(1, 24);
  const shadowMaterial = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const still = new Scene();
  still.environment = slotRenderer
    ? reflectionsFor(slotRenderer).texture
    : environment.texture;
  still.environmentIntensity = 0.8;
  const stillCamera = new OrthographicCamera(
    -SLOT / 2,
    SLOT / 2,
    SLOT / 2,
    -SLOT / 2,
    -100,
    100,
  );
  const stillDie = new Mesh<BufferGeometry, MeshPhysicalMaterial[]>(
    new BufferGeometry(),
    [],
  );
  const stillEdges = new LineSegments(new BufferGeometry(), edgeMaterial);
  stillDie.add(stillEdges);
  stillDie.scale.setScalar(SCALE);
  still.add(stillDie, ...lights());

  // In the air, units are viewport CSS px, with y up.
  const air = new Scene();
  air.environment = environment.texture;
  air.environmentIntensity = 0.8;
  air.add(...lights());
  const airCamera = new OrthographicCamera(0, 1, 0, -1, -400, 400);
  const flights = new Set<Flight>();
  const arrangementStarts = new Map<HTMLElement, number>();
  const resting = new Map<HTMLElement, Resting>();
  const holds = new Set<Hold>();
  let width = 0;
  let height = 0;

  function animate() {
    screen.style.display = "";
    void renderer.setAnimationLoop(frame);
  }

  function dieMesh(
    shape: Shape,
    material: MeshPhysicalMaterial[],
    value: number,
    sides: number,
  ) {
    const die = new Mesh(shape.geometry, material);
    die.add(new LineSegments(shape.edges, edgeMaterial));
    const labels = numberFaces(die, shape, value, sides);
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    return { die, shadow, dispose: () => labels.forEach((d) => d()) };
  }

  /** Puts a die in the air at a viewport point (CSS px, y down), `z` units above the tray. */
  function place(
    die: Mesh,
    shadow: Mesh,
    x: number,
    y: number,
    z: number,
    quaternion: Quaternion,
    restZ: number,
  ) {
    const lift = Math.max(0, z - restZ) * SCALE;
    die.position.set(x, -y, z * SCALE);
    die.scale.setScalar(SCALE);
    die.quaternion.copy(quaternion);
    shadow.position.set(x + 3, -y - 5, -200);
    shadow.scale.setScalar((SCALE * 0.9) / (1 + lift / 200));
  }

  function numberFaces(mesh: Mesh, shape: Shape, value: number, sides: number) {
    return shape.faces.map((face, index) => {
      const number = faceValue(value, index, sides);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d")!;
      context.font = `700 104px ${getComputedStyle(document.body).fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = token(
        faceTone(number, sides) === "max" ? "--accent-ink" : "--text",
      );
      context.fillText(String(number), 64, 67, 120);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const geometry = new PlaneGeometry(face.size, face.size);
      const label = new Mesh(geometry, material);
      label.position.copy(face.centre).addScaledVector(face.normal, 0.003);
      label.quaternion.copy(
        index === 0 ? shape.rest.clone().invert() : face.rotation,
      );
      mesh.add(label);
      return () => {
        mesh.remove(label);
        geometry.dispose();
        material.dispose();
        texture.dispose();
      };
    });
  }

  function finish(f: Flight) {
    flights.delete(f);
    air.remove(f.die, f.shadow);
    f.settle();
    f.land();
  }

  function step(f: Flight, now: number) {
    f.die.visible = f.shadow.visible = now >= f.start + f.delay;
    if (now < f.start + f.delay) return;
    const box = f.slot.getBoundingClientRect();
    if (!f.slot.isConnected || !box.width) return finish(f);
    if (
      box.right <= 0 ||
      box.left >= innerWidth ||
      box.bottom <= 0 ||
      box.top >= innerHeight
    )
      return finish(f);
    const tray = f.tray.getBoundingClientRect();
    const frame = Math.min(
      (now - f.start) / (PHYSICS_STEP * 1000),
      f.frames.length - 1,
    );
    const poseIndex = Math.floor(frame);
    const pose = (f.frames)[poseIndex]!;
    const next = (f.frames)[Math.min(poseIndex + 1, f.frames.length - 1)]!;
    const mix = frame % 1;
    const resting = (f.frames)[f.frames.length - 1]!;
    if (frame >= f.frames.length - 1) f.settle();
    if (poseIndex !== f.lastImpactFrame) {
      f.lastImpactFrame = poseIndex;
      const impact = pose.impact ?? 0;
      if (impact > 2.5) playDiceImpact(impact);
    }
    const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const mapPose = (sample: DiePose) => ({
      x: tray.left + sample.x * SCALE,
      y: tray.top + sample.y * SCALE,
    });
    let position: Point;
    if (frame < f.entry) {
      const entry = mapPose((f.frames)[f.entry]!);
      const launch = f.delay / (PHYSICS_STEP * 1000);
      const progress = Math.max(0, (frame - launch) / (f.entry - launch));
      position = {
        x: f.from.x + (entry.x - f.from.x) * progress,
        y: f.from.y + (entry.y - f.from.y) * progress,
      };
    } else {
      const first = mapPose(pose);
      const last = mapPose(next);
      position = {
        x: first.x + (last.x - first.x) * mix,
        y: first.y + (last.y - first.y) * mix,
      };
    }
    const arrangedAt = arrangementStarts.get(f.tray);
    const arrangement =
      arrangedAt === undefined
        ? 0
        : Math.min(1, (now - arrangedAt) / ARRANGEMENT_DURATION_MS);
    const eased = arrangement * arrangement;
    position.x += (centre.x - position.x) * eased;
    position.y += (centre.y - position.y) * eased;
    const altitude = pose.z + (next.z - pose.z) * mix;
    place(
      f.die,
      f.shadow,
      position.x,
      position.y,
      altitude,
      toQuaternion(pose.quaternion).slerp(toQuaternion(next.quaternion), mix),
      resting.z,
    );
    if (arrangement === 1) finish(f);
  }

  function sleep(held: Held) {
    air.remove(held.die, held.shadow);
    held.dispose();
    held.hold.dice = held.hold.dice.filter((other) => other !== held);
    if (!held.hold.dice.length) holds.delete(held.hold);
    if (held.rest.held === held) {
      delete held.rest.held;
      held.rest.canvas.style.visibility = "";
    }
  }

  function returnHome(held: Held, now: number) {
    if (!held.slot.isConnected) return sleep(held);
    const from = held.returning!;
    const t = Math.min(1, (now - from.start) / RETURN_MS);
    const pull = t * t;
    const box = held.slot.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    place(
      held.die,
      held.shadow,
      from.x + (x - from.x) * pull,
      from.y + (y - from.y) * pull,
      from.z + (held.rest.z - from.z) * pull,
      from.quaternion.clone().slerp(held.rest.rotation, pull),
      held.rest.z,
    );
    if (t === 1) sleep(held);
  }

  function stepHold(hold: Hold, now: number) {
    if (hold.released) {
      for (const held of [...hold.dice]) returnHome(held, now);
      return;
    }
    if (!hold.element.isConnected) return [...hold.dice].forEach(sleep);
    const box = hold.element.getBoundingClientRect();
    const x = box.left + hold.offset.x;
    const y = box.top + hold.offset.y;
    const last = hold.last;
    if (!last) hold.last = { x, y, vx: 0, vy: 0, t: now };
    else if (now > last.t) {
      const dt = (now - last.t) / 1000;
      const vx = last.vx + ((x - last.x) / dt - last.vx) * 0.5;
      const vy = last.vy + ((y - last.y) / dt - last.vy) * 0.5;
      const jolt = (dv: number) =>
        Math.max(-MAX_JOLT, Math.min(MAX_JOLT, (dv * JOLT) / SCALE));
      hold.physics.jolt(jolt(vx - last.vx), jolt(vy - last.vy));
      hold.time += Math.min(dt, 0.1);
      while (hold.time >= PHYSICS_STEP) {
        hold.physics.step();
        hold.time -= PHYSICS_STEP;
        for (const pose of hold.physics.poses())
          if ((pose.impact ?? 0) > 2.5) playDiceImpact(pose.impact ?? 0);
      }
      hold.last = { x, y, vx, vy, t: now };
    }
    const poses = hold.physics.poses();
    for (const held of hold.dice) {
      const pose = (poses)[held.index]!;
      place(
        held.die,
        held.shadow,
        x + pose.x * SCALE,
        y + pose.y * SCALE,
        pose.z,
        toQuaternion(pose.quaternion),
        held.rest.z,
      );
    }
  }

  function pickUp(element: HTMLElement, carrier: HTMLElement = element) {
    const picked = [...resting].filter(([slot]) => element.contains(slot));
    if (!picked.length) return () => {};
    const box = element.getBoundingClientRect();
    const trayWidth = Math.max(box.width, SLOT * 3);
    const trayHeight = Math.max(box.height, SLOT * 3);
    const offset = {
      x: (box.width - trayWidth) / 2,
      y: (box.height - trayHeight) / 2,
    };
    const origin = { x: box.left + offset.x, y: box.top + offset.y };
    // A die still returning from an earlier pick-up is caught where it is.
    const starts = picked.map(([slot, rest]) => {
      if (rest.held) {
        const { die } = rest.held;
        const start = {
          x: die.position.x,
          y: -die.position.y,
          z: die.position.z / SCALE,
          quaternion: die.quaternion.clone(),
        };
        sleep(rest.held);
        return start;
      }
      const s = slot.getBoundingClientRect();
      return {
        x: s.left + s.width / 2,
        y: s.top + s.height / 2,
        z: rest.z,
        quaternion: rest.rotation,
      };
    });
    const hold: Hold = {
      element: carrier,
      offset,
      physics: new DiceHold(
        {
          left: 0,
          top: 0,
          right: trayWidth / SCALE,
          bottom: trayHeight / SCALE,
        },
        picked.map(([, rest], index) => {
          const { x, y, z, quaternion: q } = (starts)[index]!;
          return {
            hull: rest.shape.hull,
            x: (x - origin.x) / SCALE,
            y: (y - origin.y) / SCALE,
            z,
            quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
          };
        }),
        element.matches(".die") ? "locked" : "tray",
      ),
      dice: [],
      time: 0,
      released: false,
    };
    hold.dice = picked.map(([slot, rest], index) => {
      const mesh = dieMesh(rest.shape, rest.material, rest.value, rest.sides);
      air.add(mesh.die, mesh.shadow);
      rest.canvas.style.visibility = "hidden";
      return (rest.held = { slot, rest, hold, index, ...mesh });
    });
    holds.add(hold);
    stepHold(hold, performance.now());
    animate();
    return () => {
      if (hold.released) return;
      hold.released = true;
      const start = performance.now();
      for (const held of hold.dice) {
        held.returning = {
          start,
          x: held.die.position.x,
          y: -held.die.position.y,
          z: held.die.position.z / SCALE,
          quaternion: held.die.quaternion.clone(),
        };
      }
    };
  }

  function frame(now: number) {
    if (innerWidth !== width || innerHeight !== height) {
      width = innerWidth;
      height = innerHeight;
      overlay.setPixelRatio(devicePixelRatio);
      overlay.setSize(width, height);
      airCamera.right = width;
      airCamera.bottom = -height;
      airCamera.updateProjectionMatrix();
    }
    const trays = new Set([...flights].map((flight) => flight.tray));
    for (const tray of trays) {
      const trayFlights = [...flights].filter(
        (flight) => flight.tray === tray,
      );
      if (
        arrangementStarts.has(tray) ||
        !trayFlights.every(
            (flight) =>
              now >=
              flight.start +
                (flight.frames.length - 1) * PHYSICS_STEP * 1000 -
                ARRANGEMENT_LEAD_MS,
        )
      )
        continue;
      arrangementStarts.set(tray, now);
      for (const flight of trayFlights)
        flight.slot.dataset.revealStarted = "true";
    }
    for (const f of flights) step(f, now);
    for (const hold of [...holds]) stepHold(hold, now);
    for (const tray of arrangementStarts.keys()) {
      if (![...flights].some((flight) => flight.tray === tray))
        arrangementStarts.delete(tray);
    }
    renderer.setCanvasTarget(overlay);
    renderer.render(air, airCamera);
    if (!flights.size && !holds.size) {
      void renderer.setAnimationLoop(null);
      screen.style.display = "none";
    }
  }

  function throwDie(
    slot: HTMLElement,
    shape: Shape,
    material: MeshPhysicalMaterial[],
    from: Point,
    delay: number,
    value: number,
    sides: number,
    frames: DiePose[],
    tray: HTMLElement,
    start: number,
  ) {
    const { die, shadow, dispose } = dieMesh(shape, material, value, sides);
    die.visible = shadow.visible = false;
    let land!: () => void;
    const landed = new Promise<void>((resolve) => (land = resolve));
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => (settle = resolve));
    const flight: Flight = {
      die,
      shadow,
      slot,
      start,
      delay,
      frames,
      from,
      entry: frames.findIndex((pose) => pose.captured),
      tray,
      settle,
      land: () => {
        dispose();
        land();
      },
      lastImpactFrame: -1,
    };
    flights.add(flight);
    arrangementStarts.delete(flight.tray);
    air.add(die, shadow);
    animate();
    return {
      settled,
      landed,
      cancel: () => {
        if (flights.has(flight)) finish(flight);
      },
    };
  }

  function mountDie(
    [canvas, slot, die, thrown]: Parameters<DiceRenderer["mount"]>,
    frames: DiePose[],
    tray: HTMLElement,
    start: number,
  ): MountedDie {
    const shape = shapeFor(die.sides);
    const final = (frames)[frames.length - 1]!.quaternion;
    const rotation = toQuaternion(final);
    let topFace = 0;
    shape.faces.forEach((face, index) => {
      if (
        face.normal.clone().applyQuaternion(rotation).z >
        (shape.faces)[topFace]!.normal.clone().applyQuaternion(rotation).z
      )
        topFace = index;
    });
    const firstValue = ((die.value - 1 - topFace + die.sides) % die.sides) + 1;
    for (const tone of ["plain", "max", "min"] as const)
      materials[tone].color.set(token(TONE_TOKEN[tone]));
    const material = shape.faces.map(
      (_, index) =>
        materials[faceTone(faceValue(firstValue, index, die.sides), die.sides)],
    );
    stillDie.geometry = shape.geometry;
    stillDie.material = material;
    stillEdges.geometry = shape.edges;
    stillDie.quaternion.copy(rotation);
    const labels = numberFaces(stillDie, shape, firstValue, die.sides);
    let target: CanvasTarget | undefined;
    if (slotRenderer) {
      slotRenderer.render(still, stillCamera);
      const source = slotRenderer.domElement;
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.style.width = canvas.style.height = `${SLOT}px`;
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      context?.drawImage(source, 0, 0);
    } else {
      target = new CanvasTarget(canvas);
      target.setPixelRatio(devicePixelRatio);
      target.setSize(SLOT, SLOT);
      renderer.setCanvasTarget(target);
      renderer.render(still, stillCamera);
      renderer.setCanvasTarget(overlay);
    }
    labels.forEach((dispose) => dispose());
    const flight =
      thrown &&
      throwDie(
        slot,
        shape,
        material,
        thrown.from,
        thrown.delay,
        firstValue,
        die.sides,
        frames,
        tray,
        start,
      );
    const rest: Resting = {
      canvas,
      shape,
      material,
      value: firstValue,
      sides: die.sides,
      rotation,
      z: restingHeight(shape.hull, final),
    };
    let disposed = false;
    const register = () => {
      if (!disposed) resting.set(slot, rest);
    };
    if (flight) void flight.landed.then(register);
    else register();
    return {
      settled: flight ? flight.settled : Promise.resolve(),
      landed: flight ? flight.landed : Promise.resolve(),
      dispose() {
        disposed = true;
        flight?.cancel();
        resting.delete(slot);
        if (rest.held) sleep(rest.held);
        target?.dispose();
      },
    };
  }

  interface PendingMount {
    args: Parameters<DiceRenderer["mount"]>;
    resolve: () => void;
    reject: (error: unknown) => void;
    settle: () => void;
    cancelled: boolean;
    mounted?: MountedDie;
  }
  const pending = new Map<HTMLElement, PendingMount[]>();

  function flushMounts() {
    const batches = [...pending];
    pending.clear();
    for (const [tray, batch] of batches) {
      const mounts = batch.filter((mount) => !mount.cancelled);
      if (!mounts.length) continue;
      try {
        const box = tray.getBoundingClientRect();
        const frames = simulateDice(
          {
            left: 0,
            top: 0,
            right: box.width / SCALE,
            bottom: box.height / SCALE,
          },
          mounts.map(({ args: [, , die, thrown] }) => ({
            hull: shapeFor(die.sides).hull,
            seed: die.seed,
            ...(thrown ? { delay: thrown.delay } : {}),
          })),
        );
        const start = performance.now();
        mounts.forEach((mount, index) => {
          mount.mounted = mountDie(mount.args, (frames)[index]!, tray, start);
          void mount.mounted.landed.then(mount.resolve, mount.reject);
          void mount.mounted.settled.then(mount.settle);
        });
      } catch (error) {
        for (const mount of mounts) {
          mount.mounted?.dispose();
          mount.reject(error);
          mount.settle();
        }
      }
    }
  }

  return {
    mount(...args) {
      const [, slot, die, thrown] = args;
      const tray = slot.closest<HTMLElement>(".roll-card") ?? slot;
      if (!thrown) {
        const rotation = shapeFor(die.sides).rest;
        return mountDie(
          args,
          [
            {
              x: 0,
              y: 0,
              z: 0,
              impact: 0,
              captured: true,
              quaternion: {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z,
                w: rotation.w,
              },
            },
          ],
          tray,
          0,
        );
      }
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const landed = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      let settle!: () => void;
      const settled = new Promise<void>((done) => (settle = done));
      const mount: PendingMount = {
        args,
        resolve,
        reject,
        settle,
        cancelled: false,
      };
      if (!pending.size) queueMicrotask(flushMounts);
      const batch = pending.get(tray) ?? [];
      batch.push(mount);
      pending.set(tray, batch);
      return {
        settled,
        landed,
        dispose() {
          mount.cancelled = true;
          mount.mounted?.dispose();
          resolve();
          settle();
        },
      };
    },
    pickUp,
  };
}
