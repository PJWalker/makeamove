import { NotationError, parse } from '../dice/notation'
import type { RollVisibility } from './types'

/*
 * What the chat box understands. Plain text is a message; a leading slash is
 * a command. `//text` sends text that starts with a slash. A message that is
 * nothing but a dice formula, like `2d6+1`, rolls it.
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
  | { kind: 'pin'; text: string }
  | { kind: 'timer'; seconds: number; label: string }
  | { kind: 'counter'; start: number; max?: number; label: string }
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
  { names: ['pin'], usage: '/pin message', help: 'Send a message and pin it' },
  { names: ['timer'], usage: '/timer 60s World ends', help: 'A pinned countdown, in seconds (s), minutes (m) or hours (h)' },
  { names: ['count', 'counter'], usage: '/count 0/8 The cops arrive', help: 'A pinned counter to move by hand' },
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

/** The text as a formula, if all of it is one with at least one die in it ("3" alone stays a message). */
export function diceFormula(text: string): string | null {
  const formula = text.trim()
  if (!formula || !/d/i.test(formula)) return null
  try {
    return parse(formula).some((t) => t.kind === 'dice') ? formula : null
  } catch {
    return null
  }
}

/** A duration like 90, 90s, 5m, 1h30m or 2:30, in seconds; null if it isn't one. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  const clock = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(t)
  if (clock) return clock[3] !== undefined ? +clock[1] * 3600 + +clock[2] * 60 + +clock[3] : +clock[1] * 60 + +clock[2]
  if (/^\d+$/.test(t)) return +t
  const parts = /^(?:(\d+)h)?\s*(?:(\d+)m(?:in)?)?\s*(?:(\d+)s(?:ec)?)?$/.exec(t)
  if (!parts || !(parts[1] || parts[2] || parts[3])) return null
  return (+(parts[1] ?? 0)) * 3600 + (+(parts[2] ?? 0)) * 60 + +(parts[3] ?? 0)
}

/** A label, without the quotes it may be typed in. */
const unquote = (s: string) => s.trim().replace(/^["“'](.*)["”']$/s, '$1').trim()

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
  if (!text.startsWith('/')) {
    const formula = diceFormula(text)
    return formula ? { kind: 'roll', formula, visibility: 'public' } : { kind: 'text', text }
  }
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
    case 'pin':
      return rest.trim() ? { kind: 'pin', text: rest.trim() } : { kind: 'error', message: 'What should the pinned message say? /pin …' }
    case 'timer': {
      const [first = '', ...words] = rest.trim().split(/\s+/)
      const seconds = parseDuration(first)
      if (!seconds) return { kind: 'error', message: 'How long? Try /timer 60s World ends.' }
      if (seconds > 24 * 3600) return { kind: 'error', message: 'Timers run for a day at most.' }
      return { kind: 'timer', seconds, label: unquote(words.join(' ')) }
    }
    case 'count': {
      const m = /^(-?\d+)(?:\s*\/\s*(\d+))?\s*([\s\S]*)$/.exec(rest.trim())
      if (!m) return { kind: 'error', message: 'Start where? Try /count 0/8 The cops arrive.' }
      const max = m[2] !== undefined ? +m[2] : undefined
      if (max !== undefined && max < 1) return { kind: 'error', message: 'Count up to 1 or more.' }
      return { kind: 'counter', start: +m[1], ...(max !== undefined ? { max } : {}), label: unquote(m[3]) }
    }
    case 'session': {
      const action = rest.trim().toLowerCase()
      if (action === 'start' || action === 'end') return { kind: 'session', action }
      return { kind: 'error', message: 'Use /session start or /session end.' }
    }
    default:
      return { kind: 'help' }
  }
}
