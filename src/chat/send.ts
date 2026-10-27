import { roll } from '../dice/notation'
import { makeSessionPage } from '../notes/sessions'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import type { Command } from './commands'
import type { RollMessage, RollVisibility } from './types'

/** This device's name in the campaign, as other players see it. */
export function myName(campaign: Campaign): string {
  return campaign.members.get(device.value.id)?.get('name') ?? (device.value.name || 'Player')
}

const me = (campaign: Campaign) => ({ id: device.value.id, name: myName(campaign) })

/** Roll a formula and post the result. Throws NotationError for bad formulas. */
export function postRoll(campaign: Campaign, formula: string, visibility: RollVisibility, comment?: string, damage?: RollMessage['damage']) {
  const r = roll(formula)
  return campaign.chat.post({ kind: 'roll', roll: r, visibility, ...(comment ? { comment } : {}), ...(damage ? { damage } : {}) }, me(campaign))
}

/**
 * Carry out a chat command. Returns false for commands that only show
 * something locally (help, errors), which the panel handles itself.
 */
export function runCommand(campaign: Campaign, cmd: Command): boolean {
  const author = me(campaign)
  switch (cmd.kind) {
    case 'text':
      if (cmd.text) campaign.chat.post({ kind: 'text', text: cmd.text }, author)
      return true
    case 'emote':
      campaign.chat.post({ kind: 'text', text: cmd.text, emote: true }, author)
      return true
    case 'whisper':
      campaign.chat.post(
        { kind: 'text', text: cmd.text, to: cmd.to.map((m) => m.id), toNames: cmd.to.map((m) => m.name) },
        author,
      )
      return true
    case 'roll':
      postRoll(campaign, cmd.formula, cmd.visibility, cmd.comment)
      return true
    case 'session': {
      // Sessions are numbered in the campaign itself, so every peer agrees.
      const count: number = campaign.meta.get('sessions') ?? 0
      const session = cmd.action === 'start' ? count + 1 : count
      if (cmd.action === 'start') campaign.meta.set('sessions', session)
      campaign.chat.post(
        {
          kind: 'system',
          text: cmd.action === 'start' ? `Session ${session} begins` : `Session ${session} ends`,
          event: cmd.action === 'start' ? 'session-start' : 'session-end',
          session,
        },
        author,
      )
      // Its page in the Sessions folder, ready for notes.
      if (cmd.action === 'start') void makeSessionPage(campaign, session)
      return true
    }
    default:
      return false
  }
}
