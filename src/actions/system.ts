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
} from '../characters/api'
import { derive, movesFor } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { showPanel } from '../table/panelLayout'
import type { Action } from './types'

/** Moves, characters, gear and the compendium: what the game system adds. */
export function systemActions(campaign: Campaign): Action[] {
  const system = systemOf(campaign)
  const out: Action[] = []
  const selectedId = selectedCharacterId(campaign)
  const me = getCharacter(campaign, selectedId)
  const mine = me ? new Set(movesFor(me, system, derive(me, system)).map((m) => m.id)) : new Set<string>()
  const reason = !me ? 'Choose a character first' : canEdit(campaign, me) ? true : 'Not your character'

  for (const m of system.moves) {
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
      id: `compendium:${i.id}`,
      kind: 'entry',
      group: 'compendium',
      title: i.name,
      tags: i.tags,
      source: 'Compendium',
      detail: me ? `Add to ${me.name}’s gear. Shift+Enter shows the entry.` : i.description,
      available: reason,
      run: () => me && addItem(campaign, me.id, i),
      open: () => showPanel('items'),
    })
  }

  return out
}
