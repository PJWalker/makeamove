/*
 * Comma lists, split and joined by hand so LemmaScript can prove they round
 * trip: joining a list of comma-free entries and splitting it gives the list
 * back, and splitting any text and joining it gives the text back.
 */

/**
 * Whether `s` has no comma in it.
 * @public Used by the proofs' specs.
 */
export function commaFree(s: string): boolean {
  //@ verify
  return firstComma(s) < 0;
}

/** Where the first comma in `s` is, or -1. */
export function firstComma(s: string): number {
  //@ verify
  //@ decreases s.length
  //@ ensures \result >= -1 && \result < s.length
  //@ ensures \result >= 0 ==> s[\result] === ","
  //@ ensures forall(k: nat, k < s.length && (\result < 0 || k < \result) ==> s[k] !== ",")
  if (s.length === 0) return -1;
  // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with -- the proof reads characters
  if (s[0] === ",") return 0;
  const rest = firstComma(s.slice(1));
  return rest < 0 ? -1 : rest + 1;
}

/** The entries of `s` between its commas; text with no comma is one entry. */
export function splitCommas(s: string): string[] {
  //@ verify
  //@ decreases s.length
  //@ ensures \result.length > 0
  //@ ensures joinCommas(\result) === s
  const at = firstComma(s);
  if (at < 0) return [s];
  return [s.slice(0, at), ...splitCommas(s.slice(at + 1))];
}

/** The entries joined with commas. */
export function joinCommas(entries: string[]): string {
  //@ verify
  //@ decreases entries.length
  //@ ensures entries.length > 0 && forall(k: nat, k < entries.length ==> commaFree(entries[k])) ==> splitCommas(\result) === entries
  if (entries.length === 0) return "";
  if (entries.length === 1) return entries[0]!;
  return `${entries[0]!},${joinCommas(entries.slice(1))}`;
}
