import { computed, signal } from '@preact/signals-react'
import { activeCampaign } from '../../campaign/campaign'
import { dataName } from '../../platform/dataEpoch'
import { device } from '../../platform/device'
import { getStorageItem, setStorageItem } from '../../platform/localStorage'
import { visibilityOf } from './types'

/*
 * Unread chat: messages from other people that arrived after this device
 * last had the chat in view. The marker is a HLC stamp per campaign, kept
 * in localStorage (it's a per-device convenience, not shared state).
 */

const key = (campaignId: string) => dataName('chat-seen', campaignId)

function load(campaignId: string): string {
  return getStorageItem(key(campaignId)) ?? ''
}

const stamps = new Map<string, string>()
/** Bumped when a stamp changes, so the unread count recomputes. */
const version = signal(0)

/** The last stamp seen in a campaign. */
function seenStamp(campaignId: string): string {
  void version.value
  if (!stamps.has(campaignId)) stamps.set(campaignId, load(campaignId))
  return stamps.get(campaignId)!
}

export const unreadCount = computed(() => {
  const c = activeCampaign.value
  if (!c) return 0
  const since = seenStamp(c.id)
  const me = device.value.id
  const isGm = c.isGm()
  let n = 0
  for (const m of c.chat.messages.value) {
    if (m.hlc > since && m.author !== me && m.kind !== 'system' && visibilityOf(m, me, isGm) !== 'hidden') n++
  }
  return n
})

/** The chat is in view: everything up to now is read. */
export function markRead() {
  const c = activeCampaign.value
  const last = c?.chat.messages.peek().at(-1)
  if (!c || !last || last.hlc <= seenStamp(c.id)) return
  stamps.set(c.id, last.hlc)
  version.value++
  setStorageItem(key(c.id), last.hlc)
}
