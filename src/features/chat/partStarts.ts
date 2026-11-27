/**
 * Where each part of the chat log begins, given which messages start a
 * session: at the first message, and at every session start after it.
 * Proved with LemmaScript: the parts are in order, none is empty, and
 * every session start begins one, so the parts hold every message once.
 */
// eslint-disable-next-line import/prefer-default-export -- named like the other verified modules
export function partStarts(isStart: boolean[]): number[] {
  //@ verify
  //@ ensures isStart.length === 0 ? \result.length === 0 : \result.length > 0 && \result[0] === 0
  //@ ensures forall(k: nat, k < \result.length ==> \result[k] >= 0 && \result[k] < isStart.length)
  //@ ensures forall(k: nat, 0 < k && k < \result.length ==> \result[k - 1] < \result[k])
  //@ ensures forall(k: nat, 0 < k && k < \result.length ==> isStart[\result[k]])
  //@ ensures forall(i: nat, 0 < i && i < isStart.length && isStart[i] ==> exists(k: nat, k < \result.length && \result[k] === i))
  const starts: number[] = [];
  // eslint-disable-next-line unicorn/no-for-loop -- the proof needs the index
  for (let i = 0; i < isStart.length; i++) {
    //@ invariant 0 <= i && i <= isStart.length
    //@ invariant i === 0 ? starts.length === 0 : starts.length > 0 && starts[0] === 0
    //@ invariant forall(k: nat, k < starts.length ==> starts[k] >= 0 && starts[k] < i)
    //@ invariant forall(k: nat, 0 < k && k < starts.length ==> starts[k - 1] < starts[k])
    //@ invariant forall(k: nat, 0 < k && k < starts.length ==> isStart[starts[k]])
    //@ invariant forall(j: nat, 0 < j && j < i && isStart[j] ==> exists(k: nat, k < starts.length && starts[k] === j))
    //@ decreases isStart.length - i
    if (i === 0 || isStart[i]) starts.push(i);
  }
  return starts;
}
