/*
 * macOS Title Case, for button, menu and dialog text: every word capitalised
 * except articles, coordinating conjunctions and short prepositions, which
 * are lower case unless they start or end the text ("Delete from This
 * Device", "Back to the Lobby", "Save As…").
 */

/** Articles, coordinating conjunctions and short prepositions. */
const MINOR = new Set(
  "a an the and but or nor as at by for from in into of on onto per to via with vs".split(" "),
);

/** Particles that may be part of a verb ("Set Up Scene") or a preposition: either case is fine. */
const PARTICLES = new Set(["up", "off", "out", "over", "down"]);

/**
 * Stands for an interpolated value in a template, which counts as a word but
 * is never changed, nor is anything joined to it.
 */
export const HOLE = "";

const WORD = /^([^\p{L}\p{N}\\]*)(.*?)([^\p{L}\p{N}]*)$/su;

/** Whether a word is left as written: an acronym, a mixed-case name, a number, a path. */
const keepsItsCase = (core: string) =>
  !/^\p{L}/u.test(core) || /\p{Lu}/u.test(core.slice(1)) || /[\d./@_\\]/.test(core);

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** `text` in Title Case, with "..." as "…". */
export function titleCase(text: string): string {
  const tokens = text.replaceAll('...', "…").split(/(\s+)/);
  const words = tokens.flatMap((t, index) => (t.trim() ? [index] : []));
  return tokens
    .map((token, index) => {
      const at = words.indexOf(index);
      if (at === -1 || token.includes(HOLE)) return token;
      const [, lead = "", core = "", trail = ""] = WORD.exec(token) ?? [];
      if (keepsItsCase(core)) return token;
      const previous = tokens[words[at - 1] ?? -1] ?? "";
      const edge = at === 0 || at === words.length - 1 || /[:—–]$/.test(previous);
      const lower = core.toLowerCase();
      let next: string;
      if (edge) next = capitalise(core);
      else if (MINOR.has(lower)) next = lower;
      else if (PARTICLES.has(lower)) next = core;
      else next = capitalise(core);
      return lead + next + trail;
    })
    .join("");
}
