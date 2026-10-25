import type { Icon } from '../ui/icons'

/*
 * The action index: one list of everything a player can do or look up. The
 * command palette searches it and the hotbar pins entries from it by id.
 * It is derived data, rebuilt from the synced sources and never stored.
 */

export type ActionKind = 'move' | 'item' | 'tool' | 'command' | 'entry' | 'setting'

/** What an `entry` is, so prefixes (@ for characters, # for notes) can narrow. */
export type EntryGroup = 'character' | 'scene' | 'note' | 'compendium'

export interface Action {
  /** Stable, for example `move:hack-and-slash` or `tool:ping`. The hotbar stores these. */
  id: string
  kind: ActionKind
  group?: EntryGroup
  title: string
  aliases?: string[]
  tags?: string[]
  /** Where it comes from: Core, the game system, a character, the campaign. */
  source: string
  /** One line under the title. */
  detail?: string
  /** A shortcut hint, such as the tool's key. */
  hint?: string
  icon?: Icon
  /** True, or the reason it can't run now. Unavailable actions stay listed, dimmed. */
  available: true | string
  /** Comes from the selected character, so it ranks first. */
  mine?: boolean
  run: () => void
  /** A secondary action, usually showing full text without running it. */
  open?: () => void
}

