/*
 * Who sees a map pin, and who can open it. Proved with LemmaScript: a player
 * never sees or opens a pin whose target they can't see (a GM page, or
 * anything not on their device), nor one out of their tokens' sight; the
 * GM sees every pin, GM pages and broken links included.
 */

/** How a pin shows: openable, the GM's alone (it leads to a GM page), broken (its target is gone), or not at all. */
export type PinLook = "broken" | "hidden" | "open" | "secret";

/** What decides how a pin shows to someone. */
export interface PinSight {
  gm: boolean;
  /** Its target is on this device. */
  found: boolean;
  /** Its target is a GM page. */
  gmOnly: boolean;
  /** It's in the viewer's sight (always, unless the scene limits players to their tokens' sight). */
  inSight: boolean;
}

/** How a pin shows to a viewer. */
export function pinLook(s: PinSight): PinLook {
  //@ verify
  //@ ensures !s.gm ==> (\result === "open") === (s.found && !s.gmOnly && s.inSight)
  //@ ensures !s.gm ==> \result === "open" || \result === "hidden"
  //@ ensures s.gm ==> \result !== "hidden"
  //@ ensures s.gm ==> (\result === "broken") === !s.found
  //@ ensures \result === "secret" ==> s.gm && s.found && s.gmOnly
  if (!s.found) return s.gm ? "broken" : "hidden";
  if (s.gm) return s.gmOnly ? "secret" : "open";
  return !s.gmOnly && s.inSight ? "open" : "hidden";
}

/** Whether a pin that looks like this opens its target when clicked. */
export function pinOpens(look: PinLook): boolean {
  //@ verify
  //@ ensures \result === (look === "open" || look === "secret")
  return look === "open" || look === "secret";
}

/** Whether a viewer can open a pin: only if they can see what it leads to, and see the pin. */
export function canOpenPin(s: PinSight): boolean {
  //@ verify
  //@ ensures \result ==> s.found && (s.gm || (!s.gmOnly && s.inSight))
  //@ ensures s.gm && s.found ==> \result
  return pinOpens(pinLook(s));
}
