import type { ChatMessage, SystemMessage } from './types'

/*
 * The log split at the GM's session markers, so earlier sessions can be
 * folded away. Each "Session N begins" marker starts a new part; a part
 * also holds the "ends" marker and anything after it until the next start.
 * Messages before the first marker form a part of their own.
 */

export interface SessionPart {
  /** The starting marker's id, or "before" for messages before the first one. */
  key: string
  marker: SystemMessage | null
  messages: ChatMessage[]
  /** The latest part, which is never folded. */
  current: boolean
}

export const isSessionStart = (m: ChatMessage): m is SystemMessage => m.kind === 'system' && m.event === 'session-start'

export function splitSessions(messages: ChatMessage[]): SessionPart[] {
  const parts: SessionPart[] = []
  let part: SessionPart = { key: 'before', marker: null, messages: [], current: false }
  for (const m of messages) {
    if (isSessionStart(m)) {
      if (part.marker || part.messages.length) parts.push(part)
      part = { key: m.id, marker: m, messages: [], current: false }
    } else {
      part.messages.push(m)
    }
  }
  if (part.marker || part.messages.length) parts.push(part)
  if (parts.length) parts[parts.length - 1].current = true
  return parts
}
