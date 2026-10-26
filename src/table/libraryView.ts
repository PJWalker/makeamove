import { signal } from '@preact/signals'
import type { EntryKind } from '../library'
import { showPanel } from './panelLayout'

export type KindFilter = 'all' | EntryKind

/** What the Libraries panel shows, kept apart from it so sheets and actions can steer it. */
export const libraryView = signal<{ kind: KindFilter; query: string }>({ kind: 'all', query: '' })

/** Open the Libraries panel on one kind of entry, such as items for an inventory. */
export function browseLibrary(kind: KindFilter) {
  libraryView.value = { ...libraryView.value, kind }
  showPanel('libraries')
}
