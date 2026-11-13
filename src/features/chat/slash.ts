import { NotationError, parse } from "../dice/notation";

/*
 * The pieces slash commands are typed with: dice formulas, durations,
 * labels and whom to whisper to. The commands themselves, and what the chat
 * box makes of what's typed, are in workspace/commands/chat.ts.
 */

export interface MemberRef {
  id: string;
  name: string;
  role: string;
}

/** Split "2d6+1 [STR] hack and slash" into the longest formula that parses and the rest. */
export function splitFormula(
  rest: string,
): { formula: string; comment?: string } | { error: string } {
  const text = rest.trim();
  if (!text) return { error: "Add some dice, like /r 2d6+1." };
  let firstError = "";
  // Try every whitespace boundary, longest first.
  const cuts = [text.length];
  for (let i = text.length - 1; i > 0; i--)
    if (/\s/.test(text.charAt(i)) && !/\s/.test(text.charAt(i - 1))) cuts.push(i);
  for (const cut of cuts) {
    const formula = text.slice(0, cut).trim();
    try {
      parse(formula);
      const comment = text.slice(cut).trim();
      return comment ? { formula, comment } : { formula };
    } catch (e) {
      if (!firstError && e instanceof NotationError) firstError = e.message;
    }
  }
  return { error: firstError || "Those dice don’t make sense." };
}

/** The text as a formula, if all of it is one with at least one die in it ("3" alone stays a message). */
export function diceFormula(text: string): string | null {
  const formula = text.trim();
  if (!formula || !/d/i.test(formula)) return null;
  try {
    return parse(formula).some((t) => t.kind === "dice") ? formula : null;
  } catch {
    return null;
  }
}

/** A duration like 90, 90s, 5m, 1h30m or 2:30, in seconds; null if it isn't one. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  const clock = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(t);
  if (clock) {
    const first = clock[1];
    const second = clock[2];
    if (!first || !second) return null;
    return clock[3] !== undefined
      ? +first * 3600 + +second * 60 + +clock[3]
      : +first * 60 + +second;
  }
  if (/^\d+$/.test(t)) return +t;
  const parts = /^(?:(\d+)h)?\s*(?:(\d+)m(?:in)?)?\s*(?:(\d+)s(?:ec)?)?$/.exec(t);
  if (!parts || !(parts[1] || parts[2] || parts[3])) return null;
  return +(parts[1] ?? 0) * 3600 + +(parts[2] ?? 0) * 60 + +(parts[3] ?? 0);
}

/** A label, without the quotes it may be typed in. */
export const unquote = (s: string) =>
  s
    .trim()
    .replace(/^["“'](.*)["”']$/s, "$1")
    .trim();

/** Whoever `rest` starts with: the longest matching member name, or "gm". */
export function whisperTarget(
  rest: string,
  members: MemberRef[],
): { to: MemberRef[]; text: string } | null {
  const lower = rest.toLowerCase();
  const byName = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of byName) {
    const name = m.name.toLowerCase();
    if (
      name &&
      lower.startsWith(name) &&
      (lower.length === name.length || /\s/.test(lower.charAt(name.length)))
    ) {
      return { to: [m], text: rest.slice(name.length).trim() };
    }
  }
  if (/^gm(\s|$)/.test(lower)) {
    const gms = members.filter((m) => m.role === "gm");
    if (gms.length) return { to: gms, text: rest.slice(2).trim() };
  }
  return null;
}
