/**
 * The first peak in `scores`, from `start` on, that reaches `threshold`:
 * the first score that does, then on up its slope while the next is
 * higher. -1 if none does. A grid's spacing scores highly at every
 * multiple of it, so the first strong peak is the spacing itself.
 */
export default function firstPeak(scores: number[], start: number, threshold: number): number {
  //@ verify
  //@ type scores real[]
  //@ type threshold real
  //@ requires start >= 0
  //@ ensures \result === -1 || (start <= \result && \result < scores.length)
  //@ ensures \result !== -1 ==> scores[\result] >= threshold
  //@ ensures \result !== -1 && \result + 1 < scores.length ==> scores[\result + 1] <= scores[\result]
  //@ ensures \result === -1 ==> forall(k: int, start <= k && k < scores.length ==> scores[k] < threshold)
  let index = start;
  while (index < scores.length && scores[index]! < threshold) {
    //@ invariant start <= index && (index <= scores.length || index === start)
    //@ invariant forall(k: int, start <= k && k < index ==> scores[k] < threshold)
    //@ decreases scores.length - index
    index++;
  }
  if (index >= scores.length) return -1;
  while (index + 1 < scores.length && scores[index + 1]! > scores[index]!) {
    //@ invariant start <= index && index < scores.length && scores[index] >= threshold
    //@ decreases scores.length - index
    index++;
  }
  return index;
}
