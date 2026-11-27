/*
 * Which dice a keep or drop rule picks, and how many dice an exploding roll
 * can make. Kept apart from the notation parser so both can be proved.
 */

/** Explosions allowed across one dice term. */
export const MAX_EXPLOSIONS = 50;

/** Dice values, and whether to pick the highest (or the lowest) of them. */
export interface Ranking {
  values: number[];
  high: boolean;
}

/**
 * Whether die `a` ranks before die `b` when picking the highest (or lowest)
 * dice. Equal values rank by position: later first when picking the highest,
 * earlier first when picking the lowest.
 */
export function outranks(r: Ranking, a: number, b: number): boolean {
  //@ verify
  //@ requires 0 <= a && a < r.values.length && 0 <= b && b < r.values.length
  if (r.values[a] !== r.values[b])
    return r.high ? r.values[a]! > r.values[b]! : r.values[a]! < r.values[b]!;
  return r.high ? a > b : a < b;
}

/**
 * The positions of the `n` highest (or lowest) dice, or of every die if
 * there are fewer than `n`.
 */
export function pick(r: Ranking, n: number): Set<number> {
  //@ verify
  //@ requires n >= 0
  //@ ensures \result.size === Math.min(n, r.values.length)
  //@ ensures forall(i: int, \result.has(i) ==> 0 <= i && i < r.values.length)
  //@ ensures forall(a: int, forall(b: int, \result.has(a) && !\result.has(b) && 0 <= b && b < r.values.length ==> outranks(r, a, b)))
  const chosen = new Set<number>();
  const target = Math.min(n, r.values.length);
  let round = 0;
  while (round < target) {
    //@ invariant 0 <= round && round <= target
    //@ invariant chosen.size === round
    //@ invariant forall(i: int, chosen.has(i) ==> 0 <= i && i < r.values.length)
    //@ invariant forall(a: int, forall(b: int, chosen.has(a) && !chosen.has(b) && 0 <= b && b < r.values.length ==> outranks(r, a, b)))
    //@ decreases target - round
    let best = -1;
    let i = 0;
    while (i < r.values.length) {
      //@ invariant 0 <= i && i <= r.values.length
      //@ invariant -1 <= best && best < i
      //@ invariant best === -1 ==> forall(j: int, 0 <= j && j < i ==> chosen.has(j))
      //@ invariant best !== -1 ==> !chosen.has(best)
      //@ invariant best !== -1 ==> forall(j: int, 0 <= j && j < i && j !== best && !chosen.has(j) ==> outranks(r, best, j))
      //@ decreases r.values.length - i
      if (!chosen.has(i) && (best === -1 || outranks(r, i, best))) best = i;
      i++;
    }
    chosen.add(best);
    round++;
  }
  return chosen;
}

/** One die of a roll, and whether it was rolled because the one before it exploded. */
export interface RolledDie {
  value: number;
  exploded: boolean;
}

/** How many dice of how many sides to roll, and whether they explode. */
export interface DiceCount {
  count: number;
  sides: number;
  explode: boolean;
}

/**
 * Roll `count` dice of `sides` sides with `die`. When `explode` is set, a die
 * showing its maximum rolls again, up to MAX_EXPLOSIONS extra dice in all.
 */
export function rollDice(term: DiceCount, die: (sides: number) => number): RolledDie[] {
  //@ verify
  //@ requires term.count >= 0
  //@ ensures term.count <= \result.length && \result.length <= term.count + MAX_EXPLOSIONS
  const { count, sides, explode } = term;
  let rolled: RolledDie[] = [];
  let explosions = 0;
  let k = 0;
  while (k < count) {
    //@ invariant 0 <= k && k <= count
    //@ invariant 0 <= explosions && explosions <= MAX_EXPLOSIONS
    //@ invariant rolled.length === k + explosions
    //@ decreases count - k
    let value = die(sides);
    rolled = [...rolled, { value, exploded: false }];
    if (explode) {
      while (value === sides && explosions < MAX_EXPLOSIONS) {
        //@ invariant 0 <= explosions && explosions <= MAX_EXPLOSIONS
        //@ invariant rolled.length === k + 1 + explosions
        //@ decreases MAX_EXPLOSIONS - explosions
        explosions++;
        value = die(sides);
        rolled = [...rolled, { value, exploded: true }];
      }
    }
    k++;
  }
  return rolled;
}
