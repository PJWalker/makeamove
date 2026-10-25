import { NotationError, parse } from '../dice/notation'
import type { RollVisibility } from './types'

/*
 * What the chat box understands. Plain text is a message; a leading slash is
 * a command. `//text` sends text that starts with a slash.
 */

export interface MemberRef {
  id: string
  name: string
  role: string
}

export type Command =
  | { kind: 'text'; text: string }
  | { kind: 'emote'; text: string }
  | { kind: 'whisper'; to: MemberRef[]; text: string }
  | { kind: 'roll'; formula: string; comment?: string; visibility: RollVisibility }
  | { kind: 'session'; action: 'start' | 'end' }
  | { kind: 'help' }
  | { kind: 'error'; message: string }

export interface CommandInfo {
  names: string[]
  usage: string
  help: string
  gmOnly?: boolean
}

export const COMMANDS: CommandInfo[] = [
  { names: ['r', 'roll'], usage: '/r 2d6+1 note', help: 'Roll for everyone to see' },
  { names: ['sr'], usage: '/sr 2d6+1 note', help: 'Secret roll: only you and the GM see it' },
  { names: ['w', 'whisper'], usage: '/w name message', help: 'Whisper to one person (or “gm”)' },
  { names: ['me'], usage: '/me draws her sword', help: 'Describe what you do' },
  { names: ['session'], usage: '/session start | end', help: 'Mark the start or end of a session', gmOnly: true },
  { names: ['help', '?'], usage: '/help', help: 'List these commands' },
]

/** Commands whose names start with what's typed so far, for the hint list. */
export function suggest(input: string, isGm: boolean): CommandInfo[] {
  const m = /^\/(\S*)$/.exec(input)
  if (!m) return []
  const typed = m[1].toLowerCase()
  return COMMANDS.filter((c) => (isGm || !c.gmOnly) && c.names.some((n) => n.startsWith(typed)))
}

/** Split "2d6+1 [STR] hack and slash" into the longest formula that parses and the rest. */
export function splitFormula(rest: string): { formula: string; comment?: string } | { error: string } {
  const text = rest.trim()
  if (!text) return { error: 'Add some dice, like /r 2d6+1.' }
  let firstError = ''
  // Try every whitespace boundary, longest first.
  const cuts = [text.length]
  for (let i = text.length - 1; i > 0; i--) if (/\s/.test(text[i]) && !/\s/.test(text[i - 1])) cuts.push(i)
  for (const cut of cuts) {
    const formula = text.slice(0, cut).trim()
    try {
      parse(formula)
      const comment = text.slice(cut).trim()
      return comment ? { formula, comment } : { formula }
    } catch (e) {
      if (!firstError && e instanceof NotationError) firstError = e.message
    }
  }
  return { error: firstError || 'Those dice don’t make sense.' }
}

/** Whoever `rest` starts with: the longest matching member name, or "gm". */
function whisperTarget(rest: string, members: MemberRef[]): { to: MemberRef[]; text: string } | null {
  const lower = rest.toLowerCase()
  const byName = [...members].sort((a, b) => b.name.length - a.name.length)
  for (const m of byName) {
    const name = m.name.toLowerCase()
    if (name && lower.startsWith(name) && (lower.length === name.length || /\s/.test(lower[name.length]))) {
      return { to: [m], text: rest.slice(name.length).trim() }
    }
  }
  if (/^gm(\s|$)/.test(lower)) {
    const gms = members.filter((m) => m.role === 'gm')
    if (gms.length) return { to: gms, text: rest.slice(2).trim() }
  }
  return null
}

export function parseCommand(input: string, members: MemberRef[], isGm: boolean): Command {
  const text = input.trim()
  if (!text.startsWith('/')) return { kind: 'text', text }
  if (text.startsWith('//')) return { kind: 'text', text: text.slice(1) }

  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text)!
  const name = m[1].toLowerCase()
  const rest = m[2]
  const cmd = COMMANDS.find((c) => c.names.includes(name))
  if (!cmd || (cmd.gmOnly && !isGm)) return { kind: 'error', message: `There’s no /${name} command. Try /help.` }

  switch (cmd.names[0]) {
    case 'r':
    case 'sr': {
      const split = splitFormula(rest)
      if ('error' in split) return { kind: 'error', message: split.error }
      const visibility: RollVisibility = cmd.names[0] === 'r' ? 'public' : 'private'
      return { kind: 'roll', ...split, visibility }
    }
    case 'w': {
      if (!rest.trim()) return { kind: 'error', message: 'Whisper to whom? Try /w name message.' }
      const target = whisperTarget(rest, members)
      if (!target) return { kind: 'error', message: `No one here is called “${rest.split(/\s/)[0]}”.` }
      if (!target.text) return { kind: 'error', message: `What do you want to whisper to ${target.to[0].name}?` }
      return { kind: 'whisper', ...target }
    }
    case 'me':
      return rest.trim() ? { kind: 'emote', text: rest.trim() } : { kind: 'error', message: 'Describe what you do: /me …' }
    case 'session': {
      const action = rest.trim().toLowerCase()
      if (action === 'start' || action === 'end') return { kind: 'session', action }
      return { kind: 'error', message: 'Use /session start or /session end.' }
    }
    default:
      return { kind: 'help' }
  }
}
