/* eslint-disable @typescript-eslint/no-magic-numbers */
import { PerspectiveCamera, Vector3 } from "three";
import { reducedMotion } from "../ui/transition";
import { buildCave, VIEWER } from "./caveScene";
import { pack } from "./splat";
import { createNativeSplatCloud } from "./nativeSplatCloud";

const ASPECT = 1.6;
const CROP = 0.72;
const SWAY = { x: 0.4, y: 0.2 };

function configureFrame(camera: PerspectiveCamera, aspect: number) {
  const below = Math.tan((VIEWER.fov / 2) * Math.PI / 180);
  const half = Math.max(below, below * ASPECT * CROP / aspect);
  camera.projectionMatrix.makePerspective(-half * aspect * 0.1, half * aspect * 0.1, (2 * half - below) * 0.1, -below * 0.1, 0.1, 90);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const flickerAt = (seconds: number, period: number, index: number) =>
  1 +
  0.09 * Math.sin(seconds * Math.PI * 2 / period) +
  0.06 * Math.sin(seconds * 11.3 + index * 1.7) +
  0.04 * Math.sin(seconds * 23.1 + index * 4.1);

export interface CavePlayback {
  pause: () => void;
  play: () => void;
  dispose: () => void;
}

export async function stageCave(
  canvas: HTMLCanvasElement,
  onPauseChange: (paused: boolean) => void = () => undefined,
): Promise<CavePlayback> {
  const cave = buildCave();
  const lights = cave.lights.map((light) => ({
    at: [light.at[0], light.at[1], light.at[2]] as const,
    moved: [0, 0, 0] as [number, number, number],
    colour: [light.colour[0], light.colour[1], light.colour[2]] as const,
    reach: light.reach,
  }));
  const movableLights = cave.lights.map((light) => ({
    start: new Vector3(...light.at),
    moved: new Vector3(),
  }));

  const cloud = await createNativeSplatCloud(canvas, pack(cave.splats), lights);
  if (!cloud) {
    console.warn("The lobby's cave backdrop needs WebGPU, so it is left dark.");
    return { pause: () => undefined, play: () => undefined, dispose: () => undefined };
  }

  const camera = new PerspectiveCamera();
  const eye = new Vector3(...VIEWER.eye);
  const target = new Vector3(...VIEWER.target);
  const pointer = { x: 0, y: 0 };
  const sway = { x: 0, y: 0 };

  let animation = 0;
  let paused = false;
  let hiddenPaused = false;
  let lastDraw = 0;
  let lastFrameTime = 0;
  let frameSamples: number[] = [];
  let struggleStarted = 0;

  const draw = (seconds: number) => {
    sway.x += (pointer.x - sway.x) * 0.05;
    sway.y += (pointer.y - sway.y) * 0.05;
    camera.position.set(eye.x + sway.x * SWAY.x, eye.y + sway.y * SWAY.y, eye.z);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    for (const [index, light] of cave.lights.entries()) {
      movableLights[index]!.moved.set(...light.drift(seconds));
      const current = movableLights[index]!.moved;
      lights[index]!.moved = [current.x, current.y, current.z];
    }

    const flicker = cave.lights.map((light, index) => flickerAt(seconds, light.period, index));
    cloud.render(camera.matrixWorldInverse, camera.projectionMatrix, [canvas.width, canvas.height], seconds, flicker);
  };

  const tick = (now: number) => {
    if (paused || document.hidden) {
      animation = 0;
      return;
    }
    if (lastFrameTime) {
      const frameMs = now - lastFrameTime;
      if (frameMs > 0) frameSamples.push(frameMs);
    }
    lastFrameTime = now;
    if (now - lastDraw >= 1000 / 30) {
      draw(now / 1000);
      lastDraw = now;
    }
    if (frameSamples.length >= 90) {
      const averageMs = frameSamples.reduce((sum, frame) => sum + frame, 0) / frameSamples.length;
      const fps = 1000 / averageMs;
      frameSamples = [];
      if (fps < 38) {
        if (!struggleStarted) struggleStarted = now;
        if (now - struggleStarted >= 4000) {
          pause();
          return;
        }
      } else {
        struggleStarted = 0;
      }
    }
    animation = requestAnimationFrame(tick);
  };

  const play = () => {
    if (document.hidden) return;
    cancelAnimationFrame(animation);
    paused = false;
    lastFrameTime = 0;
    frameSamples = [];
    struggleStarted = 0;
    onPauseChange(false);
    if (reducedMotion.matches) {
      pointer.x = sway.x = 0;
      pointer.y = sway.y = 0;
      draw(0);
    } else {
      animation = requestAnimationFrame(tick);
    }
  };

  const pause = () => {
    paused = true;
    cancelAnimationFrame(animation);
    animation = 0;
    onPauseChange(true);
  };

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(devicePixelRatio, 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    configureFrame(camera, width / height);
    if (!animation) play();
  };

  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer.x = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, 1 - event.clientY / innerHeight * 2));
  };
  const reset = () => {
    pointer.x = 0;
    pointer.y = 0;
  };
  const leave = (event: MouseEvent) => {
    if (!event.relatedTarget) reset();
  };
  const visibility = () => {
    if (document.hidden) {
      hiddenPaused = !paused;
      pause();
    } else if (hiddenPaused) {
      hiddenPaused = false;
      play();
    }
  };

  const resizing = new ResizeObserver(resize);
  resizing.observe(canvas);
  globalThis.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("mouseout", leave);
  globalThis.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", visibility);
  reducedMotion.addEventListener("change", play);
  resize();

  return {
    pause,
    play,
    dispose() {
      cancelAnimationFrame(animation);
      resizing.disconnect();
      globalThis.removeEventListener("pointermove", move);
      document.removeEventListener("mouseout", leave);
      globalThis.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      reducedMotion.removeEventListener("change", play);
      cloud.dispose();
    },
  };
}
