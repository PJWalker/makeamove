/*
 * The bookkeeping behind one undo history over several stacks: which stack
 * holds each undoable (and redoable) step, oldest first. Each change mirrors
 * what happened to one stack, and is proved to change that stack's count of
 * steps by exactly what the stack itself did, leaving every other stack's
 * count alone. So the history never undoes on a stack with nothing to undo,
 * and never forgets a step a stack still has.
 */

export type StepKind = "redo" | "undo";

/** Which stack holds each step, oldest first. */
export interface Steps {
  undo: string[];
  redo: string[];
}

/** How many of `ids` are `id`. */
export function occurrences(ids: string[], id: string): number {
  //@ verify
  //@ decreases ids.length
  //@ ensures \result >= 0
  if (ids.length === 0) return 0;
  // LemmaScript doesn't model `.at()`.
  // eslint-disable-next-line unicorn/prefer-at
  const last = ids[ids.length - 1]!;
  return occurrences(ids.slice(0, -1), id) + (last === id ? 1 : 0);
}

/** `ids` without its last `id`, if it has one. */
export function withoutLast(ids: string[], id: string): string[] {
  //@ verify
  //@ decreases ids.length
  //@ ensures occurrences(\result, id) === (occurrences(ids, id) > 0 ? occurrences(ids, id) - 1 : 0)
  //@ ensures forall(x: string, x !== id ==> occurrences(\result, x) === occurrences(ids, x))
  if (ids.length === 0) return [];
  // eslint-disable-next-line unicorn/prefer-at
  const last = ids[ids.length - 1]!;
  const init = ids.slice(0, -1);
  return last === id ? init : [...withoutLast(init, id), last];
}

/** `ids` without any `id`. */
export function withoutAll(ids: string[], id: string): string[] {
  //@ verify
  //@ decreases ids.length
  //@ ensures occurrences(\result, id) === 0
  //@ ensures forall(x: string, x !== id ==> occurrences(\result, x) === occurrences(ids, x))
  if (ids.length === 0) return [];
  // eslint-disable-next-line unicorn/prefer-at
  const last = ids[ids.length - 1]!;
  const rest = withoutAll(ids.slice(0, -1), id);
  return last === id ? rest : [...rest, last];
}

/**
 * The steps of `kind`.
 * @public Used by the proofs' specs.
 */
export function stepsOf(s: Steps, kind: StepKind): string[] {
  //@ verify
  return kind === "undo" ? s.undo : s.redo;
}

/** `stack` recorded a new step of `kind`: it is now the latest. */
export function added(s: Steps, kind: StepKind, stack: string): Steps {
  //@ verify
  //@ ensures occurrences(stepsOf(\result, kind), stack) === occurrences(stepsOf(s, kind), stack) + 1
  //@ ensures forall(k: StepKind, forall(x: string, (k !== kind || x !== stack) ==> occurrences(stepsOf(\result, k), x) === occurrences(stepsOf(s, k), x)))
  //@ ensures stepsOf(\result, kind)[stepsOf(\result, kind).length - 1] === stack
  return kind === "undo"
    ? { undo: [...s.undo, stack], redo: s.redo }
    : { undo: s.undo, redo: [...s.redo, stack] };
}

/** `stack` gave up its latest step of `kind` (undone, or redone). */
export function popped(s: Steps, kind: StepKind, stack: string): Steps {
  //@ verify
  //@ ensures occurrences(stepsOf(\result, kind), stack) === (occurrences(stepsOf(s, kind), stack) > 0 ? occurrences(stepsOf(s, kind), stack) - 1 : 0)
  //@ ensures forall(k: StepKind, forall(x: string, (k !== kind || x !== stack) ==> occurrences(stepsOf(\result, k), x) === occurrences(stepsOf(s, k), x)))
  return kind === "undo"
    ? { undo: withoutLast(s.undo, stack), redo: s.redo }
    : { undo: s.undo, redo: withoutLast(s.redo, stack) };
}

/** Which kinds of step a stack cleared. */
export interface Clearing {
  undo: boolean;
  redo: boolean;
}

/** `stack` cleared its undo steps, its redo steps, or both (and both when it stops being tracked). */
export function cleared(s: Steps, stack: string, kinds: Clearing): Steps {
  //@ verify
  //@ ensures kinds.undo ==> occurrences(\result.undo, stack) === 0
  //@ ensures kinds.redo ==> occurrences(\result.redo, stack) === 0
  //@ ensures !kinds.undo ==> \result.undo === s.undo
  //@ ensures !kinds.redo ==> \result.redo === s.redo
  //@ ensures forall(x: string, x !== stack ==> occurrences(\result.undo, x) === occurrences(s.undo, x) && occurrences(\result.redo, x) === occurrences(s.redo, x))
  return {
    undo: kinds.undo ? withoutAll(s.undo, stack) : s.undo,
    redo: kinds.redo ? withoutAll(s.redo, stack) : s.redo,
  };
}
