import { appliedField, getState, saveField, setState, type SaveAnswer } from '../chat/messageState'
import { myName } from '../chat/send'
import type { MoveTarget, SaveRequest } from '../chat/types'
import { describe, roll } from '../dice/notation'
import type { Campaign } from '../../campaign/campaign'
import { device } from '../../platform/device'
import { bumpResource, canEdit, getCharacter, setData, setField, systemOf, updateItem } from './api'
import { planMove, resolveDifficulty, rollModesFor } from './moves'
import { derive } from './store'
import type { CharacterView } from './types'

/*
 * What happens on a card after it's posted: targets
 * answering roll requests, the GM applying damage or healing, and the
 * concentration save that damage calls for. Each is recorded in the
 * campaign's message state, so the card shows what was done.
 */

/** Whether this device may answer a roll request for a target: its owner, or the GM. Unlinked tokens are the GM's. */
export function canAnswer(campaign: Campaign, t: MoveTarget): boolean {
  if (campaign.isGm()) return true
  const c = getCharacter(campaign, t.characterId)
  return !!c && canEdit(campaign, c)
}

/**
 * Answer a move card's roll request for one target: roll the requested
 * action as the target's character (or the bare base roll for an unlinked
 * token), and record the total against the DC on the card.
 */
export function answerSave(campaign: Campaign, messageId: string, t: MoveTarget, save: SaveRequest, mode?: string, concentration?: boolean) {
  if (!canAnswer(campaign, t) || getState(campaign.messageState, messageId, saveField(t.id))) return
  const system = systemOf(campaign)
  const action = system.actions.find((a) => a.id === save.action)
  const c = getCharacter(campaign, t.characterId)
  const formula =
    c && action ? planMove(system, action, c, derive(c, system), { mode }).formula : (action ? rollModesFor(system, action).find((m) => m.id === mode)?.roll : undefined) ?? system.baseRoll
  const r = roll(formula)
  const answer: SaveAnswer = { total: r.total, detail: describe(r), success: r.total >= save.difficulty, by: device.value.id }
  campaign.doc.transact(() => {
    setState(campaign.messageState, messageId, saveField(t.id), answer)
    // A failed concentration save ends the spell.
    if (concentration && !answer.success && c) setField(campaign, c.id, 'concentration', undefined)
  })
}

/**
 * Apply damage (or healing) from a card to a target's character: temporary
 * HP soak damage first, then hit points, never below zero or above the
 * maximum. Recorded on the card, so it shows what was done.
 */
export function applyDamage(campaign: Campaign, messageId: string, t: MoveTarget, amount: number, healing: boolean, options: { armor?: boolean; type?: string; shieldItemId?: string } = {}) {
  if (!campaign.isGm() || !Number.isFinite(amount) || amount < 0 || getState(campaign.messageState, messageId, appliedField(t.id)) !== undefined) return
  const system = systemOf(campaign)
  const c = getCharacter(campaign, t.characterId)
  if (!c) return
  const shield = options.shieldItemId
    ? c.inventory.find((item) => item.id === options.shieldItemId && item.equipped && item.resetUsesAtCamp && (item.usesLeft ?? 0) > 0)
    : undefined;
  if (
    options.shieldItemId &&
    (!shield || healing || options.type?.toLowerCase() === "piercing" || system.id !== "dungeon-world-2")
  ) return;
  const derived = derive(c, system)
  const max = derived.values[system.resources.find((r) => r.id === 'hp')?.max ?? 'maxHp']
  const damage = shield
    ? { hp: 0 }
    : !healing && system.resolveDamage
      ? system.resolveDamage(c, derived, amount, options)
      : { hp: amount }
  if (damage.resources?.some(({ id, by }) => (c.resources[id] ?? 0) + by < 0)) return
  const hpBefore = c.resources.hp ?? 0
  campaign.doc.transact(() => {
    if (healing) bumpResource(campaign, c.id, 'hp', amount, max)
    else {
      if (shield) updateItem(campaign, c.id, shield.id, { usesLeft: (shield.usesLeft ?? 1) - 1 })
      let left = damage.hp
      if (system.tempHp) {
        const temp = Number(c.data[system.tempHp] ?? 0)
        const soaked = Math.min(temp, left)
        if (soaked) setData(campaign, c.id, system.tempHp, temp - soaked)
        left -= soaked
      }
      if (left) bumpResource(campaign, c.id, 'hp', -left)
      for (const { id, by } of damage.resources ?? []) {
        const resource = system.resources.find((candidate) => candidate.id === id)
        if (resource) bumpResource(campaign, c.id, id, by, derived.values[resource.max])
      }
    }
    setState(campaign.messageState, messageId, appliedField(t.id), (getCharacter(campaign, c.id)?.resources.hp ?? hpBefore) - hpBefore)
  })
  if (!healing && damage.hp > 0) checkConcentration(campaign, c, damage.hp)
}

/** A concentrating character who takes damage is asked for the system's concentration save, on a card of its own. */
function checkConcentration(campaign: Campaign, c: CharacterView, damage: number) {
  const system = systemOf(campaign)
  if (!c.concentration || !system.concentrationSave) return
  const { action, difficulty } = system.concentrationSave(damage)
  const spell = system.actions.find((a) => a.id === c.concentration)?.name ?? 'a spell'
  void campaign.chat.post(
    {
      kind: 'move',
      moveId: 'concentration',
      moveName: 'Concentration',
      trigger: `Concentrating on ${spell}`,
      characterId: c.id,
      characterName: c.name,
      targets: [{ id: c.id, name: c.name, characterId: c.id }],
      outcome: `${c.name} took ${damage} damage while concentrating on ${spell}.`,
      suggestions: [],
      save: {
        action,
        name: system.actions.find((a) => a.id === action)?.name ?? action,
        difficulty: resolveDifficulty(difficulty, derive(c, system)) ?? 0,
        success: 'Concentration holds.',
        failure: `${spell} ends.`,
      },
      concentration: true,
    },
    { id: device.value.id, name: myName(campaign) },
  )
}
