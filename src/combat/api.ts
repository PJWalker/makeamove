import { bumpResource, getCharacter, makeMove, setField, systemOf } from '../characters/api'
import { derive, type Duration } from '../characters/store'
import { myName } from '../chat/send'
import { roll } from '../dice/notation'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import {
  addCombatant,
  endCombat,
  nextTurn,
  roundOf,
  startCombat,
  tickDurations,
  turnOf,
  turnOrder,
  updateCombatant,
  type CombatMaps,
  type Combatant,
  type TurnChange,
} from './combat'

/*
 * The turn tracker as the table uses it: combatants from tokens, initiative
 * rolled through the system's own action, and turns that count down
 * conditions and refill per-turn resources on the characters.
 */

export const combatMaps = (campaign: Campaign): CombatMaps => ({ combat: campaign.combat, combatants: campaign.combatants })

/** Whether the campaign's system has initiative, and so a turn tracker. */
export const hasCombat = (campaign: Campaign) => !!systemOf(campaign).initiative

/** The combatant standing for a token, if it's in the fight. */
export function combatantForToken(campaign: Campaign, tokenId: string): string | undefined {
  for (const [id, c] of campaign.combatants.entries()) if (c.tokenId === tokenId) return id
  return undefined
}

/** Tie-breaker for a character: the system's initiative bonus. */
function tieOf(campaign: Campaign, characterId?: string): number {
  const c = getCharacter(campaign, characterId)
  return c ? (derive(c, systemOf(campaign)).values.initiative ?? 0) : 0
}

/** Put tokens into the fight (those already in it are skipped). NPCs join hidden. */
export function addTokens(campaign: Campaign, sceneId: string, tokens: { id: string; name: string; characterId?: string }[]) {
  const m = combatMaps(campaign)
  campaign.doc.transact(() => {
    for (const t of tokens) {
      if (combatantForToken(campaign, t.id)) continue
      const c = getCharacter(campaign, t.characterId)
      addCombatant(m, {
        name: t.name || c?.name || 'Unnamed',
        tokenId: t.id,
        sceneId,
        init: null,
        tie: tieOf(campaign, t.characterId),
        ...(t.characterId ? { characterId: t.characterId } : {}),
        ...(c?.kind === 'npc' || !c ? { hidden: true } : {}),
      })
    }
  })
}

/** Roll a combatant's initiative: their character's initiative action as a card, or the bare base roll. */
export async function rollInitiative(campaign: Campaign, id: string) {
  const system = systemOf(campaign)
  const who: Combatant | undefined = campaign.combatants.get(id)
  if (!who || !system.initiative) return
  const action = system.actions.find((a) => a.id === system.initiative)
  const c = getCharacter(campaign, who.characterId)
  let total: number
  if (c && action) {
    const m = await makeMove(campaign, c.id, action)
    total = m?.kind === 'move' ? (m.roll?.total ?? 0) : 0
  } else {
    // Unlinked tokens roll in secret, like the GM's other rolls for monsters.
    const r = roll(system.baseRoll)
    total = r.total
    await campaign.chat.post({ kind: 'roll', roll: r, visibility: 'private', comment: `${who.name}: Initiative` }, { id: device.value.id, name: myName(campaign) })
  }
  updateCombatant(combatMaps(campaign), id, { init: total })
}

/** Roll for everyone who hasn't rolled yet. */
export async function rollAllInitiative(campaign: Campaign, { npcsOnly = false } = {}) {
  for (const c of turnOrder(campaign.combatants)) {
    if (c.init !== null) continue
    const char = getCharacter(campaign, c.characterId)
    if (npcsOnly && char?.kind === 'pc') continue
    await rollInitiative(campaign, c.id)
  }
}

