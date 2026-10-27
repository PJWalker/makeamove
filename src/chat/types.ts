import type { Roll } from '../dice/notation'

/*
 * Chat messages are immutable plain objects, appended to a chunk of the log
 * and never edited, so concurrent posts from several peers just interleave.
 */

interface Base {
  id: string
  /** Hybrid-logical-clock stamp; the log sorts by it. */
  hlc: string
  /** Device id of the sender. */
  author: string
  /** The sender's name when they sent it. */
  name: string
}

export interface TextMessage extends Base {
  kind: 'text'
  text: string
  /** "/me draws her sword" */
  emote?: boolean
  /** A whisper: only these devices (and the sender) see it. */
  to?: string[]
  /** Recipients' names when it was sent, for the "to …" line. */
  toNames?: string[]
}

/**
 * Who sees a roll's result:
 * - public:  everyone
 * - private: the roller and the GM ("self + GM"); a secret roll by the GM
 *            is seen only by the GM
 * There are no blind rolls: if a player shouldn't see a result, the GM rolls.
 */
export type RollVisibility = 'public' | 'private'

export interface RollMessage extends Base {
  kind: 'roll'
  roll: Roll
  comment?: string
  visibility: RollVisibility
  /** Damage or healing for these targets, which the GM can apply from the card. */
  damage?: { type: string; targets: MoveTarget[] }
}

export interface SystemMessage extends Base {
  kind: 'system'
  text: string
  event?: 'join' | 'session-start' | 'session-end' | 'scene-change'
  /** For session markers. */
  session?: number
  /** For scene changes: where the GM went. */
  sceneId?: string
}

/** A follow-up button on an action card. Never applied automatically. */
export interface MoveSuggestion {
  /** The system's follow-up id ("xp", "damage"). */
  id: string
  /** The button's text: "Mark XP", "Roll damage (d10+1)". */
  label: string
  /** Add to one of the character's data fields. */
  bump?: { field: string; by: number }
  /** Roll a formula and post it; with `damage`, as damage of that type (or healing) for `targets`. */
  roll?: { formula: string; comment: string; damage?: string; targets?: MoveTarget[] }
}

/** A token a move was aimed at, as it was when the move was made. */
export interface MoveTarget {
  /** The token's id on its scene. */
  id: string
  name: string
  /** The character the token stands for, if it's linked to one. */
  characterId?: string
  /** Its distance from the actor's token, formatted ("20 ft"), if both were on the scene. */
  distance?: string
  /** At long range: rolled with the system's long-range mode. */
  long?: boolean
  /** For a check against targets: the value it had to reach ("AC 13"), the roll and how it went. */
  against?: number
  roll?: Roll
  result?: string
  hit?: boolean
}

/** A roll each target is asked to make: a saving throw against the actor's DC. */
export interface SaveRequest {
  /** The action each target rolls. */
  action: string
  /** Its name: "Dexterity Save". */
  name: string
  dc: number
  success: string
  failure: string
}

/** A move being made, with its roll (or a roll per target), and the outcome text. */
export interface MoveMessage extends Base {
  kind: 'move'
  moveId: string
  moveName: string
  trigger: string
  characterId: string
  characterName: string
  targets?: MoveTarget[]
  roll?: Roll
  /** The check's result, by the system's id for it ("strong"). */
  result?: string
  /** The outcome for the result, or the move's text when it doesn't roll. */
  outcome: string
  suggestions: MoveSuggestion[]
  /** Asks every target to roll; answers are kept in the campaign's message state. */
  save?: SaveRequest
  /** A concentration check: failing the save ends the character's concentration. */
  concentration?: true
}

/** A real-time countdown: "/timer 60s World ends". Restarts and stops are kept in the message state. */
export interface TimerMessage extends Base {
  kind: 'timer'
  label: string
  /** How long it runs, in seconds. */
  seconds: number
  /** When it runs out, by the sender's clock (ms since the epoch). */
  endsAt: number
}

/** A counter the table moves by hand: "/count 0/8 The cops arrive". Its value is kept in the message state. */
export interface CounterMessage extends Base {
  kind: 'counter'
  label: string
  start: number
  max?: number
}

export type ChatMessage = TextMessage | RollMessage | SystemMessage | MoveMessage | TimerMessage | CounterMessage

/** What someone sees of a message: all of it, a placeholder, or nothing. */
export type Visibility = 'full' | 'masked' | 'hidden'

/** Players may delete their own messages; the GM may delete anyone's. */
export const canDelete = (m: ChatMessage, me: string, isGm: boolean) => isGm || m.author === me

/** Only text can be edited, and only by whoever wrote it. */
export const canEditMessage = (m: ChatMessage, me: string) => m.kind === 'text' && m.author === me

/** Timers and counters are worked by whoever started them and the GM. */
export const canWork = (m: ChatMessage, me: string, isGm: boolean) => isGm || m.author === me

export function visibilityOf(m: ChatMessage, me: string, isGm: boolean): Visibility {
  if (m.kind === 'text' && m.to) return m.author === me || m.to.includes(me) ? 'full' : 'hidden'
  if (m.kind === 'roll') {
    if (m.visibility === 'public' || isGm || m.author === me) return 'full'
    return 'masked'
  }
  return 'full'
}
