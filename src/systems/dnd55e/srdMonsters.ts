import { srdMonsters } from "./srdMonsters.macro" with { type: "macro" };

/** The SRD's monsters, parsed from reference/dnd-5.5e-srd/monsters-A-Z.md at build time. */
export const SRD_MONSTERS = srdMonsters();
