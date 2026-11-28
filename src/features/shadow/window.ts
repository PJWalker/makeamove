/*
 * The shadow's rolling window over the session. Recent lines go to the model
 * as they are; when they no longer fit its context, the oldest are folded
 * into a running summary. Proved with LemmaScript: what's left after folding
 * fits the budget (unless everything was folded), and no more lines are
 * folded than needed.
 */

/** The total cost (in tokens) of `costs` from index `from` on. */
export function costFrom(costs: number[], from: number): number {
  //@ verify
  //@ requires 0 <= from && from <= costs.length
  //@ decreases costs.length - from
  if (from >= costs.length) return 0;
  return costs[from]! + costFrom(costs, from + 1);
}

/** How many of the oldest lines to fold into the summary so the rest cost at most `budget`. */
export function foldCount(costs: number[], budget: number): number {
  //@ verify
  //@ ensures 0 <= \result && \result <= costs.length
  //@ ensures \result === costs.length || costFrom(costs, \result) <= budget
  //@ ensures \result === 0 || costFrom(costs, \result - 1) > budget
  let n = 0;
  let rest = costFrom(costs, 0);
  while (n < costs.length && rest > budget) {
    //@ invariant 0 <= n && n <= costs.length
    //@ invariant rest === costFrom(costs, n)
    //@ invariant n === 0 || costFrom(costs, n - 1) > budget
    //@ decreases costs.length - n
    rest -= costs[n]!;
    n++;
  }
  return n;
}
