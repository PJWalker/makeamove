/**
 * The formula for a handful of dice picked one at a time, grouped by type in
 * the order each type was first picked: d20, d6, d20 → "2d20+1d6".
 */
export function poolFormula(picked: number[]): string {
  const counts = new Map<number, number>()
  for (const sides of picked) counts.set(sides, (counts.get(sides) ?? 0) + 1)
  return [...counts].map(([sides, n]) => `${n}d${sides}`).join('+')
}
