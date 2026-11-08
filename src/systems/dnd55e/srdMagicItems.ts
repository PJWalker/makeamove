import { srdMagicItems } from "./srdMagicItems.macro" with { type: "macro" };

/** The SRD's magic items, parsed from reference/dnd-5.5e-srd/magic-items.md at build time. */
export const SRD_MAGIC_ITEMS = srdMagicItems();
