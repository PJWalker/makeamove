import {
  getCharacter,
  listCharacters,
  selectCharacter,
  selectedCharacterId,
  startMove,
  systemOf,
  addItem,
  canEdit,
  updateItem,
  rest,
} from '../characters/api'
import { actionsFor, derive } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { browseLibrary } from '../table/libraryView'
import { showPanel } from '../table/panelLayout'
import type { Action } from './types'

export function systemActions(campaign: Campaign): Action[] {
  const system = systemOf(campaign)
  const out: Action[] = []
  const selectedId = selectedCharacterId(campaign)
  const me = getCharacter(campaign, selectedId)
  const mine = me ? new Set(actionsFor(me, system, derive(me, system)).map((m) => m.id)) : new Set<string>()
  const reason = !me ? 'Choose a character first' : canEdit(campaign, me) ? true : 'Not your character'

  for (const m of system.actions) {
    const ownsIt = mine.has(m.id)
    out.push({
      id: `move:${m.id}`,
      kind: 'move',
      title: m.name,
      aliases: ['move'],
      tags: m.tags,
      source: system.name,
      detail: m.trigger,
      mine: ownsIt,
      available: reason !== true ? reason : ownsIt ? true : 'Not one of this character’s moves',
      run: () => me && startMove(campaign, me.id, m),
    })
  }

  for (const c of listCharacters(campaign)) {
    out.push({
      id: `character:${c.id}`,
      kind: 'entry',
      group: 'character',
      title: c.name,
      source: 'Characters',
      detail: c.kind === 'npc' ? 'NPC' : system.classes.find((k) => k.id === c.classId)?.name,
      available: true,
      run: () => {
        selectCharacter(campaign, c.id)
        showPanel('characters')
      },
    })
  }

  // Rests, for systems whose resources refill on them.
  const rests = new Set(system.resources.flatMap((r) => r.resets ?? []))
  for (const [event, title] of [
    ['short-rest', 'Short Rest'],
    ['long-rest', 'Long Rest'],
  ] as const) {
    if (!rests.has(event)) continue
    out.push({
      id: `rest:${event}`,
      kind: 'command',
      title,
      aliases: ['rest'],
      source: me?.name ?? system.name,
      detail: me ? `Refill ${me.name}’s resources` : undefined,
      mine: !!me,
      available: reason,
      run: () => me && rest(campaign, me.id, event),
    })
  }

  if (me) {
    for (const i of me.inventory) {
      if (i.uses !== undefined) {
        out.push({
          id: `use:${i.id}`,
          kind: 'item',
          title: `Use ${i.name}`,
          source: me.name,
          detail: `${i.usesLeft}/${i.uses} uses left`,
          mine: true,
          available: !i.usesLeft ? 'No uses left' : reason,
          run: () => updateItem(campaign, me.id, i.id, { usesLeft: Math.max(0, (i.usesLeft ?? 0) - 1) }),
        })
      }
      if (i.equippable) {
        out.push({
          id: `equip:${i.id}`,
          kind: 'item',
          title: `${i.equipped ? 'Unequip' : 'Equip'} ${i.name}`,
          source: me.name,
          mine: true,
          available: reason,
          run: () => updateItem(campaign, me.id, i.id, { equipped: !i.equipped }),
        })
      }
    }
  }

  for (const i of system.items) {
    out.push({
      id: `library:${i.id}`,
      kind: 'entry',
      group: 'library',
      title: i.name,
      tags: i.tags,
      source: system.name,
      detail: me ? `Add to ${me.name}’s inventory. Shift+Enter shows it in the Libraries.` : i.description,
      available: reason,
      run: () => me && addItem(campaign, me.id, i),
      open: () => browseLibrary('item'),
    })
  }

  return out
}
