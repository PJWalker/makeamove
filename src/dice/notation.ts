/*
 * Dice notation: a small parser and roller for the usual tabletop syntax.
 *
 *   2d6+2         dice plus a flat modifier
 *   d8+d4         several dice terms
 *   4d6kh3        keep the highest 3 (k3 and b3, "best of", mean the same)
 *   2d20kl1       keep the lowest 1 (w1, "worst of", too)
 *   4d6dl1        drop the lowest 1 (dh drops the highest)
 *   d6!           exploding: a die showing its maximum rolls again
 *   d%            a hundred-sided die
 *   2d6+2[STR]    a label on any term, shown on the roll card
 *
 * Rolling never depends on anything but the random source, so the result
 * can be recorded once and replayed (as an animation) by every peer.
 */

export interface DiceTerm {
  kind: 'dice'
  sign: 1 | -1
  count: number
  sides: number
  keep?: { which: 'high' | 'low'; n: number }
  drop?: { which: 'high' | 'low'; n: number }
  explode?: boolean
  label?: string
}

export interface FlatTerm {
  kind: 'flat'
  sign: 1 | -1
  value: number
  label?: string
}

export type Term = DiceTerm | FlatTerm

export interface Die {
  sides: number
  value: number
  /** Counts towards the total (not dropped by keep or drop). */
  kept: boolean
  /** Rolled because the die before it exploded. */
  exploded?: boolean
}

export interface RolledDice {
  kind: 'dice'
  sign: 1 | -1
  notation: string
  label?: string
  dice: Die[]
  subtotal: number
}

export interface RolledFlat {
  kind: 'flat'
  sign: 1 | -1
  value: number
  label?: string
}

export interface Roll {
  formula: string
  terms: (RolledDice | RolledFlat)[]
  total: number
}

export const MAX_DICE = 100
export const MAX_SIDES = 1000
/** Explosions stop after this many extra dice per term, so d1! can't run away. */
export const MAX_EXPLOSIONS = 20

export class NotationError extends Error {}

/** Parse a formula, or throw a NotationError saying what's wrong with it. */
export function parse(formula: string): Term[] {
  const src = formula.trim()
  if (!src) throw new NotationError('Enter some dice, like 2d6+1.')
  const lower = src.toLowerCase()
  const terms: Term[] = []
  let i = 0

  const skipSpace = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const int = (): number | null => {
    const m = /^\d+/.exec(src.slice(i))
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }

  skipSpace()
  while (i < src.length) {
    let sign: 1 | -1 = 1
    if (src[i] === '+' || src[i] === '-') {
      sign = src[i] === '-' ? -1 : 1
      i++
      skipSpace()
    } else if (terms.length) {
      throw new NotationError(`Expected + or - before “${src.slice(i)}”.`)
    }

    const start = i
    const n = int()
    let term: Term
    if (lower[i] === 'd') {
      i++
      let sides: number | null
      if (src[i] === '%') {
        i++
        sides = 100
      } else {
        sides = int()
      }
      if (sides === null) throw new NotationError('Dice need a number of sides, like d6.')
      const count = n ?? 1
      if (count < 1) throw new NotationError('Roll at least one die.')
      if (count > MAX_DICE) throw new NotationError(`That’s more than ${MAX_DICE} dice.`)
      if (sides < 1 || sides > MAX_SIDES) throw new NotationError(`Dice can have 1 to ${MAX_SIDES} sides.`)
      const dice: DiceTerm = { kind: 'dice', sign, count, sides }

      // Modifiers, in any order.
      for (;;) {
        const km = /^(kh|kl|k|b|w|dh|dl)(\d+)/.exec(lower.slice(i))
        if (km) {
          i += km[0].length
          if (dice.drop || dice.keep) throw new NotationError('Use one keep or drop per dice term.')
          const op = km[1]
          const amount = Number(km[2])
          if (op === 'dh' || op === 'dl') dice.drop = { which: op === 'dh' ? 'high' : 'low', n: amount }
          else dice.keep = { which: op === 'kl' || op === 'w' ? 'low' : 'high', n: amount }
          continue
        }
        if (src[i] === '!') {
          i++
          if (sides === 1) throw new NotationError('A d1 can’t explode.')
          dice.explode = true
          continue
        }
        break
      }
      term = dice
    } else if (n !== null) {
      term = { kind: 'flat', sign, value: n }
    } else {
      throw new NotationError(`Couldn’t read “${src.slice(start)}”.`)
    }

    // An optional [label] after any term, kept as typed.
    skipSpace()
    if (src[i] === '[') {
      const close = src.indexOf(']', i)
      if (close < 0) throw new NotationError('A [label] is missing its closing ].')
      const label = src.slice(i + 1, close).trim()
      if (label) term.label = label
      i = close + 1
    }
    terms.push(term)
    skipSpace()
  }
  return terms
}

