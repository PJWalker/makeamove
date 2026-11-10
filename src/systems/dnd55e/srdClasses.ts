import data from "./srd/classFeatures.json";
import type { Feature } from "./data";

/** The SRD's class features, generated from the rulebook by `npm run generate:rules`. */
export const SRD_CLASS_FEATURES = data as unknown as Feature[];
