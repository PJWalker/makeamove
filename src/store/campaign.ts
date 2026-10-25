import { signal } from '@preact/signals'
import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newId, newSecret } from '../lib/ids'
import { device } from './device'
import { forgetCampaign, renameCampaignEntry, touchCampaign, upsertCampaign } from './registry'
import type { GridType } from '../scene/grid'
import { sceneDbName } from '../scene/sceneDoc'
import type { TokenStyle } from '../scene/types'

/*
 * Campaign root document layout (see design doc, "Data model"):
 *
 *   meta     Y.Map   name, systemId, systemVersion, roomKey, createdAt, createdBy,
 *                    defaultTokenStyle, defaultGridType
 *   members  Y.Map   deviceId -> Y.Map { name, role, joinedAt, activeSceneId }
 *   scenes   Y.Map   sceneId  -> Y.Map { name, canvasColour, order, visibility, doc }
 *
 * Each scene's contents (maps, tokens, drawings) live in its `doc`, a Yjs
 * subdocument that is loaded only while the scene is open (see SceneDoc).
 * Without a canvasColour the canvas takes a darkened version of the main
 * map's colour ("auto"). The UI is always tinted from the map when there is
 * one, and from the canvas colour otherwise.
 */

export type Role = 'gm' | 'player' | 'observer'
export type Visibility = 'everyone' | 'owners' | 'gm'

export interface MemberView {
  id: string
  name: string
  role: Role
  activeSceneId: string | null
}

export interface SceneView {
  id: string
  name: string
  /** A chosen canvas colour, or null for auto (from the map). */
  canvasColour: string | null
  order: string
  visibility: Visibility
}

const DEFAULT_SYSTEM = { id: 'dungeon-world', version: '0.1.0' }
/** Canvas colour for an auto scene with no map yet. */
export const DEFAULT_CANVAS_COLOUR = '#2b3a55'

export interface CampaignDefaults {
  tokenStyle: TokenStyle
  gridType: GridType
}

const dbName = (id: string) => `mam:campaign:${id}`
const sceneGuid = (campaignId: string, sceneId: string) => `${campaignId}/${sceneId}`

export class Campaign {
  readonly id: string
  readonly doc: Y.Doc
  readonly meta: Y.Map<any>
  readonly members: Y.Map<Y.Map<any>>
  readonly scenes: Y.Map<Y.Map<any>>
  private persistence: IndexeddbPersistence

  private constructor(id: string) {
    this.id = id
    this.doc = new Y.Doc({ guid: id })
    this.meta = this.doc.getMap('meta')
    this.members = this.doc.getMap('members')
    this.scenes = this.doc.getMap('scenes')
    this.persistence = new IndexeddbPersistence(dbName(id), this.doc)
  }

  static async open(id: string): Promise<Campaign> {
    const c = new Campaign(id)
    await c.persistence.whenSynced
    return c
  }

  destroy() {
    this.persistence.destroy()
    this.doc.destroy()
  }

  get name(): string {
    return this.meta.get('name') ?? 'Untitled campaign'
  }

  rename(name: string) {
    this.meta.set('name', name)
    renameCampaignEntry(this.id, name)
  }

  /** What the GM has chosen for new tokens and scenes. */
  defaults(): CampaignDefaults {
    return {
      tokenStyle: this.meta.get('defaultTokenStyle') ?? 'disc',
      gridType: this.meta.get('defaultGridType') ?? 'square',
    }
  }

  setDefaults(patch: Partial<CampaignDefaults>) {
    this.doc.transact(() => {
      if (patch.tokenStyle) this.meta.set('defaultTokenStyle', patch.tokenStyle)
      if (patch.gridType) this.meta.set('defaultGridType', patch.gridType)
    })
  }

  isGm(deviceId = device.value.id): boolean {
    return this.members.get(deviceId)?.get('role') === 'gm'
  }

  // Members

  memberViews(): MemberView[] {
    return [...this.members.entries()].map(([id, m]) => ({
      id,
      name: m.get('name') ?? 'Unnamed',
      role: m.get('role') ?? 'player',
      activeSceneId: m.get('activeSceneId') ?? null,
    }))
  }

  ensureMember(name: string, role: Role = 'player') {
    const id = device.value.id
    let m = this.members.get(id)
    this.doc.transact(() => {
      if (!m) {
        m = new Y.Map()
        m.set('role', role)
        m.set('joinedAt', Date.now())
        this.members.set(id, m)
      }
      if (name && m.get('name') !== name) m.set('name', name)
    })
  }