/** Count down durations for one point of a turn, on every character, removing conditions that ran out. */
function tick(campaign: Campaign, combatant: string | null, point: 'start' | 'end') {
  if (!combatant) return
  for (const [id, m] of campaign.characters.entries()) {
    const durations = m.get('durations') as Record<string, Duration> | undefined
    if (!durations || !Object.keys(durations).length) continue
    const { left, expired } = tickDurations(durations, combatant, point)
    if (!expired.length && JSON.stringify(left) === JSON.stringify(durations)) continue
    m.set('durations', left)
    if (expired.length) {
      const now = getCharacter(campaign, id)?.conditions ?? []
      m.set('conditions', now.filter((x) => !expired.includes(x)))
    }
  }
}

/** Refill the resources that reset each turn, for the combatant whose turn it now is. */
function startTurn(campaign: Campaign, combatant: string | null) {
  const who: Combatant | undefined = combatant ? campaign.combatants.get(combatant) : undefined
  const c = getCharacter(campaign, who?.characterId)
  if (!c) return
  const system = systemOf(campaign)
  const d = derive(c, system)
  for (const r of system.resources) if (r.resets?.includes('turn')) bumpResource(campaign, c.id, r.id, (d.values[r.max] ?? 0) - (c.resources[r.id] ?? 0), d.values[r.max])
}

function applyChange(campaign: Campaign, change: TurnChange) {
  campaign.doc.transact(() => {
    tick(campaign, change.ended, 'end')
    tick(campaign, change.started, 'start')
    startTurn(campaign, change.started)
  })
  if (change.newRound) {
    void campaign.chat.post({ kind: 'system', text: `Round ${roundOf(combatMaps(campaign))}` }, { id: device.value.id, name: myName(campaign) })
  }
}

export function beginCombat(campaign: Campaign) {
  applyChange(campaign, startCombat(combatMaps(campaign)))
}

export function advanceTurn(campaign: Campaign) {
  applyChange(campaign, nextTurn(combatMaps(campaign)))
}

/** End the fight; timed conditions stay, without their timers. */
export function finishCombat(campaign: Campaign) {
  campaign.doc.transact(() => {
    for (const m of campaign.characters.values()) if (m.get('durations')) m.delete('durations')
    endCombat(combatMaps(campaign))
  })
}

/** Give a character a condition that lasts so many rounds, counted down on a combatant's turn; or with null, until removed. */
export function setDuration(campaign: Campaign, characterId: string, condition: string, duration: Duration | null) {
  const m = campaign.characters.get(characterId)
  if (!m) return
  const now: Record<string, Duration> = { ...(m.get('durations') ?? {}) }
  if (duration) now[condition] = duration
  else delete now[condition]
  m.set('durations', now)
}

/** Stop concentrating. */
export function endConcentration(campaign: Campaign, characterId: string) {
  setField(campaign, characterId, 'concentration', undefined)
}

/** Pip colours for conditions, by their order in the system's list. */
const PIP_COLOURS = ['#e0614f', '#e3a23b', '#d9d24a', '#6cc070', '#4fb3c9', '#6d8fe8', '#a879e0', '#d46fb0']
const CONCENTRATION_PIP = '#ffffff'

/**
 * What each token shows of the fight: a pip per condition (and one for
 * concentration) on a linked token, and a ring on the token whose turn it
 * is. Built from the campaign as it is now; make a new one when it changes.
 */
export function tokenMarksSource(campaign: Campaign) {
  const system = systemOf(campaign)
  const turn = turnOf(combatMaps(campaign))
  const turnToken: string | undefined = turn ? campaign.combatants.get(turn)?.tokenId : undefined
  const pips = new Map<string, string[]>()
  return (tokenId: string, characterId?: string) => {
    let p = characterId ? pips.get(characterId) : []
    if (!p && characterId) {
      const c = getCharacter(campaign, characterId)
      p = (c?.conditions ?? []).map((id) => PIP_COLOURS[Math.max(0, system.conditions.findIndex((k) => k.id === id)) % PIP_COLOURS.length])
      if (c?.concentration) p.push(CONCENTRATION_PIP)
      pips.set(characterId, p)
    }
    return { pips: p ?? [], turn: tokenId === turnToken }
  }
}
