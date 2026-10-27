import type { ChoiceDef, CreationDef, DataValue, GameSystem, OptionDef, ScoreMethods } from '../systems/types'

/*
 * The rules of the guided creation and level-up flow, apart from its UI:
 * which choices come when, what a point-buy spends, and what a finished
 * draft writes to the character. The system supplies the options as data
 * (see CreationDef).
 */

/** The choices made at creation, or on reaching a level, for a class. */
export function choicesAt(creation: CreationDef | undefined, at: 'create' | number, classId: string): ChoiceDef[] {
  return (creation?.choices ?? [])
    .filter((c) => c.at === at)
    .map((c) => ({ ...c, options: c.options.filter((o) => !o.classId || o.classId === classId) }))
    .filter((c) => c.options.length > 0)
}

/** Points spent on a point-buy, or null if a score is outside what it can buy. */
export function pointsSpent(scores: Record<string, number>, buy: NonNullable<ScoreMethods['pointBuy']>): number | null {
  let total = 0
  for (const v of Object.values(scores)) {
    const cost = buy.costs[v]
    if (cost === undefined) return null
    total += cost
  }
  return total
}

/** Stat increases from an option's boost: the chosen pattern of amounts, given to the chosen stats in order. */
export function boostFrom(option: OptionDef | undefined, pattern: number, order: string[]): Record<string, number> {
  const amounts = option?.boost?.amounts[pattern]
  if (!option?.boost || !amounts) return {}
  const out: Record<string, number> = {}
  amounts.forEach((n, i) => {
    const stat = order[i]
    if (n && stat) out[stat] = (out[stat] ?? 0) + n
  })
  return out
}

/** The highest a stat can be raised to by creation and levelling. */
export const SCORE_CAP = 20

/** Scores plus increases, capped. */
export function raise(scores: Record<string, number>, by: Record<string, number>): Record<string, number> {
  const out = { ...scores }
  for (const [k, n] of Object.entries(by)) out[k] = Math.min(SCORE_CAP, (out[k] ?? 10) + n)
  return out
}

/** The data a set of chosen options writes: each choice's field, and each option's grants. A list field (feats) gathers. */
export function dataFrom(choices: ChoiceDef[], picked: Record<string, string>, listFields: string[] = []): Record<string, DataValue> {
  const out: Record<string, DataValue> = {}
  const add = (field: string, value: DataValue) => {
    if (listFields.includes(field) && out[field]) out[field] = `${out[field]},${value}`
    else out[field] = value
  }
  for (const c of choices) {
    const option = c.options.find((o) => o.id === picked[c.id])
    if (!option) continue
    add(c.field, option.id)
    for (const [k, v] of Object.entries(option.grants ?? {})) add(k, v)
  }
  return out
}

/** Every stat set to one value, for a system's stats. */
export const flatScores = (system: GameSystem, value: number) => Object.fromEntries(system.stats.map((s) => [s.id, value]))
