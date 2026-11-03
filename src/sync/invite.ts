/*
 * Invite links look like `https://app/#join=<campaignId>.<roomKey>`. Both
 * parts sit in the URL fragment, so the room key never reaches a server.
 */

import { DATA_EPOCH } from '../platform/dataEpoch'

export interface Invite {
  campaignId: string
  roomKey: string
}

export function inviteHash({ campaignId, roomKey }: Invite): string {
  return `#join=v${DATA_EPOCH}.${campaignId}.${roomKey}`
}

export function inviteUrl(invite: Invite, base = location.href.split('#')[0]): string {
  return base + inviteHash(invite)
}

/** Read an invite from a link or a bare hash; null if it isn't one. */
export function parseInvite(text: string): Invite | null {
  const m = text.match(new RegExp(`#?join=v${DATA_EPOCH}\\.([0-9a-z]+)\\.([A-Za-z0-9_-]{16,})\\s*$`))
  const campaignId = m?.[1]
  const roomKey = m?.[2]
  return campaignId && roomKey ? { campaignId, roomKey } : null
}
