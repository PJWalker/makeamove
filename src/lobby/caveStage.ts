/* eslint-disable @typescript-eslint/no-magic-numbers, max-lines-per-function, no-console */
import { pass } from "three/tsl";
import {
  PerspectiveCamera,
  RenderPipeline,
  Scene,
  Vector2,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import { reducedMotion } from "../ui/transition";
import caveGrade from "./caveGrade";
import { freshSeed, lightDrift, VIEWER } from "./caveScene";
import { buildCaveOffThread } from "./caveWorker";
import type { CaveResult } from "./caveWorker";
import { playback, playbackMode } from "./playback";
import type { Playback, PlaybackEvent } from "./playback";
import { govern, governedScale, governor, retry } from "./resolution";
import type { FrameSample } from "./resolution";
import { hex } from "./splat";
import splatCloud from "./splatCloud";

/*
 * Puts the cave (caveScene.ts, built off the main thread by cave.worker.ts)
 * on a canvas with three's WebGPU renderer (WebGL where WebGPU is missing), and keeps it alive: it paints itself in stroke by stroke, the
 * torches flicker and smoke, water drips, the wisp flies off to scout and
 * back, and the viewer's eye follows the mouse a little, so the cave shifts in
 * depth. The finished picture is graded (caveGrade.ts). It's drawn 30 times a
 * second, or every frame while the eye is moving, at a resolution chosen from
 * how long frames take (resolution.ts). Paused, or with reduced motion, it's a
 * still picture (playback.ts).
 */

const DARK = "#04050a";
const CLIP = { near: 0.1, far: 90 };
/** The aspect ratio the scene is composed for, and how much of its width a narrower screen may crop. */
const ASPECT = 1.6;
const CROP = 0.72;
/** How far the eye moves with the mouse, in metres. */
const SWAY = { x: 0.4, y: 0.2 };
/** How quickly the eye catches up with the mouse: the share of the way it closes in a second is 1 - e^-rate. */
const SWAY_RATE = 1.54;
/** The eye is still once it's this close to where the mouse puts it. */
const SETTLED = 0.002;
/** How far the eye moves before the splats are re-sorted. */
const RESORT = 0.05;
/** Milliseconds between frames while nothing but the cave itself moves, and how early a frame may come. */
const FRAME = 1000 / 30;
const SLACK = 2;
/** Seconds the cave takes to paint itself in. */
const PAINT_IN = 5;

/**
 * Frames the view so the party stays at the bottom: the bottom edge stays put,
 * and a narrow screen sees more of the dark above rather than losing the party
 * off the sides.
 */
function configureFrame(camera: PerspectiveCamera, aspect: number) {
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

export interface CavePlayback {
  pause: () => void;
  play: () => void;
  dispose: () => void;
}

/** Sets the cave up on a renderer, once its splats have been built. */
function caveView(renderer: WebGPURenderer, seed: string, { splats, brushes, lights: built }: CaveResult) {
  const lights = built.map((light) => ({
    ...light,
    start: new Vector3(...light.at),
    at: new Vector3(...light.at),
    moved: new Vector3(),
    colour: new Vector3(...light.colour),
    drift: lightDrift(light, seed),
  }));
  const cloud = splatCloud(splats, brushes, lights);
  const { uniforms } = cloud;
  uniforms.ambient.value.set(0.006, 0.007, 0.014);
  // The clear colour, in linear light, so the far dark meets it seamlessly.
  uniforms.haze.value.set(...hex(DARK));
  const scene = new Scene();
  scene.add(cloud.mesh);
  const camera = new PerspectiveCamera();
  const grade = caveGrade(pass(scene, camera));
  const [red, green, blue] = hex(DARK);
  grade.settings.dark.value.set(red ** (1 / 2.2), green ** (1 / 2.2), blue ** (1 / 2.2));
  const pipeline = new RenderPipeline(renderer, grade.output);
  // The splats are drawn in sRGB already, and the grade works on them as they are.
  pipeline.outputColorTransform = false;
  return {
    cloud,
    lights,
    camera,
    pipeline,
    pixelRatio: grade.settings.pixelRatio,
    compile: () => renderer.compileAsync(scene, camera),
    dispose() {
      cloud.dispose();
      pipeline.dispose();
    },
  };
}

/** Shows the cave on `canvas` until the returned playback is disposed. */
export function stageCave(
  canvas: HTMLCanvasElement,
  onPauseChange: (paused: boolean) => void = () => undefined,
): CavePlayback {
  const renderer = new WebGPURenderer({ canvas, powerPreference: "low-power", trackTimestamp: true });
  renderer.setClearColor(DARK);
  /** Whether the GPU can time its own work; until then, the gaps between frames are measured. */
  let timed = false;
  let measuring = false;
  const drawingBuffer = new Vector2();

  let view: ReturnType<typeof caveView> | undefined;
  let disposed = false;
  let state: Playback = { paused: false, hidden: document.hidden, reducedMotion: reducedMotion.matches };
  let resolution = governor();
  const eye = new Vector3(...VIEWER.eye);
  const target = new Vector3(...VIEWER.target);
  const sortedFrom = new Vector3(Infinity, 0, 0);
  const pointer = { x: 0, y: 0 };
  const sway = { x: 0, y: 0 };
  let paintStarted = 0;
  let lastSeconds = 0;

  const settling = () => Math.abs(pointer.x - sway.x) + Math.abs(pointer.y - sway.y) > SETTLED;

  /** Draws the cave at a moment; `moving` lets the eye move towards the mouse. */
  const draw = (seconds: number, moving: boolean) => {
    if (!view) return;
    const { cloud, lights, camera, pipeline } = view;
    const { uniforms } = cloud;
    uniforms.drawProgress.value = state.reducedMotion
      ? 1
      : Math.min(1, Math.max(0, (seconds - paintStarted) / PAINT_IN));
    if (moving) {
      const closing = 1 - Math.exp(-Math.min(0.1, Math.max(0, seconds - lastSeconds)) * SWAY_RATE);
      sway.x += (pointer.x - sway.x) * closing;
      sway.y += (pointer.y - sway.y) * closing;
    }
    lastSeconds = seconds;
    camera.position.set(eye.x + sway.x * SWAY.x, eye.y + sway.y * SWAY.y, eye.z);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    cloud.frame(camera);
    if (camera.position.distanceTo(sortedFrom) > RESORT) {
      cloud.sortFor(camera.matrixWorldInverse);
      sortedFrom.copy(camera.position);
    }
    uniforms.time.value = seconds;
    for (const [index, light] of lights.entries()) {
      light.moved.set(...light.drift(seconds));
      light.at.copy(light.start).add(light.moved);
      uniforms.flicker.array[index] = flickerAt(seconds, light.period, index);
    }
    pipeline.render();
    if (timed && !measuring) void measureGpu(seconds);
  };

  const applyResolution = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height || !view) return;
    renderer.setPixelRatio(governedScale(resolution, devicePixelRatio));
    renderer.setSize(width, height, false);
    view.cloud.uniforms.viewport.value.copy(renderer.getDrawingBufferSize(drawingBuffer));
    view.pixelRatio.value = renderer.getPixelRatio();
    configureFrame(view.camera, width / height);
  };

  let animation = 0;
  let lastDraw = 0;
  const stopLoop = () => {
    cancelAnimationFrame(animation);
    animation = 0;
  };

  const dispatch = (event: PlaybackEvent) => {
    const before = state;
    state = playback(state, event);
    if (state.paused !== before.paused) onPauseChange(state.paused);
    show();
  };

  /** Takes in how long a frame took, and adjusts the resolution or gives up. */
  function judge(seconds: number, sample: FrameSample) {
    const before = resolution;
    resolution = govern(resolution, sample, devicePixelRatio);
    if (resolution.gaveUp && !before.gaveUp) {
      console.warn("The lobby's cave backdrop can't keep up on this device, so it's paused.");
      dispatch({ type: "pause" });
    } else if (resolution.rung !== before.rung) {
      applyResolution();
      if (playbackMode(state) !== "off") draw(seconds, false);
    }
  }

  /** Times the frame just drawn on the GPU, once it's finished. */
  async function measureGpu(seconds: number) {
    measuring = true;
    const milliseconds = await renderer.resolveTimestampsAsync("render");
    measuring = false;
    if (!disposed && typeof milliseconds === "number" && milliseconds > 0) {
      judge(seconds, { milliseconds, measure: "gpu" });
    }
  }

  const tick = (now: number) => {
    animation = requestAnimationFrame(tick);
    const moving = settling();
    if (!moving && now - lastDraw < FRAME - SLACK) return;
    const sinceLast = lastDraw ? now - lastDraw : 0;
    lastDraw = now;
    draw(now / 1000, true);
    if (sinceLast && !timed) judge(now / 1000, { milliseconds: sinceLast, measure: "interval" });
  };

  /** Brings the canvas in line with the playback: animating, a still picture, or nothing. */
  function show() {
    if (!view) return;
    const mode = playbackMode(state);
    if (mode === "animate") {
      if (!animation) {
        lastDraw = 0;
        animation = requestAnimationFrame(tick);
      }
      return;
    }
    stopLoop();
    if (mode === "still") draw(state.reducedMotion ? 0 : lastSeconds, false);
  }

  const resize = () => {
    applyResolution();
    // Resizing clears the canvas, so draw straight away rather than waiting for the next frame.
    if (playbackMode(state) === "animate") draw(performance.now() / 1000, false);
    else show();
  };
  const resizing = new ResizeObserver(resize);

  const alive = () => !disposed;
  const load = async () => {
    const seed = freshSeed();
    let built: CaveResult;
    try {
      built = await buildCaveOffThread({ type: "build", seed });
    } catch (error) {
      console.warn("The lobby's cave backdrop couldn't be built, so it's left dark.", error);
      return;
    }
    try {
      await renderer.init();
    } catch (error) {
      console.warn("The lobby's cave backdrop needs WebGPU or WebGL, so it's left dark.", error);
      return;
    }
    if (!alive()) return;
    // Only WebGPU's timestamps are reliable; the WebGL fallback's may never resolve.
    timed = "isWebGPUBackend" in renderer.backend && renderer.hasFeature("timestamp-query");
    const ready = caveView(renderer, seed, built);
    await ready.compile();
    if (!alive()) {
      ready.dispose();
      return;
    }
    view = ready;
    paintStarted = performance.now() / 1000;
    lastSeconds = paintStarted;
    resizing.observe(canvas);
    show();
  };
  void load();

  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || state.reducedMotion) return;
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
  const motion = () => {
    if (reducedMotion.matches) {
      reset();
      sway.x = 0;
      sway.y = 0;
    }
    dispatch({ type: "motion", reduced: reducedMotion.matches });
  };
  const visibility = () => {
    dispatch({ type: "visibility", hidden: document.hidden });
  };
  globalThis.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("mouseout", leave);
  globalThis.addEventListener("blur", reset);
  reducedMotion.addEventListener("change", motion);
  document.addEventListener("visibilitychange", visibility);

  return {
    pause: () => {
      dispatch({ type: "pause" });
    },
    play: () => {
      resolution = retry(resolution);
      dispatch({ type: "play" });
    },
    dispose() {
      disposed = true;
      stopLoop();
      resizing.disconnect();
      globalThis.removeEventListener("pointermove", move);
      document.removeEventListener("mouseout", leave);
      globalThis.removeEventListener("blur", reset);
      reducedMotion.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      view?.dispose();
      void renderer.dispose();
    },
  };
}
