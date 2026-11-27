import { store } from "../lib/store";
import { loadBitmap } from "../media/images";
import {
  DEFAULT_DETECT,
  MAX_SAMPLES,
  SAMPLES_PER_CELL,
  outlinePaths,
  shadesOf,
  wallsAlong,
} from "./detectWalls";
import type { DetectSettings, Shades } from "./detectWalls";
import type { ToolContext } from "./gestures/types";
import { cellOr, DEFAULT_GRID } from "./grid";
import type { MapElement, Transform } from "./types";
import { wallEnds } from "./vision";

/** Walls being found on a map: how detection is tuned, and the walls it found (none yet while the image loads). */
export interface WallDetection {
  mapId: string;
  settings: DetectSettings;
  walls: Transform[] | null;
}

const PREVIEW = { colour: "#ffd27a", width: 3 };

/** An image's shades, sampled to fit a map at its size. */
interface Sampled {
  hash: string;
  shades: Shades;
  samplesPerCell: number;
}

/**
 * Finding the walls on a map (see detectWalls.ts), for the GM to tune and
 * then add as one undo step. Until then they're only shown, as a draft.
 */
export class WallDetector {
  readonly state = store<WallDetection | null>(null);
  private readonly c: ToolContext;
  private sampled: Sampled | null = null;
  /** The map's place when its walls were last found. */
  private placed: Transform | null = null;

  constructor(c: ToolContext) {
    this.c = c;
  }

  /** Start finding walls on map `id`. */
  async start(id: string) {
    this.state.value = { mapId: id, settings: DEFAULT_DETECT, walls: null };
    this.show();
    await this.refresh();
  }

  /** Tune detection; the walls found follow straight away. */
  async tune(patch: Partial<DetectSettings>) {
    const state = this.state.value;
    if (!state) return;
    this.state.value = { ...state, settings: { ...state.settings, ...patch } };
    await this.refresh();
  }

  /** Find the walls again if the map has moved or been resized since. */
  async follow() {
    const state = this.state.value;
    if (!state) return;
    const map = this.c.element(state.mapId);
    const was = this.placed;
    if (map && was && (["x", "y", "w", "h", "rot"] as const).every((k) => map[k] === was[k]))
      return;
    await this.refresh();
  }

  /** Find the walls again, as the map or settings are now. */
  async refresh() {
    const state = this.state.value;
    const map = state && this.c.element(state.mapId);
    if (map?.type !== "map") {
      this.stop();
      return;
    }
    this.placed = { x: map.x, y: map.y, w: map.w, h: map.h, rot: map.rot };
    const sampled = await this.sample(map);
    // Stopped, or moved on to another map, while the image loaded.
    if (this.state.value?.mapId !== map.id) return;
    const now = this.state.value;
    if (!sampled) {
      this.state.value = { ...now, walls: [] };
      this.show();
      return;
    }
    const { shades, samplesPerCell } = sampled;
    const paths = outlinePaths(shades, now.settings, samplesPerCell);
    const existing = this.c.allElements().filter((element) => element.type === "wall");
    const frame = { frame: map, width: shades.width, height: shades.height };
    this.state.value = {
      ...now,
      walls: wallsAlong(paths, frame, { grid: this.c.renderer.grid, existing }),
    };
    this.show();
  }

  /** Add the walls found to the scene, as one undo step, and finish. */
  commit() {
    const walls = this.state.value?.walls;
    if (walls?.length)
      this.c.scene.add(
        ...walls.map((t) => ({ type: "wall" as const, layer: "over" as const, ...t })),
      );
    this.stop();
  }

  stop() {
    if (!this.state.value) return;
    this.state.value = null;
    this.placed = null;
    this.show();
  }

  /** The walls found, drawn over the map. */
  private show() {
    const walls = this.state.value?.walls;
    const { renderer } = this.c;
    renderer.draft = walls
      ? { kind: "walls", walls: walls.map((t) => wallEnds(t)), layer: "over", ...PREVIEW }
      : null;
    renderer.invalidate("overlay", "presence");
  }

  /**
   * The map's image cut into a few samples to a grid cell, at most
   * MAX_SAMPLES along its longer side and no finer than the image itself.
   */
  private async sample(map: MapElement): Promise<Sampled | null> {
    const cell = cellOr(this.c.renderer.grid, DEFAULT_GRID.size);
    const { image } = map;
    const perSample = Math.max(
      cell / SAMPLES_PER_CELL,
      Math.max(map.w, map.h) / MAX_SAMPLES,
      map.w / image.width,
    );
    const width = Math.max(1, Math.round(map.w / perSample));
    const height = Math.max(1, Math.round(map.h / perSample));
    const known = this.sampled;
    if (
      known?.hash === image.hash &&
      known.shades.width === width &&
      known.shades.height === height
    )
      return known;
    const bitmap = await loadBitmap(image.hash, this.c.renderer.peers);
    if (!bitmap) return null;
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, width, height);
    const shades = shadesOf(g.getImageData(0, 0, width, height).data, width, height);
    this.sampled = { hash: image.hash, shades, samplesPerCell: cell / perSample };
    return this.sampled;
  }
}
