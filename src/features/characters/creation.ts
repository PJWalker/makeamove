import type { DataValue } from '../../core/types'
import type { ChoiceDef, CreationDef, GameSystem, OptionDef, ScoreMethods } from '../../systems/types'
import { parseCommaList } from '../../lib/list'

/*
 * The rules of the guided creation and advancement flow, apart from its UI:
 * which choices come when, what a point-buy spends, and what a finished
 * draft writes to the character. The system supplies the options as data
 * (see CreationDef).
 */

/** Choices available at creation or a system-defined advancement point. */
export function choicesAt(creation: CreationDef | undefined, at: 'create' | number, data: Record<string, DataValue> = {}, scores: Record<string, number> = {}): ChoiceDef[] {
  return (creation?.choices ?? [])
    .filter((c) => c.at === at || c.at === 'advance' && typeof at === 'number')
    .map((c) => ({
      ...c,
      options: c.options.filter((o) =>
        Object.entries(o.requires ?? {}).every(
          ([field, value]) => data[field] === value,
        ) && (!o.requiresAny || o.requiresAny.some((requirements) =>
          Object.entries(requirements).every(([field, value]) => data[field] === value),
        )) && Object.entries(o.notRequires ?? {}).every(([field, value]) => data[field] !== value) &&
        (o.requiresFilled ?? []).every((field) => !!data[field]) &&
        (!o.requiresScoreBelow || (scores[o.requiresScoreBelow.stat] ?? 0) < o.requiresScoreBelow.value) &&
        (o.limits ?? []).every(({ field, prefix, max }) => parseCommaList(String(data[field] ?? '')).filter((value) => value && (!prefix || value.startsWith(prefix))).length < max) &&
        (o.requiresIncludes ?? []).every(({ field, value }) => parseCommaList(String(data[field] ?? '')).includes(value)) &&
        (o.notIncludes ?? []).every(({ field, value }) => !parseCommaList(String(data[field] ?? '')).includes(value)),
      ),
    }))
    .filter((c) => c.options.length > 0);
}

export function previewChoices(creation: CreationDef | undefined, at: 'create' | number, data: Record<string, DataValue>, scores: Record<string, number>, picked: Record<string, string>): ChoiceDef[] {
  const before = choicesAt(creation, at, data, scores)
  const preview = { ...data }
  for (const choice of before) {
    const option = choice.options.find((entry) => entry.id === picked[choice.id])
    if (option) Object.assign(preview, option.grants)
  }
  const after = choicesAt(creation, at, preview, scores)
  return before.map((choice) => {
    const updated = after.find((entry) => entry.id === choice.id) ?? { ...choice, options: [] }
    const selected = choice.options.find((entry) => entry.id === picked[choice.id])
    return selected && !updated.options.some((entry) => entry.id === selected.id) ? { ...updated, options: [...updated.options, selected] } : updated
  }).filter((choice) => choice.options.length > 0)
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

export function validBoost(option: OptionDef | undefined, pattern: number, order: string[], scores: Record<string, number>, caps: Record<string, number>, blocked: string[] = []): boolean {
  if (!option?.boost) return !!option
  const amounts = option.boost.amounts[pattern]
  if (!amounts) return false
  const picked = order.filter((_, index) => (amounts[index] ?? 0) > 0)
  return new Set(picked).size === picked.length && amounts.every((amount, index) => {
    if (!amount) return true;
    const stat = order[index];
    return !!stat && option.boost!.stats.includes(stat) && !blocked.includes(stat) && (scores[stat] ?? 0) < (caps[stat] ?? SCORE_CAP);
  })
}

/** The highest a stat can be raised to by creation and levelling. */
export const SCORE_CAP = 20

/** Scores plus increases, capped. */
export function raise(scores: Record<string, number>, by: Record<string, number>, caps: Record<string, number> = {}): Record<string, number> {
  const out = { ...scores }
  for (const [k, n] of Object.entries(by)) out[k] = Math.min(caps[k] ?? SCORE_CAP, (out[k] ?? 10) + n)
  return out
}

/** The data a set of chosen options writes: each choice's field, and each option's grants. A list field (feats) gathers. */
export function dataFrom(choices: ChoiceDef[], picked: Record<string, string>, listFields: string[] = [], previous: Record<string, DataValue> = {}): Record<string, DataValue> {
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
    for (const change of option.dataBoost ?? []) out[change.field] = Number(out[change.field] ?? previous[change.field] ?? 0) + change.by
  }
  return out
}

/** Every stat set to one value, for a system's stats. */
export const flatScores = (system: GameSystem, value: number) => Object.fromEntries(system.stats.map((s) => [s.id, value]))
