import {
  NeutralToneMapping,
  Box3,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  MeshBasicMaterial,
  PlaneGeometry,
  type Material,
  MeshStandardMaterial,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MODELS, type IconName } from "./models";

/*
 * The photo studio every icon is shot in: one camera angle, one warm key
 * light from the upper left, so the whole set shares a light source. Each
 * model is rendered large, stepped down to its icon sizes, and given a dark
 * outline so it holds its shape on any background.
 */

const RENDER = 512;
export const ICON_SIZES = [32, 64] as const;
/** Fraction of the icon's width left clear around the art for the outline. */
const MARGIN = 0.06;
const OUTLINE = { colour: [28, 16, 8] as const, opacity: 0.9 };

export type IconRender = { name: IconName; size: number; dataUrl: string };

export function renderIcons(names = Object.keys(MODELS) as IconName[]): IconRender[] {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER, RENDER, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const environment = new PMREMGenerator(renderer).fromScene(studioEnvironment(), 0.04).texture;

  const renders: IconRender[] = [];
  for (const name of names) {
    const scene = new Scene();
    scene.environment = environment;
    scene.environmentIntensity = 0.4;
    const model = MODELS[name]();
    rimLight(model);
    scene.add(model);
    model.updateMatrixWorld(true);
    const camera = frame(model);
    light(scene, model);
    renderer.render(scene, camera);
    for (const size of ICON_SIZES) renders.push({ name, size, dataUrl: finish(canvas, size) });
    scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
    });
  }
  renderer.dispose();
  return renders;
}

/**
 * A neutral room with soft boxes behind and above the camera, so faces
 * turned toward the viewer catch a bright reflection: gold reads as gold,
 * not as the dark room behind the lens.
 */
function studioEnvironment() {
  const room = new RoomEnvironment();
  const softbox = (
    intensity: number,
    colour: number,
    w: number,
    h: number,
    at: [number, number, number],
  ) => {
    const material = new MeshBasicMaterial({ color: colour, side: DoubleSide });
    material.color.multiplyScalar(intensity);
    const panel = new Mesh(new PlaneGeometry(w, h), material);
    panel.position.set(...at);
    panel.lookAt(0, 2, 0);
    room.add(panel);
  };
  softbox(2.4, 0xfff1dc, 30, 16, [0, 4, 13]);
  softbox(5, 0xfff4e4, 8, 8, [-9, 13, 8]);
  return room;
}

/*
 * Rim lighting, in the manner of classic OS X icons: a cool, bright edge
 * where a surface turns away from the viewer, strongest on its upper side and
 * on dark materials, so dark objects keep their silhouette on dark
 * backgrounds.
 */
const RIM_COLOUR = "vec3(0.78, 0.86, 1.0)";

function rimLight(model: Object3D) {
  const patched = new Set<Material>();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) {
      if (patched.has(material) || !(material instanceof MeshStandardMaterial)) continue;
      patched.add(material);
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float facing = 1.0 - clamp(normal.z, 0.0, 1.0);
            float edge = pow(facing, 2.6);
            float above = 0.35 + 0.65 * clamp(normal.y * 0.6 + 0.6, 0.0, 1.0);
            float darkness = 1.0 - dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            totalEmissiveRadiance += ${RIM_COLOUR} * edge * above * (0.15 + 1.1 * darkness * darkness);
          }`,
        );
      };
    }
  });
}

const VIEW = new Vector3(0, Math.sin((12 * Math.PI) / 180), Math.cos((12 * Math.PI) / 180));

/** A square orthographic camera fitted tightly around the model's silhouette. */
function frame(model: Object3D): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.copy(VIEW).multiplyScalar(20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const inverse = camera.matrixWorldInverse;
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const point = new Vector3();
  model.traverse((o) => {
    const mesh = o as Mesh;
    const position =
      mesh.isMesh && !mesh.userData["glow"] && mesh.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      min.min(point);
      max.max(point);
    }
  });
  const half = Math.max(max.x - min.x, max.y - min.y) / 2 / (1 - 2 * MARGIN);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  camera.left = cx - half;
  camera.right = cx + half;
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.near = -max.z - 1;
  camera.far = -min.z + 1;
  camera.updateProjectionMatrix();
  return camera;
}

function light(scene: Scene, model: Object3D) {
  scene.add(new HemisphereLight(0xfff0d8, 0x2a1c12, 0.35));
  const bounds = new Box3().setFromObject(model);
  const centre = bounds.getCenter(new Vector3());
  const radius = bounds.getSize(new Vector3()).length() / 2;

  const key = new DirectionalLight(0xffe2b8, 3.6);
  key.position.copy(centre).add(new Vector3(-3, 4, 4).normalize().multiplyScalar(radius * 4));
  key.target.position.copy(centre);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  const s = key.shadow.camera;
  s.left = s.bottom = -radius * 1.2;
  s.right = s.top = radius * 1.2;
  s.near = radius;
  s.far = radius * 8;
  scene.add(key, key.target);

  const fill = new DirectionalLight(0xb8c6ff, 0.45);
  fill.position.copy(centre).add(new Vector3(4, 1, 3));
  const rim = new DirectionalLight(0xfff6e8, 2.2);
  rim.position.copy(centre).add(new Vector3(2.5, 3, -4));
  scene.add(fill, rim);
}

/** Steps the render down to `size` and draws the outline behind it. */
function finish(source: HTMLCanvasElement, size: number): string {
  let current: HTMLCanvasElement = source;
  while (current.width > size) {
    const next = document.createElement("canvas");
    next.width = next.height = Math.max(size, current.width / 2);
    const ctx = next.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  const ctx = current.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");
  const image = ctx.getImageData(0, 0, size, size);
  outline(image.data, size, size / 32);
  ctx.putImageData(image, 0, 0);
  return current.toDataURL("image/png");
}

function outline(data: Uint8ClampedArray, size: number, radius: number) {
  const alpha = new Float32Array(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = (data[i * 4 + 3] ?? 0) / 255;
  const reach = Math.ceil(radius);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let o = 0;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const d = Math.hypot(dx, dy);
          const sx = x + dx;
          const sy = y + dy;
          if (d > radius + 0.5 || sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
          o = Math.max(o, (alpha[sy * size + sx] ?? 0) * Math.min(1, radius + 0.5 - d + 0.5));
        }
      }
      o *= OUTLINE.opacity;
      const i = (y * size + x) * 4;
      const a = alpha[y * size + x] ?? 0;
      const out = a + o * (1 - a);
      if (out === 0) continue;
      OUTLINE.colour.forEach((colour, c) => {
        data[i + c] = ((data[i + c] ?? 0) * a + colour * o * (1 - a)) / out;
      });
      data[i + 3] = out * 255;
    }
  }
}
