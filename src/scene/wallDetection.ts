import { store } from "../lib/store";
import type { Greyscale } from "../media/greyscale";
import { greyscaleOf, loadBlob } from "../media/images";
import {
  DEFAULT_DETECT,
  MAX_SAMPLES,
  SAMPLES_PER_CELL,
  outlinePaths,
  wallsAlong,
  wallsNotIn,
} from "./detectWalls";
import type { DetectSettings } from "./detectWalls";
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

/** An image's shades, sampled at most `maxSide` along its longer side. */
interface Sampled {
  hash: string;
  maxSide: number;
  shades: Greyscale;
}

/**
 * Finding the walls on a map (see detectWalls.ts), for the GM to tune and
 * then add as one undo step. Until then they're only shown, as a proposal.
 */
export class WallDetector {
  readonly state = store<WallDetection | null>(null);
  private readonly c: ToolContext;
  private sampled: Sampled | null = null;
  /** The map's place when its walls were last found. */
  private placed: Transform | null = null;
  /** Counts refreshes, so one overtaken by a later one (or by stopping) drops its result. */
  private run = 0;

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

  /** Find the walls again, as the map, grid and settings are now. */
  async refresh() {
    const run = ++this.run;
    const state = this.state.value;
    const map = state && this.c.element(state.mapId);
    if (map?.type !== "map") {
      this.stop();
      return;
    }
    this.placed = { x: map.x, y: map.y, w: map.w, h: map.h, rot: map.rot };
    const { grid } = this.c.renderer;
    const cell = cellOr(grid, DEFAULT_GRID.size);
    const perSample = Math.max(
      cell / SAMPLES_PER_CELL,
      Math.max(map.w, map.h) / MAX_SAMPLES,
      map.w / map.image.width,
    );
    const shades = await this.sample(map, perSample);
    // Overtaken while the image loaded.
    const now = this.state.value;
    if (run !== this.run || !now) return;
    if (!shades) {
      this.state.value = { ...now, walls: [] };
      this.show();
      return;
    }
    // The samples as read, which may be a little coarser than asked for.
    const paths = outlinePaths(shades, now.settings, (cell * shades.width) / map.w);
    const frame = { frame: map, width: shades.width, height: shades.height };
    this.state.value = {
      ...now,
      walls: wallsAlong(paths, frame, { grid, existing: this.existing() }),
    };
    this.show();
  }

  private existing() {
    return this.c.allElements().filter((element) => element.type === "wall");
  }

  /** Add the walls found to the scene, as one undo step, and finish. */
  commit() {
    // Walls someone has added since they were found go in only once.
    const walls = wallsNotIn(this.state.value?.walls ?? [], this.existing());
    if (walls.length > 0)
      this.c.scene.add(
        ...walls.map((t) => ({ type: "wall" as const, layer: "over" as const, ...t })),
      );
    this.stop();
  }

  stop() {
    if (!this.state.value) return;
    this.run++;
    this.state.value = null;
    this.placed = null;
    this.show();
  }

  /** The walls found, drawn over the map. */
  private show() {
    const walls = this.state.value?.walls;
    const { renderer } = this.c;
    renderer.proposal = walls
      ? { kind: "walls", walls: walls.map((t) => wallEnds(t)), layer: "over", ...PREVIEW }
      : null;
    renderer.invalidate("overlay", "presence");
  }

  /**
   * The map's image cut into samples about `perSample` world px apart: a few
   * to a grid cell, at most MAX_SAMPLES along its longer side and no finer
   * than the image itself. Read in the image worker.
   */
  private async sample(map: MapElement, perSample: number): Promise<Greyscale | null> {
    const { image } = map;
    const maxSide = Math.max(1, Math.round(Math.max(map.w, map.h) / perSample));
    const known = this.sampled;
    if (known?.hash === image.hash && known.maxSide === maxSide) return known.shades;
    const blob = await loadBlob(image.hash, this.c.renderer.peers);
    if (!blob) return null;
    const shades = await greyscaleOf(blob, maxSide);
    this.sampled = { hash: image.hash, maxSide, shades };
    return shades;
  }
}
