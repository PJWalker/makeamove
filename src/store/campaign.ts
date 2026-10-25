import { signal } from '@preact/signals'
import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newId, newSecret } from '../lib/ids'
import { device } from './device'
import { forgetCampaign, renameCampaignEntry, touchCampaign, upsertCampaign } from './registry'

/*
 * Campaign root document layout (see design doc, "Data model"):
 *
 *   meta     Y.Map   name, systemId, systemVersion, roomKey, createdAt, createdBy
 *   members  Y.Map   deviceId -> Y.Map { name, role, joinedAt, activeSceneId }
 *   scenes   Y.Map   sceneId  -> Y.Map { name, colour, order, visibility }
 *
 * Scene contents (maps, tokens, drawings) arrive in M1 as per-scene subdocs;
 * the root only holds the scene index.
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
  colour: string
  order: string
  visibility: Visibility
}

const DEFAULT_SYSTEM = { id: 'dungeon-world', version: '0.1.0' }
const DEFAULT_SCENE_COLOUR = '#2b3a55'

const dbName = (id: string) => `mam:campaign:${id}`

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
        colour: s.get('colour') ?? DEFAULT_SCENE_COLOUR,
        order: s.get('order') ?? 'a0',
        visibility: s.get('visibility') ?? 'everyone',
      }))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  }

  addScene(name: string, colour = DEFAULT_SCENE_COLOUR): string {
    const id = newId()
    const views = this.sceneViews()
    const last = views.length ? views[views.length - 1].order : null
    const s = new Y.Map<any>()
    s.set('name', name)
    s.set('colour', colour)
    s.set('order', generateKeyBetween(last, null))
    s.set('visibility', 'everyone')
    this.scenes.set(id, s)
    return id
  }

  updateScene(id: string, patch: Partial<Omit<SceneView, 'id'>>) {
    const s = this.scenes.get(id)
    if (!s) return
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) s.set(k, v)
    })
  }

  removeScene(id: string) {
    this.scenes.delete(id)
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
  const p = new IndexeddbPersistence(dbName(id), new Y.Doc())
  await p.whenSynced
  await p.clearData()
  forgetCampaign(id)
}
