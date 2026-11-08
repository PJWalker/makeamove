import { srdClassFeatures } from "./srdClasses.macro" with { type: "macro" };

/** The SRD's class features, parsed from reference/dnd-5.5e-srd/classes.md at build time. */
export const SRD_CLASS_FEATURES = srdClassFeatures();