/** A uniform integer in [1, sides] from a cryptographic source. */
export function cryptoDie(sides: number): number {
  // Reject the top sliver of the range so every face is equally likely.
  const limit = Math.floor(0x1_0000_0000 / sides) * sides
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return (buf[0] % sides) + 1
  }
}

const notationOf = (t: DiceTerm) =>
  `${t.count}d${t.sides === 100 ? '%' : t.sides}` +
  (t.keep ? `k${t.keep.which === 'high' ? 'h' : 'l'}${t.keep.n}` : '') +
  (t.drop ? `d${t.drop.which === 'high' ? 'h' : 'l'}${t.drop.n}` : '') +
  (t.explode ? '!' : '')

/** Roll parsed terms. `die` is the random source, injectable for tests. */
export function rollTerms(formula: string, terms: Term[], die: (sides: number) => number = cryptoDie): Roll {
  const rolled = terms.map((t): RolledDice | RolledFlat => {
    if (t.kind === 'flat') return { kind: 'flat', sign: t.sign, value: t.value, label: t.label }

    const dice: Die[] = []
    let explosions = 0
    for (let k = 0; k < t.count; k++) {
      let value = die(t.sides)
      dice.push({ sides: t.sides, value, kept: true })
      while (t.explode && value === t.sides && explosions < MAX_EXPLOSIONS) {
        explosions++
        value = die(t.sides)
        dice.push({ sides: t.sides, value, kept: true, exploded: true })
      }
    }

    // Keep or drop by value; ties go to the earlier die.
    const rule = t.keep ?? t.drop
    if (rule) {
      const order = dice.map((_, idx) => idx).sort((a, b) => dice[a].value - dice[b].value || a - b)
      const n = Math.min(rule.n, dice.length)
      const low = order.slice(0, n)
      const high = order.slice(dice.length - n)
      const chosen = new Set(rule.which === 'low' ? low : high)
      dice.forEach((d, idx) => (d.kept = t.keep ? chosen.has(idx) : !chosen.has(idx)))
    }

    const subtotal = dice.reduce((sum, d) => sum + (d.kept ? d.value : 0), 0)
    return { kind: 'dice', sign: t.sign, notation: notationOf(t), label: t.label, dice, subtotal }
  })

  const total = rolled.reduce((sum, t) => sum + t.sign * (t.kind === 'dice' ? t.subtotal : t.value), 0)
  return { formula: formula.trim(), terms: rolled, total }
}

/** Parse and roll in one go. Throws NotationError for bad formulas. */
export function roll(formula: string, die?: (sides: number) => number): Roll {
  return rollTerms(formula, parse(formula), die)
}

/** "2d6 (4+5) + STR 2 = 11", for plain-text logs and screen readers. */
export function describe(r: Roll): string {
  const parts = r.terms.map((t, i) => {
    const sign = t.sign < 0 ? '- ' : i ? '+ ' : ''
    if (t.kind === 'flat') return `${sign}${t.label ? `${t.label} ` : ''}${t.value}`
    const faces = t.dice.map((d) => (d.kept ? `${d.value}` : `~~${d.value}~~`)).join('+')
    return `${sign}${t.notation}${t.label ? ` ${t.label}` : ''} (${faces})`
  })
  return `${parts.join(' ')} = ${r.total}`
}
