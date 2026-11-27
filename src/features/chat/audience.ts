/*
 * Who may read a chat message. Proved with LemmaScript: a whisper never shows
 * to anyone outside it, the GM included, and a secret roll shows in full only
 * to its roller and the GM.
 */

export type Seen = "full" | "hidden" | "masked";

/** What decides who sees a message. */
export interface Audience {
  author: string;
  /** Sent only to `to` (and seen by its sender). */
  whisper: boolean;
  to: string[];
  /** A roll only its roller and the GM see in full. */
  secretRoll: boolean;
}

/** How `me` sees a message: in full, as a masked roll, or not at all. */
export function seenBy(a: Audience, me: string, isGm: boolean): Seen {
  //@ verify
  //@ ensures a.whisper ==> (\result === "full") === (a.author === me || a.to.includes(me))
  //@ ensures a.whisper ==> \result !== "masked"
  //@ ensures !a.whisper ==> \result !== "hidden"
  //@ ensures !a.whisper ==> (\result === "masked") === (a.secretRoll && !isGm && a.author !== me)
  if (a.whisper) return a.author === me || a.to.includes(me) ? "full" : "hidden";
  if (a.secretRoll && !isGm && a.author !== me) return "masked";
  return "full";
}
