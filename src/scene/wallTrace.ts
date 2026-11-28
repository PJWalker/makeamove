/*
 * Simplifying the outline traced around a map's walls (see detectWalls.ts).
 * The outline runs along the edges of the image's samples, so its points are
 * whole numbers and every check here is exact: LemmaScript proves that the
 * simplified path keeps both ends, keeps points in order, and passes within
 * the tolerance of every point it leaves out.
 */

/** A corner between samples of a map's image, in whole samples. */
export interface Corner {
  x: number;
  y: number;
}

/** The chord from `a` to `b`, squared. */
export function length2(a: Corner, b: Corner): number {
  //@ verify
  return (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
}

/** How far along the chord from `a` to `b` `p` is, times the chord's length. */
export function along(a: Corner, b: Corner, p: Corner): number {
  //@ verify
  return (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
}

/** How far to the side of the chord from `a` to `b` `p` is, times the chord's length. */
export function across(a: Corner, b: Corner, p: Corner): number {
  //@ verify
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/**
 * Whether `p` is within the tolerance of the chord from `a` to `b`: alongside
 * it, and no farther from it than √tol2. A chord of no length is a point.
 * All squared, so exact on whole numbers.
 */
export function nearChord(a: Corner, b: Corner, p: Corner, tol2: number): boolean {
  //@ verify
  if (length2(a, b) === 0) return length2(a, p) <= tol2;
  return (
    along(a, b, p) >= 0 &&
    along(a, b, p) <= length2(a, b) &&
    across(a, b, p) * across(a, b, p) <= tol2 * length2(a, b)
  );
}

/** Whether every point strictly between `from` and `to` is near the chord between them. */
export function allNear(pts: Corner[], from: number, to: number, tol2: number): boolean {
  //@ verify
  //@ requires 0 <= from && from < to && to < pts.length
  //@ ensures \result ==> forall(k: nat, from < k && k < to ==> nearChord(pts[from], pts[to], pts[k], tol2))
  for (let k = from + 1; k < to; k++) {
    //@ invariant from + 1 <= k && k <= to
    //@ invariant forall(j: nat, from < j && j < k ==> nearChord(pts[from], pts[to], pts[j], tol2))
    //@ decreases to - k
    if (!nearChord(pts[from]!, pts[to]!, pts[k]!, tol2)) return false;
  }
  return true;
}

/**
 * How far `p` is from the chord from `a` to `b`, squared and times the
 * chord's length squared (so whole); from `a` alone if the chord has no length.
 */
export function deviation(a: Corner, b: Corner, p: Corner): number {
  //@ verify
  if (length2(a, b) === 0) return length2(a, p);
  if (along(a, b, p) < 0) return length2(a, p) * length2(a, b);
  if (along(a, b, p) > length2(a, b)) return length2(b, p) * length2(a, b);
  return across(a, b, p) * across(a, b, p);
}

/** The point strictly between `from` and `to` farthest from the chord between them. */
export function farthest(pts: Corner[], from: number, to: number): number {
  //@ verify
  //@ requires 0 <= from && from + 1 < to && to < pts.length
  //@ ensures from < \result && \result < to
  let best = from + 1;
  for (let k = from + 2; k < to; k++) {
    //@ invariant from + 2 <= k && k <= to
    //@ invariant from < best && best < k
    //@ decreases to - k
    if (deviation(pts[from]!, pts[to]!, pts[k]!) > deviation(pts[from]!, pts[to]!, pts[best]!))
      best = k;
  }
  return best;
}

/**
 * Which points of the path from `from` to `to` to keep, in order: both ends,
 * and enough between that every point left out is near the chord that
 * replaces it (Douglas–Peucker: split at the farthest point until each
 * chord is near enough).
 */
export function keepBetween(pts: Corner[], from: number, to: number, tol2: number): number[] {
  //@ verify
  //@ requires 0 <= from && from < to && to < pts.length
  //@ decreases to - from
  //@ ensures \result.length >= 2
  //@ ensures \result[0] === from && \result[\result.length - 1] === to
  //@ ensures forall(t: nat, t < \result.length ==> from <= \result[t] && \result[t] <= to)
  //@ ensures forall(t: nat, t + 1 < \result.length ==> \result[t] < \result[t + 1])
  //@ ensures forall(t: nat, forall(k: nat, t + 1 < \result.length && \result[t] < k && k < \result[t + 1] ==> nearChord(pts[\result[t]], pts[\result[t + 1]], pts[k], tol2)))
  if (from + 1 === to || allNear(pts, from, to, tol2)) return [from, to];
  const split = farthest(pts, from, to);
  const left = keepBetween(pts, from, split, tol2);
  const right = keepBetween(pts, split, to, tol2);
  return [...left, ...right.slice(1)];
}

/** Which points of a path to keep, in order: its first and last, and enough between that every point left out is near the chord replacing it. */
export function simplifyPath(pts: Corner[], tol2: number): number[] {
  //@ verify
  //@ requires pts.length >= 2
  //@ ensures \result.length >= 2
  //@ ensures \result[0] === 0 && \result[\result.length - 1] === pts.length - 1
  //@ ensures forall(t: nat, t < \result.length ==> 0 <= \result[t] && \result[t] < pts.length)
  //@ ensures forall(t: nat, t + 1 < \result.length ==> \result[t] < \result[t + 1])
  //@ ensures forall(t: nat, forall(k: nat, t + 1 < \result.length && \result[t] < k && k < \result[t + 1] ==> nearChord(pts[\result[t]], pts[\result[t + 1]], pts[k], tol2)))
  return keepBetween(pts, 0, pts.length - 1, tol2);
}
