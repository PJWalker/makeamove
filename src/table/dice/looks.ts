import type { DieLook } from "./types";

/* How the dice of a roll are drawn, without loading the 3D dice. */

/** The dice drawn as solids of their own; any other is drawn as a chip. */
const SOLIDS = new Set(Object.values({ d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }));

/** A d100's dice: tens and units, its tens written with two digits. */
const PERCENTILE = 100;
const DECIMAL = 10;
const TENS_DIGITS = 2;

const counting = (index: number) => String(index + 1);
const tens = (index: number) => String(index * DECIMAL).padStart(TENS_DIGITS, "0");
const units = (index: number) => String(index);

/**
 * The pieces a die of `sides` that rolled `value` is drawn as: its own solid;
 * a d100 as a tens d10 (00–90) and a units d10 (0–9), 00 and 0 reading 100;
 * any other as a chip numbered 1 to `sides`.
 */
export function looksOf(sides: number, value: number, colour: string): DieLook[] {
  if (sides === PERCENTILE)
    return [
      {
        form: "die",
        sides: DECIMAL,
        label: tens,
        shown: Math.floor(value / DECIMAL) % DECIMAL,
        colour,
      },
      { form: "die", sides: DECIMAL, label: units, shown: value % DECIMAL, colour },
    ];
  return [
    { form: SOLIDS.has(sides) ? "die" : "chip", sides, label: counting, shown: value - 1, colour },
  ];
}

/** A chip with `text` on it, and nothing else. */
export const chipLook = (text: string, colour: string): DieLook => ({
  form: "chip",
  sides: 1,
  label: () => text,
  shown: 0,
  colour,
});
