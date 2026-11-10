import data from "./srd/spells.json";
import type { Spell } from "./data";

/** The SRD's spells, generated from the rulebook by `npm run generate:rules`. */
export const SRD_SPELLS = data as unknown as Spell[];
