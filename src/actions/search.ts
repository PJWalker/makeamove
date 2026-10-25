import type { Action } from './types'

/*
 * Ranking for the command palette. Pure, so it's easy to test.
 */

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

const words = (s: string) => norm(s).split(/[^a-z0-9&]+/).filter(Boolean)

/** How well one query word matches one field: 0 for no match. */
function fieldScore(token: string, field: string): number {
  const f = norm(field)
  if (f === token) return 100
  if (f.startsWith(token)) return 80
  if (words(f).some((w) => w.startsWith(token))) return 60
  if (f.includes(token)) return 40
  // Letters in order ("hs" finds "Hack and Slash"), only for longer fields.
  if (token.length >= 2 && isSubsequence(token, f)) return 15
  return 0
}

function isSubsequence(token: string, text: string) {
  let i = 0
  for (const ch of text) if (ch === token[i] && ++i === token.length) return true
  return false
}

/** Score an action against a query; 0 means it doesn't match. */
export function scoreAction(a: Action, query: string): number {
  const tokens = words(query)
  if (!tokens.length) return 1
  let total = 0
  for (const token of tokens) {
    let best = fieldScore(token, a.title)
    for (const alias of a.aliases ?? []) best = Math.max(best, fieldScore(token, alias) - 5)
    for (const tag of a.tags ?? []) best = Math.max(best, fieldScore(token, tag) - 15)
    if (!best) return 0
    total += best
  }
  return total / tokens.length
}

type Narrow = (a: Action) => boolean

/** A leading character narrows the search to one sort of entry. */
const PREFIXES: Record<string, Narrow> = {
  '>': (a) => a.kind === 'command' || a.kind === 'tool' || a.kind === 'setting',
  '/': (a) => a.kind === 'move',
  '@': (a) => a.group === 'character',
  '#': (a) => a.group === 'note' || a.group === 'compendium',
}

export function splitPrefix(input: string): { narrow: Narrow | null; query: string } {
  const narrow = PREFIXES[input[0]] ?? null
  return { narrow, query: narrow ? input.slice(1) : input }
}

export interface RankOptions {
  /** Most recent first. */
  recent?: string[]
  limit?: number
}

export function rank(actions: Action[], input: string, { recent = [], limit = 40 }: RankOptions = {}): Action[] {
  const { narrow, query } = splitPrefix(input.trimStart())
  const pool = narrow ? actions.filter(narrow) : actions
  const typed = query.trim()

  if (!typed && !narrow) {
    // Nothing typed: recent actions, then the selected character's moves.
    const byId = new Map(actions.map((a) => [a.id, a]))
    const seen = new Set<string>()
    const out: Action[] = []
    for (const id of recent) {
      const a = byId.get(id)
      if (a && !seen.has(id)) {
        seen.add(id)
        out.push(a)
      }
    }
    for (const a of actions) if (a.mine && !seen.has(a.id)) out.push(a)
    return out.slice(0, limit)
  }

  const scored: { a: Action; s: number; i: number }[] = []
  pool.forEach((a, i) => {
    const base = typed ? scoreAction(a, typed) : 1
    if (!base) return
    let s = base
    if (a.mine) s += 15
    const r = recent.indexOf(a.id)
    if (r >= 0) s += Math.max(2, 12 - r)
    if (a.available !== true) s -= 30
    scored.push({ a, s, i })
  })
  // Stable: equal scores keep the order they were registered in.
  scored.sort((x, y) => y.s - x.s || x.i - y.i)
  return scored.slice(0, limit).map((x) => x.a)
}
