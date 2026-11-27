import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { newId } from "../lib/ids";
import { dataName } from "../platform/dataEpoch";
import { device } from "../platform/device";
import { rootOf } from "../data/schema";
import type { Patch, Root } from "../data/schema";
import type { FogMode } from "./fog";
import type { Grid } from "./grid";
import { LAYERS } from "./types";
import type { Layer, NewElement, SceneElement } from "./types";
import { sceneShape } from "./schema";

/* A scene subdocument and how it's edited; its layout is declared in schema.ts. */

export const sceneDbName = (guid: string) => dataName("scene", guid);

/**
 * Lighting on or off, how dark unlit places are (0 to 1), whether players
 * see only what their tokens see, and the scene's fog of war.
 */
export interface SceneLighting {
  enabled: boolean;
  darkness: number;
  vision: boolean;
  fog: FogMode;
}

/** Where each grid setting is kept in a scene's settings. */
const GRID_KEYS = {
  type: "gridType",
  size: "gridSize",
  offsetX: "gridOffsetX",
  offsetY: "gridOffsetY",
  unit: "gridUnit",
  unitName: "gridUnitName",
  diagonal: "gridDiagonal",
} as const satisfies Record<keyof Grid, string>;

const byOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fields to set on an element; `undefined` removes one. */
export type ElementPatch = Unset<SceneElement>;
/** Optional fields that can be unset; spread over each kind of element. */
type Unset<T> = { [K in keyof T]?: T[K] | undefined };

export class SceneDoc {
  readonly doc: Y.Doc;
  readonly elements: Root<typeof sceneShape>["elements"];
  readonly settings: Root<typeof sceneShape>["settings"];
  /** What characters have seen, place by place, for fog of war. */
  readonly explored: Root<typeof sceneShape>["explored"];
  readonly undo: Y.UndoManager;
  /** Marks this user's own edits, so undo never reverts anyone else's. */
  readonly origin = { local: true };
  private readonly persistence: IndexeddbPersistence;

  private constructor(document: Y.Doc) {
    this.doc = document;
    const root = rootOf(document, sceneShape);
    this.elements = root.elements;
    this.settings = root.settings;
    this.explored = root.explored;
    this.persistence = new IndexeddbPersistence(sceneDbName(document.guid), document);
    this.undo = new Y.UndoManager([this.elements.y, this.settings.y], {
      trackedOrigins: new Set([this.origin]),
      // Every committed action is its own undo step.
      captureTimeout: 0,
    });
  }

  /**
   * Load a scene. Grid settings it has never had (its type, units and
   * diagonal rule) get the campaign's and system's defaults, as an untracked
   * edit so they can't be undone.
   */
  static async open(document: Y.Doc, defaults: Partial<Grid> = {}): Promise<SceneDoc> {
    document.load();
    const s = new SceneDoc(document);
    await s.persistence.whenSynced;
    const missing = (Object.keys(defaults) as (keyof Grid)[]).filter(
      (k) => defaults[k] !== undefined && !s.settings.has(GRID_KEYS[k]),
    );
    if (missing.length > 0)
      s.settings.patch(gridSettings(Object.fromEntries(missing.map((k) => [k, defaults[k]]))));
    return s;
  }

  /** Unload the scene. Its subdocument is replaced by an unloaded stub. */
  destroy() {
    this.undo.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }

  transact(function_: () => void) {
    this.doc.transact(function_, this.origin);
  }

  // Settings

  grid(): Grid {
    const grid = {} as Record<keyof Grid, unknown>;
    for (const [k, key] of Object.entries(GRID_KEYS))
      grid[k as keyof Grid] = this.settings.get(key);
    return grid as Grid;
  }

  /** The scene's lighting, and whether players see only what their tokens do (M12). */
  lighting(): SceneLighting {
    const s = this.settings;
    return {
      enabled: s.get("lighting"),
      darkness: s.get("darkness"),
      vision: s.get("vision"),
      fog: s.get("fog"),
    };
  }

  setLighting(patch: Partial<SceneLighting>) {
    this.transact(() => {
      this.settings.patch({
        lighting: patch.enabled,
        darkness: patch.darkness,
        vision: patch.vision,
        fog: patch.fog,
      });
    });
  }

  // Fog of war

