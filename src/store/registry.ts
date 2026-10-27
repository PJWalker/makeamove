import { signal } from '@preact/signals'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

/**
 * The local list of campaigns on this device. It never syncs to peers: each
 * device keeps its own list of the campaigns it has created or joined.
 */
export interface CampaignSummary {
  id: string
  name: string
  systemId: string
  role: 'gm' | 'player'
  /** Secret from the invite link; the key to this campaign's room. */
  roomKey?: string
  createdAt: number
  lastOpenedAt: number
}

const doc = new Y.Doc()
const list = doc.getMap<CampaignSummary>('campaigns')
const persistence = new IndexeddbPersistence('mam:registry', doc)

export const campaigns = signal<CampaignSummary[]>([])
export const registryReady = signal(false)

function refresh() {
  campaigns.value = [...list.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

list.observe(refresh)
persistence.whenSynced.then(() => {
  refresh()
  registryReady.value = true
})

export function upsertCampaign(summary: CampaignSummary) {
  list.set(summary.id, summary)
}

export const summaryOf = (id: string): CampaignSummary | undefined => list.get(id)

export function touchCampaign(id: string) {
  const existing = list.get(id)
  if (existing) list.set(id, { ...existing, lastOpenedAt: Date.now() })
}

export function renameCampaignEntry(id: string, name: string) {
  updateCampaignEntry(id, { name })
}

/** Bring this device's entry in line with the campaign (its name, its system), writing only if something changed. */
export function updateCampaignEntry(id: string, patch: Partial<Pick<CampaignSummary, 'name' | 'systemId'>>) {
  const existing = list.get(id)
  if (!existing) return
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== undefined && existing[k] !== patch[k])
  if (changed) list.set(id, { ...existing, ...patch })
}

export function forgetCampaign(id: string) {
  list.delete(id)
}
