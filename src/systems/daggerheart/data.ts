import { daggerheartRules } from "./data.macro" with { type: "macro" };

/** Daggerheart's classes, heritages, cards and gear, parsed from the SRD at build time. */
export const { CLASSES, ANCESTRIES, COMMUNITIES, SUBCLASSES, DOMAIN_CARDS, WEAPONS, ARMOR } =
  daggerheartRules();
