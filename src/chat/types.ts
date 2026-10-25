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

export type ChatMessage = TextMessage | RollMessage | SystemMessage

/** What someone sees of a message: all of it, a placeholder, or nothing. */
export type Visibility = 'full' | 'masked' | 'hidden'

/** Players may delete their own messages; the GM may delete anyone's. */
export const canDelete = (m: ChatMessage, me: string, isGm: boolean) => isGm || m.author === me

export function visibilityOf(m: ChatMessage, me: string, isGm: boolean): Visibility {
  if (m.kind === 'text' && m.to) return m.author === me || m.to.includes(me) ? 'full' : 'hidden'
  if (m.kind === 'roll') {
    if (m.visibility === 'public' || isGm || m.author === me) return 'full'
    return 'masked'
  }
  return 'full'
}
