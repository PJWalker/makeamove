import type { Effect } from './types'

/*
 * The effect resolver. A character's effective values are the base values
 * plus every active effect, applied in a fixed order so they never depend on
 * which peer computed them: by priority band, and inside a band set, then
 * add, then multiply, then min and max. Each change records its source, so
 * the sheet can explain a number.
 */

export interface EffectSource {
  /** Who it comes from, for the explanation: "Chainmail", "Fighter". */
  name: string
  effects: Effect[]
}

export interface Resolved {
  values: Record<string, number>
  /** Per path, a line for each source that changed it. */
  why: Record<string, string[]>
  moves: string[]
  tags: string[]
  bonuses: { source: string; stat?: string; moves?: string[]; value: number }[]
}

const PHASE = { set: 0, add: 1, multiply: 2, min: 3, max: 3 } as const

export function resolveEffects(base: Record<string, number>, sources: EffectSource[]): Resolved {
  const values = { ...base }
  const why: Record<string, string[]> = {}
  const out: Resolved = { values, why, moves: [], tags: [], bonuses: [] }

  type Mod = Extract<Effect, { type: 'modify' }> & { from: string; order: number }
  const mods: Mod[] = []
  for (const s of sources) {
    for (const e of s.effects) {
      if (e.type === 'modify') mods.push({ ...e, from: s.name, order: mods.length })
      else if (e.type === 'grantMove') {
        if (!out.moves.includes(e.move)) out.moves.push(e.move)
      } else if (e.type === 'grantTag') {
        if (!out.tags.includes(e.tag)) out.tags.push(e.tag)
      } else out.bonuses.push({ source: s.name, stat: e.stat, moves: e.moves, value: e.value })
    }
  }

  mods.sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || PHASE[a.op] - PHASE[b.op] || a.order - b.order,
  )
  for (const m of mods) {
    const before = values[m.path] ?? 0
    let after = before
    switch (m.op) {
      case 'set':
        after = m.value
        break
      case 'add':
        after = before + m.value
        break
      case 'multiply':
        after = before * m.value
        break
      case 'min':
        after = Math.max(before, m.value)
        break
      case 'max':
        after = Math.min(before, m.value)
        break
    }
    values[m.path] = after
    if (after !== before) (why[m.path] ??= []).push(`${m.from}: ${before} → ${after}`)
  }
  return out
}
