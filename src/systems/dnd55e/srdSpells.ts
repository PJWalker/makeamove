import { srdSpells } from "./srdSpells.macro" with { type: "macro" };

/** The SRD's spells, parsed from reference/dnd-5.5e-srd/spells.md at build time. */
export const SRD_SPELLS = srdSpells();
