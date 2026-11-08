/**
 * Something picked from the dice tray: a die, a +1 or −1 token, or a token
 * adding one of the character's stats (its label and current value).
 */
export type TrayPick =
  | { kind: "die"; sides: number }
  | { kind: "modifier"; value: 1 | -1 }
  | { kind: "stat"; stat: string; value: number };

/** A number written with its sign, as a chip shows it: "+1", "−2". */
export const signed = (value: number) => (value < 0 ? `−${-value}` : `+${value}`);

/** What a chip for a number term shows: its signed value, under its label if it has one. */
export const chipText = (value: number, label?: string) =>
  label ? `${label}\n${signed(value)}` : signed(value);

/** How a pick reads on its tray button: "d6", "+1", "−1", "STR". */
export const pickName = (pick: TrayPick) =>
  pick.kind === "die" ? `d${pick.sides}` : pick.kind === "stat" ? pick.stat : signed(pick.value);

export const samePick = (a: TrayPick, b: TrayPick) => pickName(a) === pickName(b);

/**
 * The formula for a handful of picks made one at a time: dice grouped by type
 * in the order each type was first picked, then the tokens' net modifier,
 * then each stat as a labelled number.
 * d20, d6, +1, STR, d20, +1 → "2d20+1d6+2+3[STR]". Empty when there's nothing to roll.
 */
export function poolFormula(picked: TrayPick[]): string {
  const counts = new Map<number, number>();
  let modifier = 0;
  const stats: string[] = [];
  for (const pick of picked) {
    if (pick.kind === "die") counts.set(pick.sides, (counts.get(pick.sides) ?? 0) + 1);
    else if (pick.kind === "modifier") modifier += pick.value;
    else stats.push(`${pick.value < 0 ? "-" : "+"}${Math.abs(pick.value)}[${pick.stat}]`);
  }
  const terms = [...counts].map(([sides, n]) => `+${n}d${sides}`);
  if (modifier) terms.push(`${modifier < 0 ? "-" : "+"}${Math.abs(modifier)}`);
  return [...terms, ...stats].join("").replace(/^\+/, "");
}
