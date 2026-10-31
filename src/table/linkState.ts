import { signal } from '@preact/signals'
import {
  addItem,
  canEdit,
  getCharacter,
  selectedCharacterId,
  startMove,
  systemOf,
} from "../characters/api";
import type { Campaign } from "../store/campaign";
import type { LinkKind } from '../notes/api'
import { morphOpen } from '../ui/morph'
import { raisePopup } from '../ui/popup'
import { hideTooltip } from '../ui/Tooltip'
import type { MenuItem } from './ContextMenu'
import { entityTabId } from './entityWindows'
import { layout, locate, showPanel } from './panelLayout'

/*
 * What links in rich text have open: pop-ups showing what they point at,
 * a right-click menu, and the little pop-up that renames a link. Drawn by
 * LinkPopups.tsx; kept apart so the editor needn't import the sheets and
 * pages those pop-ups show.
 */

export interface LinkRef {
  kind: LinkKind
  id: string
}

/** The primary action exposed by a linked item or move. */
export function linkActionItems(campaign: Campaign, link: LinkRef): MenuItem[] {
  if (link.kind !== 'item' && link.kind !== 'move') return []
  const me = getCharacter(campaign, selectedCharacterId(campaign))
  const canAct = !!me && canEdit(campaign, me)
  const system = systemOf(campaign)
  if (link.kind === 'item') {
    const item = system.items.find((candidate) => candidate.id === link.id)
    return item
      ? [{
          label: me ? `Give to ${me.name}` : 'Choose a character',
          disabled: !canAct,
          onSelect: () => {
            if (me && canAct) addItem(campaign, me.id, item)
          },
        }]
      : []
  }
  if (link.kind === 'move') {
    const move = system.actions.find((candidate) => candidate.id === link.id)
    return move
      ? [{
          label: `Make ${move.name}`,
          disabled: !canAct,
          onSelect: () => {
            if (me && canAct) startMove(campaign, me.id, move)
          },
        }]
      : []
  }
  return []
}

export const linkKey = (l: LinkRef) => `${l.kind}:${l.id}`

/** Links with a pop-up open, oldest first. */
export const openLinks = signal<LinkRef[]>([])

/** Open a link's pop-up, growing out of its tooltip (or the link itself); bring it forward if it's open. */
export function showLink(link: LinkRef, from: Element) {
  const id = entityTabId(`link:${linkKey(link)}`)
  if (locate(layout.value, id) !== 'closed') {
    showPanel(id)
    return
  }
  const already = document.querySelector<HTMLElement>(`dialog[data-entry="${CSS.escape(`link:${linkKey(link)}`)}"]`)
  if (already) return raisePopup(already)
  const tip = document.querySelector('.tooltip:popover-open')
  morphOpen(tip ?? from, () => {
    hideTooltip()
    openLinks.value = [...openLinks.value, link]
  })
}

export function closeLink(link: LinkRef) {
  openLinks.value = openLinks.value.filter((l) => linkKey(l) !== linkKey(link))
}

/** A link's right-click menu, where it was opened. */
export const linkMenu = signal<{ x: number; y: number; items: MenuItem[] } | null>(null)

/** Renaming a link: its text now, and what saving does (null puts the target's own name back). */
export const linkRename = signal<{ n: number; text: string; custom: boolean; save: (text: string | null) => void } | null>(null)

let renames = 0
/** Ask to rename a link; each request gets its own pop-up. */
export function renameLink(req: { text: string; custom: boolean; save: (text: string | null) => void }) {
  linkRename.value = { ...req, n: ++renames }
}
