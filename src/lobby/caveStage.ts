/* eslint-disable @typescript-eslint/no-magic-numbers */
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { reducedMotion } from "../ui/transition";
import { isString } from "../lib/guards";
import { buildCave, VIEWER } from "./caveScene";
import { CROSS_PROCESS } from "./crossProcess";
import { hex, pack } from "./splat";
import { splatCloud } from "./splatCloud";

/*
 * Puts the cave (caveScene.ts) on a canvas and keeps it alive: the torches
 * flicker and smoke, water drips, the wisp flies off to scout and back, and the viewer's eye follows the mouse a little,
 * so the cave shifts in depth. The finished picture is lightly cross-processed
 * (crossProcess.ts). With reduced motion it's a still picture.
 */

const DARK = "#04050a";
const CLIP = { near: 0.1, far: 90 };
/** The aspect ratio the scene is composed for, and how much of its width a narrower screen may crop. */
const ASPECT = 1.6;
const CROP = 0.72;
/** How far the eye moves with the mouse, in metres. */
const SWAY = { x: 0.4, y: 0.2 };
/** How far the eye moves before the splats are re-sorted. */
const RESORT = 0.05;

/**
 * Frames the view so the party stays at the bottom: the bottom edge stays put,
 * and a narrow screen sees more of the dark above rather than losing the party
 * off the sides.
 */
function frame(camera: PerspectiveCamera, aspect: number) {
  const below = Math.tan(((VIEWER.fov / 2) * Math.PI) / 180);
  const half = Math.max(below, (below * ASPECT * CROP) / aspect);
  const { near, far } = CLIP;
  camera.projectionMatrix.makePerspective(
    -half * aspect * near,
    half * aspect * near,
    (2 * half - below) * near,
    -below * near,
    near,
    far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/** How brightly a light burns at a moment: a slow swell with quicker flutters over it. */
const flickerAt = (seconds: number, period: number, index: number) =>
  1 +
  0.09 * Math.sin((seconds * Math.PI * 2) / period) +
  0.06 * Math.sin(seconds * 11.3 + index * 1.7) +
  0.04 * Math.sin(seconds * 23.1 + index * 4.1);

const softwareRendered = (renderer: WebGLRenderer) => {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return /swiftshader|llvmpipe|softpipe/i.test(
    String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
  );
};

/**
 * A renderer for the cave, or the reason there isn't one. Software WebGL (no GPU, as in
 * headless test browsers) draws the cave at about a frame a second and starves the page,
 * so it gets none.
 */
function caveRenderer(canvas: HTMLCanvasElement): WebGLRenderer | string {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, powerPreference: "low-power" });
  } catch (error) {
    return `it needs WebGL (${String(error)})`;
  }
  if (!softwareRendered(renderer)) return renderer;
  renderer.dispose();
  return "it needs a GPU";
}

/** Shows the cave on `canvas` until the returned function is called. */
export function stageCave(canvas: HTMLCanvasElement): () => void {
  const renderer = caveRenderer(canvas);
  if (isString(renderer)) {
    console.warn(`The lobby's cave backdrop is left dark: ${renderer}.`);
    return () => {};
  }
  renderer.setClearColor(DARK);

  const cave = buildCave();
  const lights = cave.lights.map((light) => ({
    ...light,
    start: new Vector3(...light.at),
    at: new Vector3(...light.at),
    moved: new Vector3(),
    colour: new Vector3(...light.colour),
  }));
  const cloud = splatCloud(pack(cave.splats), lights);
  const { uniforms } = cloud;
  uniforms.ambient.value.set(0.006, 0.007, 0.014);
  // The clear colour, in linear light, so the far dark meets it seamlessly.
  uniforms.haze.value.set(...hex(DARK));
  const scene = new Scene();
  scene.add(cloud.mesh);

  const camera = new PerspectiveCamera();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(CROSS_PROCESS));
  const eye = new Vector3(...VIEWER.eye);
  const target = new Vector3(...VIEWER.target);
  const sortedFrom = new Vector3(Infinity, 0, 0);
  const pointer = { x: 0, y: 0 };
  const sway = { x: 0, y: 0 };

  const draw = (seconds: number) => {
    sway.x += (pointer.x - sway.x) * 0.05;
    sway.y += (pointer.y - sway.y) * 0.05;
    camera.position.set(eye.x + sway.x * SWAY.x, eye.y + sway.y * SWAY.y, eye.z);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    if (camera.position.distanceTo(sortedFrom) > RESORT) {
      cloud.sortFor(camera.matrixWorldInverse);
      sortedFrom.copy(camera.position);
    }
    uniforms.time.value = seconds;
    for (const [index, light] of lights.entries()) {
      light.moved.set(...light.drift(seconds));
      light.at.copy(light.start).add(light.moved);
      uniforms.flicker.value[index] = flickerAt(seconds, light.period, index);
    }
    composer.render();
  };

  let animation = 0;
  const tick = (now: number) => {
    draw(now / 1000);
    animation = requestAnimationFrame(tick);
  };
  const play = () => {
    cancelAnimationFrame(animation);
    animation = 0;
    if (reducedMotion.matches) {
      pointer.x = sway.x = 0;
      pointer.y = sway.y = 0;
      draw(0);
    } else animation = requestAnimationFrame(tick);
  };

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    uniforms.viewport.value.set(canvas.width, canvas.height);
    frame(camera, width / height);
    if (!animation) play();
  };
  const resizing = new ResizeObserver(resize);
  resizing.observe(canvas);

  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer.x = Math.max(-1, Math.min(1, (event.clientX / innerWidth) * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, 1 - (event.clientY / innerHeight) * 2));
  };
  const reset = () => {
    pointer.x = 0;
    pointer.y = 0;
  };
  const leave = (event: MouseEvent) => {
    if (!event.relatedTarget) reset();
  };
  globalThis.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("mouseout", leave);
  globalThis.addEventListener("blur", reset);
  reducedMotion.addEventListener("change", play);

  return () => {
    cancelAnimationFrame(animation);
    resizing.disconnect();
    globalThis.removeEventListener("pointermove", move);
    document.removeEventListener("mouseout", leave);
    globalThis.removeEventListener("blur", reset);
    reducedMotion.removeEventListener("change", play);
    cloud.dispose();
    composer.dispose();
    renderer.dispose();
  };
}
