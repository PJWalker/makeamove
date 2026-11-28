/*
 * How the names typed in a palette sentence ("Mira hack and slash goblin",
 * "selected lock") fill a command's slots: who acts (the subject) and what
 * it acts on (the object). Slots no name fills come from the context, such
 * as the acting character or the hovered token.
 *
 * Proved with LemmaScript: each command reads a sentence at most one way;
 * every name typed is used exactly once, in a slot that takes it; the
 * context only fills slots no name took, and fills every one it can; and a
 * command's required slots are always filled.
 */

/** Whether a command takes a slot: never, if there's something for it, or always. */
export type Need = "none" | "optional" | "required";

/** The slots a command's sentence has. */
export interface Signature {
  subject: Need;
  object: Need;
}

/** A name typed in a sentence: what it can stand for, and whether it came before the command's own words. */
export interface Word {
  /** A character the player plays, who can act. */
  actor: boolean;
  /** Something that can be acted on: a token, a character, the selection. */
  object: boolean;
  beforeVerb: boolean;
}

/** A slot no name or context fills. */
export const EMPTY = -1;
/** A slot the context fills. */
export const CONTEXT = -2;

/** How a sentence fills a command's slots: each is a typed word's index, EMPTY or CONTEXT. */
export interface Filling {
  ok: boolean;
  subject: number;
  object: number;
}

/** A sentence names who acts and what on, so at most two things. */
const MOST_NAMES = 2;

/** Whether the context has something for each slot. */
export interface Fallback {
  subject: boolean;
  object: boolean;
}

const unfit: Filling = { ok: false, subject: EMPTY, object: EMPTY };

/** A slot as typed, or else from the context if the command takes it and there's something there. */
function completed(need: Need, typed: number, context: boolean): number {
  //@ verify
  //@ ensures typed !== EMPTY ==> \result === typed
  //@ ensures typed === EMPTY && need !== "none" && context ==> \result === CONTEXT
  //@ ensures typed === EMPTY && (need === "none" || !context) ==> \result === EMPTY
  if (typed !== EMPTY) return typed;
  return need !== "none" && context ? CONTEXT : EMPTY;
}

/**
 * How `words`, in the order typed, fill a command's slots. With two names,
 * the first acts on the second. With one that could fill either slot, a name
 * before the command's words acts ("Mira hack and slash") and one after it
 * is acted on ("hack and slash Mira"). Empty slots are filled from `context`.
 */
export function fill(sig: Signature, words: Word[], context: Fallback): Filling {
  //@ verify
  //@ ensures \result.ok ==> (\result.subject === EMPTY || \result.subject === CONTEXT || (0 <= \result.subject && \result.subject < words.length && words[\result.subject].actor))
  //@ ensures \result.ok ==> (\result.object === EMPTY || \result.object === CONTEXT || (0 <= \result.object && \result.object < words.length && words[\result.object].object))
  //@ ensures \result.ok ==> words.length <= 2
  //@ ensures \result.ok && words.length >= 1 ==> \result.subject === 0 || \result.object === 0
  //@ ensures \result.ok && words.length === 2 ==> \result.subject === 1 || \result.object === 1
  //@ ensures \result.ok && \result.subject >= 0 ==> \result.subject !== \result.object
  //@ ensures \result.ok && sig.subject === "none" ==> \result.subject === EMPTY
  //@ ensures \result.ok && sig.object === "none" ==> \result.object === EMPTY
  //@ ensures \result.ok && sig.subject === "required" ==> \result.subject !== EMPTY
  //@ ensures \result.ok && sig.object === "required" ==> \result.object !== EMPTY
  //@ ensures \result.ok && \result.subject === CONTEXT ==> context.subject
  //@ ensures \result.ok && \result.object === CONTEXT ==> context.object
  //@ ensures \result.ok && sig.subject !== "none" && context.subject ==> \result.subject !== EMPTY
  //@ ensures \result.ok && sig.object !== "none" && context.object ==> \result.object !== EMPTY
  //@ ensures words.length === 0 && (sig.subject !== "required" || context.subject) && (sig.object !== "required" || context.object) ==> \result.ok
  //@ ensures !\result.ok ==> \result.subject === EMPTY && \result.object === EMPTY
  let s = EMPTY;
  let o = EMPTY;
  if (words.length > MOST_NAMES) return unfit;
  if (words.length === MOST_NAMES) {
    if (sig.subject === "none" || sig.object === "none") return unfit;
    if (!words[0]!.actor || !words[1]!.object) return unfit;
    s = 0;
    o = 1;
  } else if (words.length === 1) {
    const w = words[0]!;
    const asSubject = sig.subject !== "none" && w.actor;
    const asObject = sig.object !== "none" && w.object;
    if (asSubject && (w.beforeVerb || !asObject)) s = 0;
    else if (asObject) o = 0;
    else return unfit;
  }
  s = completed(sig.subject, s, context.subject);
  o = completed(sig.object, o, context.object);
  if (sig.subject === "required" && s === EMPTY) return unfit;
  if (sig.object === "required" && o === EMPTY) return unfit;
  return { ok: true, subject: s, object: o };
}
