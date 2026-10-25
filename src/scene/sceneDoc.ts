import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newId } from '../lib/ids'
import { device } from '../store/device'
import { DEFAULT_GRID, type Grid, type GridType } from './grid'
import { LAYERS, type Layer, type NewElement, type SceneElement } from './types'

/*
 * Scene subdocument layout (see design doc, "Data model"):
 *
 *   settings  Y.Map  gridType, gridSize, gridOffsetX, gridOffsetY
 *   elements  Y.Map  elementId -> Y.Map of SceneElement fields
 *
 * Each scene is a Yjs subdocument of the campaign root, persisted in its own
 * IndexedDB database and loaded only while someone is looking at it.
 */

export const sceneDbName = (guid: string) => `mam:scene:${guid}`

const byOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export class SceneDoc {
  readonly doc: Y.Doc
  readonly elements: Y.Map<Y.Map<any>>
  readonly settings: Y.Map<any>
  readonly undo: Y.UndoManager
  /** Marks this user's own edits, so undo never reverts anyone else's. */
  readonly origin = { local: true }
  private persistence: IndexeddbPersistence

  private constructor(doc: Y.Doc) {
    this.doc = doc
    this.elements = doc.getMap('elements')
    this.settings = doc.getMap('settings')
    this.persistence = new IndexeddbPersistence(sceneDbName(doc.guid), doc)
    this.undo = new Y.UndoManager([this.elements, this.settings], {
      trackedOrigins: new Set([this.origin]),
      // Every committed action is its own undo step.
      captureTimeout: 0,
    })
  }

  /**
   * Load a scene. A scene that has never had a grid type gets `gridType`,
   * the campaign's default, as an untracked edit (so it can't be undone).
   */
  static async open(doc: Y.Doc, gridType: GridType = DEFAULT_GRID.type): Promise<SceneDoc> {
    doc.load()
    const s = new SceneDoc(doc)
    await s.persistence.whenSynced
    if (!s.settings.has('gridType')) doc.transact(() => s.settings.set('gridType', gridType))
    return s
  }

  /** Unload the scene. Its subdocument is replaced by an unloaded stub. */
  destroy() {
    this.undo.destroy()
    this.persistence.destroy()
    this.doc.destroy()
  }

  transact(fn: () => void) {
    this.doc.transact(fn, this.origin)
  }

  // Settings

  grid(): Grid {
    const s = this.settings
    return {
      type: s.get('gridType') ?? DEFAULT_GRID.type,
      size: s.get('gridSize') ?? DEFAULT_GRID.size,
      offsetX: s.get('gridOffsetX') ?? DEFAULT_GRID.offsetX,
      offsetY: s.get('gridOffsetY') ?? DEFAULT_GRID.offsetY,
    }
  }

  setGrid(patch: Partial<Grid>) {
    const keys: Record<keyof Grid, string> = { type: 'gridType', size: 'gridSize', offsetX: 'gridOffsetX', offsetY: 'gridOffsetY' }
    this.transact(() => {
      for (const [k, v] of Object.entries(patch)) this.settings.set(keys[k as keyof Grid], v)
    })
  }

  // Elements

  get(id: string): SceneElement | null {
    const m = this.elements.get(id)
    return m ? ({ id, ...m.toJSON() } as SceneElement) : null
  }

  /** Every element, bottom to top. */
  views(): SceneElement[] {
    const out: SceneElement[] = []
    for (const [id, m] of this.elements) out.push({ id, ...m.toJSON() } as SceneElement)
    return out.sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || byOrder(a.z, b.z) || byOrder(a.id, b.id))
  }

  private topZ(layer: Layer): string | null {
    let top: string | null = null
    for (const m of this.elements.values()) {
      const z = m.get('z')
      if (m.get('layer') === layer && (top === null || z > top)) top = z
    }
    return top
  }

  private bottomZ(layer: Layer): string | null {
    let bottom: string | null = null
    for (const m of this.elements.values()) {
      const z = m.get('z')
      if (m.get('layer') === layer && (bottom === null || z < bottom)) bottom = z
    }
    return bottom
  }

  add(...els: NewElement[]): string[] {
    const ids: string[] = []
    this.transact(() => {
      for (const el of els) {
        const id = newId()
        const m = new Y.Map<any>()
        const full = { locked: false, ...el, z: generateKeyBetween(this.topZ(el.layer), null), createdBy: device.value.id }
        for (const [k, v] of Object.entries(full)) if (v !== undefined) m.set(k, v)
        this.elements.set(id, m)
        ids.push(id)
      }
    })
    return ids
  }

  /** Apply several patches as one undo step. */
  update(patches: Map<string, Partial<SceneElement>> | [string, Partial<SceneElement>][]) {
    this.transact(() => {
      for (const [id, patch] of patches) {
        const m = this.elements.get(id)
        if (!m) continue
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) m.delete(k)
          else m.set(k, v)
        }
      }
    })
  }

  remove(ids: Iterable<string>) {
    this.transact(() => {
      for (const id of ids) this.elements.delete(id)
    })
  }

  /** Copies of elements, nudged so they don't sit exactly on the originals. */
  duplicate(ids: Iterable<string>, offset: number): string[] {
    const copies: NewElement[] = []
    for (const id of ids) {
      const el = this.get(id)
      if (!el) continue
      const { id: _id, z: _z, createdBy: _by, ...rest } = el
      copies.push({ ...rest, x: el.x + offset, y: el.y + offset, locked: false })
    }
    return this.add(...copies)
  }

  /** Move elements to the top (or bottom) of their layers, keeping their order. */
  restack(ids: Iterable<string>, to: 'front' | 'back') {
    const els = [...ids].map((id) => this.get(id)).filter((e): e is SceneElement => !!e)
    els.sort((a, b) => byOrder(a.z, b.z))
    this.transact(() => {
      if (to === 'front') {
        for (const el of els) this.elements.get(el.id)!.set('z', generateKeyBetween(this.topZ(el.layer), null))
      } else {
        for (const el of els.reverse()) this.elements.get(el.id)!.set('z', generateKeyBetween(null, this.bottomZ(el.layer)))
      }
    })
  }

  /** Move elements to another layer, on top of what's already there. */
  setLayer(ids: Iterable<string>, layer: Layer) {
    this.transact(() => {
      for (const id of ids) {
        const m = this.elements.get(id)
        if (!m || m.get('layer') === layer) continue
        m.set('z', generateKeyBetween(this.topZ(layer), null))
        m.set('layer', layer)
      }
    })
  }
}