  /** What characters have seen, each a polygon in the world, flat [x, y, …]. */
  exploredSights(): number[][] {
    return this.explored.views().map(([, points]) => points);
  }

  /**
   * Remember what a character saw from the place `key` names. Untracked, so
   * undo never forgets it, and whichever device records a place first, the
   * same key keeps it to one entry.
   */
  explore(sights: Map<string, number[]>) {
    this.doc.transact(() => {
      for (const [key, points] of sights) this.explored.set(key, points);
    });
  }

  /** Forget everything characters have seen, covering the scene in fog again. */
  forgetExplored() {
    this.doc.transact(() => {
      this.explored.clear();
    });
  }

  setGrid(patch: Partial<Grid>) {
    this.transact(() => {
      this.settings.patch(gridSettings(patch));
    });
  }

  // Elements

  get(id: string): SceneElement | null {
    return this.elements.view(id) ?? null;
  }

  /** Every element that can be drawn, bottom to top. */
  views(): SceneElement[] {
    return this.elements
      .views()
      .map(([, element]) => element)
      .sort(
        (a, b) =>
          LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) ||
          byOrder(a.z, b.z) ||
          byOrder(a.id, b.id),
      );
  }

  /** The order of the topmost (or bottommost) element in a layer; null if it's empty. */
  private edgeZ(layer: Layer, edge: "bottom" | "top"): string | null {
    let found: string | null = null;
    for (const m of this.elements.values()) {
      if (m.get("layer") !== layer) continue;
      const z = m.get("z");
      if (found === null || (edge === "top" ? z > found : z < found)) found = z;
    }
    return found;
  }

  /** An order above everything in a layer. */
  private zOnTop(layer: Layer): string {
    return generateKeyBetween(this.edgeZ(layer, "top"), null);
  }

  add(...els: NewElement[]): string[] {
    const ids: string[] = [];
    this.transact(() => {
      for (const element of els) {
        const id = newId();
        this.elements.set(id, {
          locked: false,
          ...element,
          z: this.zOnTop(element.layer),
          createdBy: device.value.id,
        });
        ids.push(id);
      }
    });
    return ids;
  }

  /** Apply several patches as one undo step; an `undefined` value clears that field. */
  update(patches: [string, ElementPatch][] | Map<string, ElementPatch>) {
    this.transact(() => {
      for (const [id, patch] of patches) this.elements.get(id)?.patchCase(patch);
    });
  }

  remove(ids: Iterable<string>) {
    this.transact(() => {
      for (const id of ids) this.elements.delete(id);
    });
  }

  /** Copies of elements, nudged so they don't sit exactly on the originals. */
  duplicate(ids: Iterable<string>, offset: number): string[] {
    const copies: NewElement[] = [];
    for (const id of ids) {
      const element = this.get(id);
      if (!element) continue;
      const { id: _id, z: _z, createdBy: _by, ...rest } = element;
      copies.push({ ...rest, x: element.x + offset, y: element.y + offset, locked: false });
    }
    return this.add(...copies);
  }

  /** Move elements to the top (or bottom) of their layers, keeping their order. */
  restack(ids: Iterable<string>, to: "back" | "front") {
    const els = [...ids].map((id) => this.get(id)).filter((e): e is SceneElement => !!e);
    els.sort((a, b) => byOrder(a.z, b.z));
    this.transact(() => {
      if (to === "front") {
        for (const element of els)
          this.elements.get(element.id)!.patch({ z: this.zOnTop(element.layer) });
      } else {
        for (const element of els.reverse())
          this.elements
            .get(element.id)!
            .patch({ z: generateKeyBetween(null, this.edgeZ(element.layer, "bottom")) });
      }
    });
  }

  /** Move elements to another layer, on top of what's already there. */
  setLayer(ids: Iterable<string>, layer: Layer) {
    this.transact(() => {
      for (const id of ids) {
        const m = this.elements.get(id);
        if (!m || m.get("layer") === layer) continue;
        m.patch({ z: this.zOnTop(layer), layer });
      }
    });
  }
}

/** Grid settings as they're kept in a scene's settings. */
function gridSettings(grid: Partial<Grid>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(grid)) out[GRID_KEYS[k as keyof Grid]] = v;
  return out as Patch<(typeof sceneShape)["settings"]["shape"]>;
}
