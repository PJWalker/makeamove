import type * as Y from 'yjs'

/*
 * Chat messages never change, but some things about them do: a target's
 * answer to a roll request, damage the GM applied, and (M10) edits and pins.
 * Those live in one root-level map, keyed `messageId/field`, so answers from
 * different targets never conflict, and deleting a message drops its keys.
 */

export type MessageState = Y.Map<any>

const key = (messageId: string, field: string) => `${messageId}/${field}`

export function getState<T>(state: MessageState, messageId: string, field: string): T | undefined {
  return state.get(key(messageId, field))
}

export function setState(state: MessageState, messageId: string, field: string, value: unknown) {
  if (value === undefined) state.delete(key(messageId, field))
  else state.set(key(messageId, field), value)
}

/** Every field a message has, by field name. */
export function stateOf(state: MessageState, messageId: string): Record<string, any> {
  const prefix = `${messageId}/`
  const out: Record<string, any> = {}
  for (const [k, v] of state.entries()) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
  return out
}

export function clearState(state: MessageState, messageId: string) {
  const prefix = `${messageId}/`
  for (const k of [...state.keys()]) if (k.startsWith(prefix)) state.delete(k)
}

/** A target's answer to a roll request: its total, and whether it met the DC. */
export interface SaveAnswer {
  total: number
  /** The dice, as rolled, for the card: "14+2". */
  detail: string
  success: boolean
  by: string
}

export const saveField = (targetId: string) => `save:${targetId}`
export const appliedField = (targetId: string) => `applied:${targetId}`
