import { stampTime } from '../lib/hlc'
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

/** Messages from one person within this long share a header. */
export const GROUP_MS = 5 * 60 * 1000

/** One row of the chat log as shown: a message, or an earlier session's fold. */
export type LogRow =
  | { kind: 'message'; key: string; m: ChatMessage; header: boolean }
  | { kind: 'fold'; key: string; part: string; title: string; count: number; open: boolean }

/**
 * The log flattened into the rows it shows, so the panel can render just a
 * window of them. Earlier sessions are a fold, followed by their messages
 * when open; the current session shows its marker and everything after it.
 */
export function logRows(messages: ChatMessage[], isOpen: (part: string) => boolean): LogRow[] {
  const rows: LogRow[] = []
  const add = (list: ChatMessage[]) =>
    list.forEach((m, i) => {
      const prev = list[i - 1]
      const header =
        m.kind !== 'system' && (!prev || prev.kind === 'system' || prev.author !== m.author || stampTime(m.hlc) - stampTime(prev.hlc) > GROUP_MS)
      rows.push({ kind: 'message', key: m.id, m, header })
    })
  for (const part of splitSessions(messages)) {
    if (part.current) {
      if (part.marker) add([part.marker])
      add(part.messages)
      continue
    }
    const open = isOpen(part.key)
    rows.push({
      kind: 'fold',
      key: `fold:${part.key}`,
      part: part.key,
      title: part.marker ? `Session ${part.marker.session ?? ''}`.trim() : 'Before the first session',
      count: part.messages.filter((m) => m.kind !== 'system').length,
      open,
    })
    if (open) add(part.messages)
  }
  return rows
}
