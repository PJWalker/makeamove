/**
 * Compare strings by code unit, not by locale: how fractional-index keys and
 * HLC stamps sort.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Sorts things by their fractional-index `order` key. */
export const byOrder = (a: { order: string }, b: { order: string }): number =>
  compareCodeUnits(a.order, b.order);
