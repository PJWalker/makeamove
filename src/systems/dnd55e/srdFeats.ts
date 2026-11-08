import { srdFeats } from "./srdFeats.macro" with { type: "macro" };

/** The SRD's feats, parsed from reference/dnd-5.5e-srd/feats.md at build time. */
export const SRD_FEATS = srdFeats();
