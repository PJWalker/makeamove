/* eslint-disable unicorn/prefer-code-point -- the proof models UTF-16 code units, and invite text is ASCII */
/*
 * Reading and writing the text of an invite link, `…#join=<campaignId>.<roomKey>`,
 * by hand so LemmaScript can prove it: what it reads is always a well-formed
 * invite, and any page address followed by an invite's hash reads back as
 * that invite.
 */

/** The shortest room key an invite accepts. */
export const MIN_KEY = 16;

const DIGIT_0 = 48;
const DIGIT_9 = 57;
const LOWER_A = 97;
const LOWER_Z = 122;
const UPPER_A = 65;
const UPPER_Z = 90;
const UNDERSCORE = 95;
const HYPHEN = 45;
const SPACE = 32;
const TAB = 9;
const CARRIAGE_RETURN = 13;
const JOIN = "join=";

export interface InviteParts {
  found: boolean;
  campaignId: string;
  roomKey: string;
}

/**
 * A campaign id character: a digit or lower-case letter.
 * @public Used by the proofs' specs.
 */
export function isIdCode(c: number): boolean {
  //@ verify
  return (c >= DIGIT_0 && c <= DIGIT_9) || (c >= LOWER_A && c <= LOWER_Z);
}

/**
 * A room key character: a letter, digit, `_` or `-`.
 * @public Used by the proofs' specs.
 */
export function isKeyCode(c: number): boolean {
  //@ verify
  return isIdCode(c) || (c >= UPPER_A && c <= UPPER_Z) || c === UNDERSCORE || c === HYPHEN;
}

/** White space that may trail a pasted link. */
function isSpaceCode(c: number): boolean {
  //@ verify
  return c === SPACE || (c >= TAB && c <= CARRIAGE_RETURN);
}

/**
 * Whether every character of `s` can be in a campaign id.
 * @public Used by the proofs' specs.
 */
export function idText(s: string): boolean {
  //@ verify
  //@ decreases s.length
  if (s.length === 0) return true;
  return isIdCode(s.charCodeAt(0)) && idText(s.slice(1));
}

/**
 * Whether every character of `s` can be in a room key.
 * @public Used by the proofs' specs.
 */
export function keyText(s: string): boolean {
  //@ verify
  //@ decreases s.length
  if (s.length === 0) return true;
  return isKeyCode(s.charCodeAt(0)) && keyText(s.slice(1));
}

/** Where `s[0..end]` ends once trailing white space is left off. */
function spaceEnd(s: string, end: number): number {
  //@ verify
  //@ requires 0 <= end && end <= s.length
  //@ decreases end
  //@ ensures 0 <= \result && \result <= end
  if (end > 0 && isSpaceCode(s.charCodeAt(end - 1))) return spaceEnd(s, end - 1);
  return end;
}

/** Where the run of room key characters ending at `end` starts. */
function keyFrom(s: string, end: number): number {
  //@ verify
  //@ requires 0 <= end && end <= s.length
  //@ decreases end
  //@ ensures 0 <= \result && \result <= end
  if (end > 0 && isKeyCode(s.charCodeAt(end - 1))) return keyFrom(s, end - 1);
  return end;
}

/** Where the run of campaign id characters ending at `end` starts. */
function idFrom(s: string, end: number): number {
  //@ verify
  //@ requires 0 <= end && end <= s.length
  //@ decreases end
  //@ ensures 0 <= \result && \result <= end
  if (end > 0 && isIdCode(s.charCodeAt(end - 1))) return idFrom(s, end - 1);
  return end;
}

/** The invite at the end of `text`, a link or a bare hash, if there is one. */
export function readInvite(text: string): InviteParts {
  //@ verify
  //@ ensures \result.found ==> \result.campaignId.length > 0 && idText(\result.campaignId)
  //@ ensures \result.found ==> \result.roomKey.length >= MIN_KEY && keyText(\result.roomKey)
  const none = { found: false, campaignId: "", roomKey: "" };
  const end = spaceEnd(text, text.length);
  const keyAt = keyFrom(text, end);
  const dot = keyAt - 1;
  if (dot < 0 || text[dot] !== "." || end - keyAt < MIN_KEY) return none;
  const idAt = idFrom(text, dot);
  if (idAt === dot || idAt < JOIN.length || text.slice(idAt - JOIN.length, idAt) !== JOIN)
    return none;
  return { found: true, campaignId: text.slice(idAt, dot), roomKey: text.slice(keyAt, end) };
}

/** A page address followed by an invite's hash. */
export function inviteText(page: string, campaignId: string, roomKey: string): string {
  //@ verify
  //@ ensures campaignId.length > 0 && idText(campaignId) && roomKey.length >= MIN_KEY && keyText(roomKey) ==> readInvite(\result).found && readInvite(\result).campaignId === campaignId && readInvite(\result).roomKey === roomKey
  return `${page}#join=${campaignId}.${roomKey}`;
}
