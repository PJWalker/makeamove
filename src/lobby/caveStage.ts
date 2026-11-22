/* eslint-disable @typescript-eslint/no-magic-numbers, max-lines-per-function, @typescript-eslint/prefer-destructuring, @typescript-eslint/restrict-template-expressions */
import { PerspectiveCamera, Vector3 } from "three";
import { reducedMotion } from "../ui/transition";
import { buildCave, VIEWER } from "./caveScene";
import type { Cave } from "./caveScene";
import { pack } from "./splat";
import { createNativeSplatCloud } from "./nativeSplatCloud";

const ASPECT = 1.6;
const CROP = 0.72;
const SWAY = { x: 0.4, y: 0.2 };

function sizeCanvas(canvas: HTMLCanvasElement): readonly [number, number] | undefined {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return undefined;
  const pixelRatio = Math.min(devicePixelRatio, 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  return [width, height];
}

function stageCave2d(
  canvas: HTMLCanvasElement,
  cave: Cave,
  onPauseChange: (paused: boolean) => void,
): CavePlayback {
  const context = canvas.getContext("2d");
  if (!context) return { pause: () => undefined, play: () => undefined, dispose: () => undefined };
  const camera = new PerspectiveCamera();
  const eye = new Vector3(...VIEWER.eye);
  const target = new Vector3(...VIEWER.target);
  let paused = false;
  let hiddenPaused = false;
  let animation = 0;
  let lastDraw = 0;

  const resize = () => {
    const size = sizeCanvas(canvas);
    if (!size) return;
    configureFrame(camera, size[0] / size[1]);
    draw(0);
  };

  const draw = (seconds: number) => {
    const width = canvas.width;
    const height = canvas.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#04050a";
    context.fillRect(0, 0, width, height);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    context.lineCap = "round";
    for (let index = 0; index < cave.splats.length; index += 3) {
      const splat = cave.splats[index];
      if (!splat) continue;
      const point = new Vector3(...splat.at).applyMatrix4(viewProjection);
      if (point.z < -1 || point.z > 1) continue;
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      const phase = splat.phase;
      const angle = Math.sin(splat.at[2] * 0.11 + splat.at[0] * 0.14 + seconds * 0.035) * 0.48
        + Math.sin(splat.at[0] * 0.22 - splat.at[2] * 0.07 - seconds * 0.0245) * 0.24;
      const depth = Math.min(1, Math.max(0.25, 1 - (-point.z) / 50));
      const long = (4 + ((index * 13) % 100) / 100 * 4) * depth;
      const wide = (0.9 + ((index * 7) % 100) / 100 * 0.9) * depth;
      context.strokeStyle = `rgb(${Math.round(splat.colour[0] * 255)} ${Math.round(splat.colour[1] * 255)} ${Math.round(splat.colour[2] * 255)} / ${0.2 + (phase % 1) * 0.25})`;
      context.lineWidth = Math.max(0.5, wide);
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * long, y - Math.sin(angle) * long);
      context.lineTo(x + Math.cos(angle) * long, y + Math.sin(angle) * long);
      context.stroke();
    }
  };

  const tick = (now: number) => {
    if (paused || document.hidden) {
      animation = 0;
      return;
    }
    if (now - lastDraw >= 1000 / 30) {
      draw(now / 1000);
      lastDraw = now;
    }
    animation = requestAnimationFrame(tick);
  };
  const play = () => {
    if (document.hidden) return;
    paused = false;
    onPauseChange(false);
    if (!animation) animation = requestAnimationFrame(tick);
  };
  const pause = () => {
    paused = true;
    cancelAnimationFrame(animation);
    animation = 0;
    onPauseChange(true);
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
  document.addEventListener("visibilitychange", visibility);
  resize();
  return {
    pause,
    play,
    dispose() {
      cancelAnimationFrame(animation);
      resizing.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

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
    at: [light.at[0], light.at[1], light.at[2]] as [number, number, number],
    moved: [0, 0, 0] as [number, number, number],
    colour: [light.colour[0], light.colour[1], light.colour[2]] as const,
    reach: light.reach,
  }));
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width && height) {
    const pixelRatio = Math.min(devicePixelRatio, 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }

  const movableLights = cave.lights.map((light) => ({
    start: new Vector3(...light.at),
    moved: new Vector3(),
  }));

  const cloud = await createNativeSplatCloud(canvas, pack(cave.splats), lights);
  if (!cloud) {
    return stageCave2d(canvas, cave, onPauseChange);
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
      lights[index]!.at = [light.at[0] + current.x, light.at[1] + current.y, light.at[2] + current.z];
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
    const size = sizeCanvas(canvas);
    if (!size) return;
    configureFrame(camera, size[0] / size[1]);
    draw(0);
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
