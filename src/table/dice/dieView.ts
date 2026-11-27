/*
 * Where a die is seen. A die is one canvas: at rest in its slot, or lifted
 * into the top layer while it moves. While its tray is carried over the page
 * as a copy, the tray itself is hidden and the die is seen at rest in the
 * copy instead. Every change below is proved to leave the die seen in
 * exactly one of those places: never gone, never doubled.
 */

export interface DieView {
  /** In the top layer, carried over the page as it moves. */
  lifted: boolean;
  /** Its tray is being carried as a copy (and the tray itself is hidden). */
  carried: boolean;
  /** Drawn at rest in the carried copy of its tray. */
  copyShown: boolean;
}

/** How many places the die is seen in. */
export function placesSeen(v: DieView): number {
  //@ verify
  const flying = v.lifted ? 1 : 0;
  const inCopy = v.carried && v.copyShown ? 1 : 0;
  const inSlot = !v.lifted && !v.carried ? 1 : 0;
  return flying + inCopy + inSlot;
}

/** A new die, at rest in its slot. */
export function atRest(): DieView {
  //@ verify
  //@ ensures placesSeen(\result) === 1
  return { lifted: false, carried: false, copyShown: false };
}

/** It starts moving, or moves on: lifted, and no longer shown in a carried copy. */
export function lifted(v: DieView): DieView {
  //@ verify
  //@ ensures placesSeen(\result) === 1
  //@ ensures \result.lifted && \result.carried === v.carried
  return { lifted: true, carried: v.carried, copyShown: false };
}

/** It comes to rest: back in its slot, or shown in the copy if its tray is carried. */
export function lowered(v: DieView): DieView {
  //@ verify
  //@ ensures placesSeen(\result) === 1
  //@ ensures !\result.lifted && \result.carried === v.carried
  return { lifted: false, carried: v.carried, copyShown: v.carried };
}

/** Its tray starts being carried: shown in the copy, unless it's flying. */
export function carried(v: DieView): DieView {
  //@ verify
  //@ ensures placesSeen(\result) === 1
  //@ ensures \result.carried && \result.lifted === v.lifted
  return { lifted: v.lifted, carried: true, copyShown: !v.lifted };
}

/** Its tray is let go: the copy is gone. */
export function released(v: DieView): DieView {
  //@ verify
  //@ ensures placesSeen(\result) === 1
  //@ ensures !\result.carried && \result.lifted === v.lifted
  return { lifted: v.lifted, carried: false, copyShown: false };
}
