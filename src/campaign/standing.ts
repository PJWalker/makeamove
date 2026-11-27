/*
 * A device's place in a campaign, and the three things that change it: the
 * GM removing it, the GM letting it back, and the device checking its own
 * membership when the campaign changes. Proved with LemmaScript: once removed,
 * a device is never a member again until the GM lets it back, a GM is never
 * removed, and only the GM can remove or let back.
 */

export interface Standing {
  member: boolean;
  gm: boolean;
  removed: boolean;
}

/**
 * Whether a standing is consistent: a removed device is not a member, and
 * only a member can be the GM.
 * @public Used by the proofs' specs.
 */
export function settled(s: Standing): boolean {
  //@ verify
  return (!s.removed || !s.member) && (!s.gm || s.member);
}

/** The GM (`byGm`) removes a device; never their own, and never a GM's. */
export function removedBy(s: Standing, own: boolean, byGm: boolean): Standing {
  //@ verify
  //@ ensures settled(s) ==> settled(\result)
  //@ ensures !byGm || own || s.gm || !s.member ? \result === s : \result.removed && !\result.member
  //@ ensures s.gm ==> \result === s
  //@ ensures !byGm ==> \result === s
  if (!byGm || own || s.gm || !s.member) return s;
  return { member: false, gm: false, removed: true };
}

/** The GM (`byGm`) lets a removed device back; it rejoins when it next checks. */
export function letBack(s: Standing, byGm: boolean): Standing {
  //@ verify
  //@ ensures settled(s) ==> settled(\result)
  //@ ensures \result.removed === (s.removed && !byGm) && \result.member === s.member && \result.gm === s.gm
  //@ ensures !byGm ==> \result === s
  if (!byGm) return s;
  return { member: s.member, gm: s.gm, removed: false };
}

/** A device checking its own membership: it joins a named campaign unless it was removed. */
export function checkedIn(s: Standing, named: boolean): Standing {
  //@ verify
  //@ ensures settled(s) ==> settled(\result)
  //@ ensures s.removed ==> \result === s
  //@ ensures named && !s.removed ==> \result.member
  //@ ensures \result.removed === s.removed && \result.gm === s.gm
  if (named && !s.removed && !s.member) return { member: true, gm: s.gm, removed: s.removed };
  return s;
}
