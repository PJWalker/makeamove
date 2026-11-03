import type { Campaign } from '../store/campaign'
import { diceFormula } from '../chat/commands'
import { coreActions, rollAction } from './core'
import { systemActions } from './system'
import type { Action } from './types'

/*
 * Core and system providers supply the actions shown in the palette and hotbar.
 */

/** Gather every provider's actions. Cheap enough to redo whenever it's needed. */
export function buildIndex(campaign: Campaign): Action[] {
  const seen = new Set<string>()
  const out: Action[] = []
  for (const provider of [coreActions, systemActions]) {
    for (const a of provider(campaign)) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
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
