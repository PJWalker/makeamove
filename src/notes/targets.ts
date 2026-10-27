import { signal } from '@preact/signals'
import { listCharacters, selectCharacter, systemOf } from '../characters/api'
import type { Campaign } from '../store/campaign'
import { libraryView } from '../table/libraryView'
import { showPanel } from '../table/panelLayout'
import { listNotes, type LinkKind } from './api'

/** Something a note can link to, as offered after typing `@`. */
export interface LinkTarget {
  kind: LinkKind
  id: string
  label: string
  /** What it is, shown beside the label. */
  detail: string
  /** An icon name for items and moves (ui/entryIcons.tsx). */
  icon?: string
  /** A GM-only page. */
  gmOnly?: boolean
}

const KIND_DETAIL: Record<LinkKind, string> = { note: 'Note', character: 'Character', scene: 'Scene', item: 'Item', move: 'Move' }

/** Link targets matching a query: notes, characters, scenes, then the system's items and moves. */
export function linkTargets(campaign: Campaign, query: string, exceptNote?: string, limit = 8): LinkTarget[] {
  const system = systemOf(campaign)
  const all: LinkTarget[] = [
    ...listNotes(campaign)
      .filter((n) => n.id !== exceptNote)
      .map((n) => ({ kind: 'note' as const, id: n.id, label: n.title, detail: n.gmOnly ? 'GM page' : KIND_DETAIL.note, gmOnly: n.gmOnly })),
    ...listCharacters(campaign).map((c) => ({ kind: 'character' as const, id: c.id, label: c.name, detail: c.kind === 'npc' ? 'NPC' : KIND_DETAIL.character })),
    ...campaign.sceneViews().map((s) => ({ kind: 'scene' as const, id: s.id, label: s.name, detail: KIND_DETAIL.scene })),
    ...system.items.map((i) => ({ kind: 'item' as const, id: i.id, label: i.name, detail: KIND_DETAIL.item, icon: i.icon })),
    ...system.actions.map((m) => ({ kind: 'move' as const, id: m.id, label: m.name, detail: KIND_DETAIL.move, icon: m.category === 'class' ? 'class-move' : undefined })),
  ]
  const q = query.trim().toLowerCase()
  if (!q) return all.slice(0, limit)
  // Names that start with the query first, then any that contain it.
  const starts = all.filter((t) => t.label.toLowerCase().startsWith(q))
  const contains = all.filter((t) => !t.label.toLowerCase().startsWith(q) && t.label.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, limit)
}

/** The current name of a link's target, or null if it's gone. */
export function linkLabel(campaign: Campaign, kind: LinkKind, id: string): string | null {
  const system = systemOf(campaign)
  switch (kind) {
    case 'note':
      return listNotes(campaign).find((n) => n.id === id)?.title ?? null
    case 'character':
      return listCharacters(campaign).find((c) => c.id === id)?.name ?? null
    case 'scene':
      return campaign.sceneViews().find((s) => s.id === id)?.name ?? null
    case 'item':
      return system.items.find((i) => i.id === id)?.name ?? null
    case 'move':
      return system.actions.find((m) => m.id === id)?.name ?? null
  }
}

/** The page open in the Notes panel, if any. */
export const openNoteId = signal<string | null>(null)

/** Counts each request to open a page, even the one already chosen, so the panel shows it. */
export const noteOpened = signal(0)

/** Open a note's page in the Notes panel. */
export function openNote(id: string) {
  openNoteId.value = id
  noteOpened.value++
  showPanel('notes')
}

/** Follow a link: open the page, the character's sheet, the scene, or the Libraries. */
export function followLink(campaign: Campaign, kind: LinkKind, id: string) {
  switch (kind) {
    case 'note':
      return openNote(id)
    case 'character':
      selectCharacter(campaign, id)
      return showPanel('characters')
    case 'scene':
      return campaign.setActiveScene(id)
    case 'item':
    case 'move': {
      const label = linkLabel(campaign, kind, id) ?? ''
      libraryView.value = { kind, query: label }
      return showPanel('libraries')
    }
  }
}