  // Scenes

  sceneViews(): SceneView[] {
    return [...this.scenes.entries()]
      .map(([id, s]) => ({
        id,
        name: s.get('name') ?? 'Untitled scene',
        canvasColour: s.get('canvasColour') ?? null,
        order: s.get('order') ?? 'a0',
        visibility: s.get('visibility') ?? 'everyone',
      }))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  }

  addScene(name: string): string {
    const id = newId()
    const views = this.sceneViews()
    const last = views.length ? views[views.length - 1].order : null
    const s = new Y.Map<any>()
    s.set('name', name)
    s.set('order', generateKeyBetween(last, null))
    s.set('visibility', 'everyone')
    s.set('doc', new Y.Doc({ guid: sceneGuid(this.id, id) }))
    this.scenes.set(id, s)
    return id
  }

  /** The scene's subdocument (not yet loaded). Scenes from M0 get one now. */
  sceneSubdoc(id: string): Y.Doc | null {
    const s = this.scenes.get(id)
    if (!s) return null
    let doc = s.get('doc')
    if (!(doc instanceof Y.Doc)) {
      // The guid is derived from the ids, so two peers doing this at once
      // still end up pointing at the same document.
      doc = new Y.Doc({ guid: sceneGuid(this.id, id) })
      s.set('doc', doc)
    }
    return doc
  }

  updateScene(id: string, patch: Partial<Omit<SceneView, 'id'>>) {
    const s = this.scenes.get(id)
    if (!s) return
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) s.delete(k)
        else s.set(k, v)
      }
    })
  }

  removeScene(id: string) {
    this.scenes.delete(id)
    // Drop this device's copy of the contents. Peers that still have the
    // scene keep theirs.
    indexedDB.deleteDatabase(sceneDbName(sceneGuid(this.id, id)))
  }

  activeSceneId(): string | null {
    const mine = this.members.get(device.value.id)?.get('activeSceneId')
    if (mine && this.scenes.has(mine)) return mine
    return this.sceneViews()[0]?.id ?? null
  }

  setActiveScene(sceneId: string) {
    this.members.get(device.value.id)?.set('activeSceneId', sceneId)
  }
}

// Lifecycle

export const activeCampaign = signal<Campaign | null>(null)

export async function createCampaign(name: string, gmName: string): Promise<string> {
  const id = newId()
  const c = await Campaign.open(id)
  c.doc.transact(() => {
    c.meta.set('name', name)
    c.meta.set('systemId', DEFAULT_SYSTEM.id)
    c.meta.set('systemVersion', DEFAULT_SYSTEM.version)
    c.meta.set('roomKey', newSecret())
    c.meta.set('createdAt', Date.now())
    c.meta.set('createdBy', device.value.id)
    c.ensureMember(gmName, 'gm')
    const first = c.addScene('The Opening Scene')
    c.setActiveScene(first)
  })
  const now = Date.now()
  upsertCampaign({
    id,
    name,
    systemId: DEFAULT_SYSTEM.id,
    role: 'gm',
    createdAt: now,
    lastOpenedAt: now,
  })
  c.destroy()
  return id
}

export async function openCampaign(id: string) {
  if (activeCampaign.value?.id === id) return
  closeCampaign()
  const c = await Campaign.open(id)
  if (!c.meta.has('name')) {
    // Nothing stored locally for this id. Joining by invite arrives in M2.
    c.destroy()
    await deleteLocalCampaign(id)
    throw new Error('it is not stored on this device')
  }
  touchCampaign(id)
  activeCampaign.value = c
}

export function closeCampaign() {
  activeCampaign.value?.destroy()
  activeCampaign.value = null
}

/** Remove a campaign from this device only. Peers keep their copies. */
export async function deleteLocalCampaign(id: string) {
  if (activeCampaign.value?.id === id) closeCampaign()
  const doc = new Y.Doc()
  const p = new IndexeddbPersistence(dbName(id), doc)
  await p.whenSynced
  for (const sceneId of doc.getMap('scenes').keys()) indexedDB.deleteDatabase(sceneDbName(sceneGuid(id, sceneId)))
  await p.clearData()
  doc.destroy()
  forgetCampaign(id)
}
