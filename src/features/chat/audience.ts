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

/**
 * Whether the GM shadow (features/shadow) may read a message. Proved: it
 * reads exactly what the GM sees in full, so a whisper between players never
 * reaches it.
 */
export function shadowReads(a: Audience, gm: string): boolean {
  //@ verify
  //@ ensures \result === (seenBy(a, gm, true) === "full")
  //@ ensures a.whisper && a.author !== gm && !a.to.includes(gm) ==> !\result
  return !a.whisper || a.author === gm || a.to.includes(gm);
}

/**
 * Where a message shows on the map while the chat log is closed: in a speech
 * bubble at its speaker's token, at the screen's edge, or not at all ("off").
 */
export type BubblePlace = "edge" | "off" | "token";

/** Who's looking, and what's on their screen. */
export interface BubbleViewer {
  me: string;
  isGm: boolean;
  /** The chat log is showing, so the message is read there. */
  chatOpen: boolean;
  /** The speaker has a token on the scene that `me` is shown. */
  tokenShown: boolean;
}

/**
 * Where `v.me` sees a message pop up over the map. Proved with LemmaScript:
 * nothing pops up while the log is open; a bubble only ever shows what
 * `seenBy` shows in full, so a whisper shows only to its sender and
 * recipients (the GM included) and a secret roll only to its roller and the
 * GM; and a bubble sits at a token only if that token is shown to them
 * (`tokenShown`: on the scene, and not hidden by fog or out of sight; see
 * scene/fog.ts's `tokenShows`), so a bubble never gives a hidden token away.
 */
export function bubblePlace(a: Audience, v: BubbleViewer): BubblePlace {
  //@ verify
  //@ ensures v.chatOpen ==> \result === "off"
  //@ ensures \result !== "off" ==> seenBy(a, v.me, v.isGm) === "full"
  //@ ensures a.whisper && a.author !== v.me && !a.to.includes(v.me) ==> \result === "off"
  //@ ensures !a.whisper && a.secretRoll && !v.isGm && a.author !== v.me ==> \result === "off"
  //@ ensures \result === "token" ==> v.tokenShown
  //@ ensures !v.chatOpen && seenBy(a, v.me, v.isGm) === "full" ==> \result === (v.tokenShown ? "token" : "edge")
  if (v.chatOpen || seenBy(a, v.me, v.isGm) !== "full") return "off";
  return v.tokenShown ? "token" : "edge";
}
