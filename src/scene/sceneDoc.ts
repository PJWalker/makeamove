import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { newId } from "../lib/ids";
import { dataName } from "../platform/dataEpoch";
import { device } from "../platform/device";
import type { Grid } from "./grid";
import { LAYERS, type Layer, type NewElement, type SceneElement } from "./types";
import { rootOf, type Patch, type Root } from "../data/schema";
import { sceneShape } from "./schema";

/* A scene subdocument and how it's edited; its layout is declared in schema.ts. */

export const sceneDbName = (guid: string) => dataName("scene", guid);

/** Lighting on or off, how dark unlit places are (0 to 1), and whether players see only what their tokens see. */
export interface SceneLighting {
  enabled: boolean;
  darkness: number;
  vision: boolean;
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
  readonly undo: Y.UndoManager;
  /** Marks this user's own edits, so undo never reverts anyone else's. */
  readonly origin = { local: true };
  private persistence: IndexeddbPersistence;

  private constructor(doc: Y.Doc) {
    this.doc = doc;
    const root = rootOf(doc, sceneShape);
    this.elements = root.elements;
    this.settings = root.settings;
    this.persistence = new IndexeddbPersistence(sceneDbName(doc.guid), doc);
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
  static async open(doc: Y.Doc, defaults: Partial<Grid> = {}): Promise<SceneDoc> {
    doc.load();
    const s = new SceneDoc(doc);
    await s.persistence.whenSynced;
    const missing = (Object.keys(defaults) as (keyof Grid)[]).filter(
      (k) => defaults[k] !== undefined && !s.settings.has(GRID_KEYS[k]),
    );
    if (missing.length)
      s.settings.patch(gridSettings(Object.fromEntries(missing.map((k) => [k, defaults[k]]))));
    return s;
  }

  /** Unload the scene. Its subdocument is replaced by an unloaded stub. */
  destroy() {
    this.undo.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }

  transact(fn: () => void) {
    this.doc.transact(fn, this.origin);
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
    return { enabled: s.get("lighting"), darkness: s.get("darkness"), vision: s.get("vision") };
  }

  setLighting(patch: Partial<SceneLighting>) {
    this.transact(() =>
      this.settings.patch({
        lighting: patch.enabled,
        darkness: patch.darkness,
        vision: patch.vision,
      }),
    );
  }

  setGrid(patch: Partial<Grid>) {
    this.transact(() => this.settings.patch(gridSettings(patch)));
  }

  // Elements

  get(id: string): SceneElement | null {
    return this.elements.view(id) ?? null;
  }

  /** Every element that can be drawn, bottom to top. */
  views(): SceneElement[] {
    return this.elements
      .views()
      .map(([, el]) => el)
      .sort(
        (a, b) =>
          LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) ||
          byOrder(a.z, b.z) ||
          byOrder(a.id, b.id),
      );
  }

  private topZ(layer: Layer): string | null {
    let top: string | null = null;
    for (const m of this.elements.values()) {
      const z = m.get("z");
      if (m.get("layer") === layer && (top === null || z > top)) top = z;
    }
    return top;
  }

  private bottomZ(layer: Layer): string | null {
    let bottom: string | null = null;
    for (const m of this.elements.values()) {
      const z = m.get("z");
      if (m.get("layer") === layer && (bottom === null || z < bottom)) bottom = z;
    }
    return bottom;
  }

  add(...els: NewElement[]): string[] {
    const ids: string[] = [];
    this.transact(() => {
      for (const el of els) {
        const id = newId();
        this.elements.set(id, {
          locked: false,
          ...el,
          z: generateKeyBetween(this.topZ(el.layer), null),
          createdBy: device.value.id,
        });
        ids.push(id);
      }
    });
    return ids;
  }

  /** Apply several patches as one undo step; an `undefined` value clears that field. */
  update(patches: Map<string, ElementPatch> | [string, ElementPatch][]) {
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
      const el = this.get(id);
      if (!el) continue;
      const { id: _id, z: _z, createdBy: _by, ...rest } = el;
      copies.push({ ...rest, x: el.x + offset, y: el.y + offset, locked: false });
    }
    return this.add(...copies);
  }

  /** Move elements to the top (or bottom) of their layers, keeping their order. */
  restack(ids: Iterable<string>, to: "front" | "back") {
    const els = [...ids].map((id) => this.get(id)).filter((e): e is SceneElement => !!e);
    els.sort((a, b) => byOrder(a.z, b.z));
    this.transact(() => {
      if (to === "front") {
        for (const el of els)
          this.elements.get(el.id)!.patch({ z: generateKeyBetween(this.topZ(el.layer), null) });
      } else {
        for (const el of els.reverse())
          this.elements.get(el.id)!.patch({ z: generateKeyBetween(null, this.bottomZ(el.layer)) });
      }
    });
  }

  /** Move elements to another layer, on top of what's already there. */
  setLayer(ids: Iterable<string>, layer: Layer) {
    this.transact(() => {
      for (const id of ids) {
        const m = this.elements.get(id);
        if (!m || m.get("layer") === layer) continue;
        m.patch({ z: generateKeyBetween(this.topZ(layer), null), layer });
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
