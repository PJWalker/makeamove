import { appliedField, getState, saveField, setState, type SaveAnswer } from '../chat/messageState'
import { myName } from '../chat/send'
import type { MoveTarget, SaveRequest } from '../chat/types'
import { describe, roll } from '../dice/notation'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { bumpResource, canEdit, getCharacter, setData, setField, systemOf } from './api'
import { planMove } from './moves'
import { derive, type CharacterView } from './store'

/*
 * What happens on a card after it's posted (design: core change 9): targets
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
  const system = systemOf(campaign)
  const action = system.actions.find((a) => a.id === save.action)
  const c = getCharacter(campaign, t.characterId)
  const formula =
    c && action ? planMove(system, action, c, derive(c, system), { mode }).formula : (system.rollModes?.find((m) => m.id === mode)?.roll ?? system.baseRoll)
  const r = roll(formula)
  const answer: SaveAnswer = { total: r.total, detail: describe(r), success: r.total >= save.dc, by: device.value.id }
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
export function applyDamage(campaign: Campaign, messageId: string, t: MoveTarget, amount: number, healing: boolean) {
  const system = systemOf(campaign)
  const c = getCharacter(campaign, t.characterId)
  if (!c) return
  const max = derive(c, system).values[system.resources.find((r) => r.id === 'hp')?.max ?? 'maxHp']
  campaign.doc.transact(() => {
    if (healing) bumpResource(campaign, c.id, 'hp', amount, max)
    else {
      let left = amount
      if (system.tempHp) {
        const temp = Number(c.data[system.tempHp] ?? 0)
        const soaked = Math.min(temp, left)
        if (soaked) setData(campaign, c.id, system.tempHp, temp - soaked)
        left -= soaked
      }
      if (left) bumpResource(campaign, c.id, 'hp', -left)
    }
    const before = getState<number>(campaign.messageState, messageId, appliedField(t.id)) ?? 0
    setState(campaign.messageState, messageId, appliedField(t.id), before + (healing ? amount : -amount))
  })
  if (!healing && amount > 0) checkConcentration(campaign, c, amount)
}

/** A concentrating character who takes damage is asked for the system's concentration save, on a card of its own. */
function checkConcentration(campaign: Campaign, c: CharacterView, damage: number) {
  const system = systemOf(campaign)
  if (!c.concentration || !system.concentrationSave) return
  const { action, dc } = system.concentrationSave(damage)
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
        dc,
        success: 'Concentration holds.',
        failure: `${spell} ends.`,
      },
      concentration: true,
    },
    { id: device.value.id, name: myName(campaign) },
  )
}
