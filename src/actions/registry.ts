import type { Campaign } from '../store/campaign'
import { diceFormula } from '../chat/commands'
import { coreActions, rollAction } from './core'
import { systemActions } from './system'
import type { Action } from './types'

/*
 * Sources of actions. Core is always there; the game system and the selected
 * character add theirs by registering a provider (see systems/).
 */

export type ActionProvider = (campaign: Campaign) => Action[]

const providers: ActionProvider[] = [coreActions, systemActions]

export function registerProvider(p: ActionProvider) {
  if (!providers.includes(p)) providers.push(p)
  return () => {
    const i = providers.indexOf(p)
    if (i >= 0) providers.splice(i, 1)
  }
}

/** Gather every provider's actions. Cheap enough to redo whenever it's needed. */
export function buildIndex(campaign: Campaign): Action[] {
  const seen = new Set<string>()
  const out: Action[] = []
  for (const p of providers) {
    for (const a of p(campaign)) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      out.push(a)
    }
  }
  return out
}

/** A formula typed in the palette and pinned: not in the index, its `roll:` id says what to roll. */
export function pinnedRoll(campaign: Campaign, id: string): Action | undefined {
  if (!id.startsWith('roll:')) return undefined
  const formula = diceFormula(id.slice('roll:'.length))
  return formula ? rollAction(campaign, formula) : undefined
}

/** Look one up by id, as the hotbar and keyboard shortcuts do. */
export function findAction(campaign: Campaign, id: string): Action | undefined {
  return buildIndex(campaign).find((a) => a.id === id) ?? pinnedRoll(campaign, id)
}
