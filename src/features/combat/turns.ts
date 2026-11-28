/*
 * Moving the turn along the initiative order, as positions in it. `index` is
 * whose turn it is, or -1 when it is no one's. Proved with LemmaScript.
 */

export interface Turn {
  index: number;
  round: number;
}

/** Step back a turn, wrapping to the previous round; there is nothing before round 1's first turn. */
export function stepBack(count: number, at: Turn): Turn {
  //@ verify
  //@ requires count > 0 && at.index >= -1 && at.index < count
  //@ ensures \result.index >= -1 && \result.index < count
  //@ ensures at.index <= 0 && at.round <= 1 ==> \result.index === at.index && \result.round === at.round
  //@ ensures at.index > 0 ==> \result.index === at.index - 1 && \result.round === at.round
  if (at.index <= 0 && at.round <= 1) return at;
  if (at.index <= 0) return { index: count - 1, round: at.round - 1 };
  return { index: at.index - 1, round: at.round };
}

/** Pass the turn to the next in order; after the last, a new round starts with the first. */
export function stepForward(count: number, at: Turn): Turn {
  //@ verify
  //@ requires count > 0 && at.index >= -1 && at.index < count
  //@ ensures \result.index >= 0 && \result.index < count
  //@ ensures at.index === count - 1 ? \result.index === 0 && \result.round === at.round + 1 : \result.round === at.round
  //@ ensures at.index >= 0 && at.index < count - 1 ==> \result.index === at.index + 1
  //@ ensures at.index < 0 ==> \result.index === 0
  //@ ensures at.index >= 0 && at.round >= 1 ==> stepBack(count, \result).index === at.index && stepBack(count, \result).round === at.round
  const wraps = at.index === count - 1;
  if (wraps) return { index: 0, round: at.round + 1 };
  return { index: at.index < 0 ? 0 : at.index + 1, round: at.round };
}

/** Who takes the turn when the one at `index` leaves: the next in order, or no one if they were alone. */
export function passedOn(count: number, index: number): number {
  //@ verify
  //@ requires count > 0 && index >= 0 && index < count
  //@ ensures count === 1 ? \result === -1 : \result >= 0 && \result < count && \result !== index
  if (count === 1) return -1;
  return index === count - 1 ? 0 : index + 1;
}
