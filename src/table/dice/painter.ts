import {
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";
import type { Quaternion } from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { contrastingTextColour } from "../../lib/colour";
import type { DieLook } from "./types";
import {
  CHIP_FACE_OFFSET,
  CHIP_LABEL_SIZE,
  chipShape,
  labelOnFace,
  SCALE,
  shapeFor,
  SLOT,
} from "./shapes";

/*
 * Draws a die, in a pose, into a canvas. One small renderer draws every die,
 * with WebGPU (WebGL where WebGPU is missing); each frame of a die is copied
 * into the die's own canvas. The module waits for the renderer to start, so
 * painting is synchronous once it's loaded.
 */

/** A die or chip ready to draw; dispose() frees what's its own. */
export interface Model {
  mesh: Mesh;
  dispose: () => void;
}

/** A chip ready to draw, that can be shown with other text on it. */
export interface ChipModel extends Model {
  show: (text: string) => void;
}

async function startStage() {
  const renderer = new WebGPURenderer({ antialias: true, alpha: true });
  await renderer.init();
  renderer.setClearColor(0x00_00_00, 0);
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(SLOT, SLOT, false);
  const scene = new Scene();
  const reflections = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = reflections.fromScene(room, 0.02).texture;
  scene.environmentIntensity = 0.3;
  room.dispose();
  reflections.dispose();
  const key = new DirectionalLight(0xff_ff_ff, 1.1);
  key.position.set(-2, 3, 4);
  const rim = new DirectionalLight(0xff_ff_ff, 0.6);
  rim.position.set(3, -1, 2);
  scene.add(new HemisphereLight(0xff_ff_ff, 0x33_40_55, 0.85), key, rim);
  const camera = new OrthographicCamera(-SLOT / 2, SLOT / 2, SLOT / 2, -SLOT / 2, -100, 100);
  return { renderer, scene, camera };
}
const stage = await startStage();

const dieFinish = {
  roughness: 0.2,
  metalness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  specularIntensity: 1,
  iridescence: 0.12,
};
// Satin rather than glossy: a flat face turned to the light would shine its label away.
const chipFinish = { ...dieFinish, roughness: 0.55, clearcoat: 0.3, iridescence: 0 };

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
/**
 * A CSS colour, as it reads where `context` sits in the page, as hex: three
 * can't read oklch() or custom properties. `context` must be in the document.
 */
export function resolveColour(colour: string, context: Element): string {
  const sample = document.createElement("span");
  sample.style.color = colour;
  context.append(sample);
  const computed = getComputedStyle(sample).color;
  sample.remove();
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#888";
  probe.fillStyle = computed;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r!, g!, b!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Labels are shared by every die that shows the same text in the same colour at the same size. */
const labels = new Map<string, { geometry: PlaneGeometry; material: MeshBasicMaterial }>();
/**
 * A face's number or text, drawn on a square `size` units across, facing +Z.
 * Text of two lines puts a smaller caption over the main line.
 */
function labelParts(text: string, colour: string, size: number) {
  const key = `${text}|${colour}|${size}`;
  let made = labels.get(key);
  if (!made) {
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
    made = {
      geometry: new PlaneGeometry(size, size),
      material: new MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
    };
    labels.set(key, made);
  }
  return made;
}

function label(text: string, colour: string, size: number) {
  const { geometry, material } = labelParts(text, colour, size);
  return new Mesh(geometry, material);
}

/** A die as `look` draws it, in `colour` (hex), labelled so its first face shows label `first`. */
export function dieModel({ sides, label: labelOf }: DieLook, first: number, colour: string): Model {
  const shape = shapeFor(sides);
  const material = new MeshPhysicalMaterial({ ...dieFinish, color: colour });
  const mesh = new Mesh(shape.geometry, material);
  mesh.scale.setScalar(SCALE);
  const labelColour = contrastingTextColour(colour);
  for (const [index, face] of shape.faces.entries()) {
    const number = label(labelOf(labelOnFace(first, index, sides)), labelColour, face.size);
    number.position.copy(face.centre).addScaledVector(face.normal, 0.003);
    number.quaternion.copy(face.labelRotation);
    mesh.add(number);
  }
  return {
    mesh,
    dispose: () => {
      material.dispose();
    },
  };
}

/** A chip in `colour` (hex) with `front` on the face towards the viewer and `back` on the other. */
export function chipModel(front: string, back: string, colour: string): ChipModel {
  const face = new MeshPhysicalMaterial({ ...chipFinish, color: colour });
  const rim = new MeshPhysicalMaterial({ ...chipFinish, color: colour });
  rim.color.multiplyScalar(0.5);
  const mesh = new Mesh(chipShape(), [rim, face, face]);
  mesh.scale.setScalar(SCALE);
  const labelColour = contrastingTextColour(colour);
  const sides = [1, -1].map((side) => {
    const words = label(side > 0 ? front : back, labelColour, CHIP_LABEL_SIZE);
    words.position.z = side * CHIP_FACE_OFFSET;
    if (side < 0) words.rotation.y = Math.PI;
    mesh.add(words);
    return words;
  });
  return {
    mesh,
    /** Shows `shown` on both faces. */
    show: (shown) => {
      const { material } = labelParts(shown, labelColour, CHIP_LABEL_SIZE);
      for (const words of sides) words.material = material;
    },
    dispose: () => {
      face.dispose();
      rim.dispose();
    },
  };
}

/** Draws `model`, turned by `rotation`, into `canvas`, sizing it to the renderer's pixels. */
export function paint(model: Model, rotation: Quaternion, canvas: HTMLCanvasElement) {
  const { renderer, scene, camera } = stage;
  model.mesh.quaternion.copy(rotation);
  scene.add(model.mesh);
  renderer.render(scene, camera);
  scene.remove(model.mesh);
  // A WebGPU canvas only holds its picture until the task ends, so it's copied straight away.
  const source = renderer.domElement;
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
}

/**
 * The unnumbered resting die, grey, as a WebP data URL for the flat fallback.
 * @public Drawn by scripts/generateDiceFallbacks.ts.
 */
export function renderBlank(sides: number) {
  const shape = shapeFor(sides);
  const material = new MeshPhysicalMaterial({ ...dieFinish, color: 0x80_80_80 });
  const mesh = new Mesh(shape.geometry, material);
  mesh.scale.setScalar(SCALE);
  const canvas = document.createElement("canvas");
  paint(
    {
      mesh,
      dispose: () => {
        material.dispose();
      },
    },
    shape.rest,
    canvas,
  );
  material.dispose();
  return canvas.toDataURL("image/webp", 0.9);
}
