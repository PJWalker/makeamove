import { workerClient } from "../lib/workerRpc";
import type { Light } from "./caveScene";

/*
 * Builds the cave (caveScene.ts) off the main thread, so the lobby can
 * respond while its hundred thousand splats are laid down and packed.
 */

export interface CaveTask {
  type: "build";
  seed: string;
}

export interface CaveResult {
  type: "build";
  /** The splats, packed (splat.ts). */
  splats: Float32Array;
  lights: Light[];
  /** The brush strokes the splats are painted with (brushAtlas.ts). */
  brushes: Uint8Array;
}

/** Builds a cave in the cave worker (cave.worker.ts). */
export const buildCaveOffThread = workerClient<CaveTask, CaveResult>(
  () => new Worker(new URL("cave.worker.ts", import.meta.url), { type: "module" }),
  "Cave worker",
);
