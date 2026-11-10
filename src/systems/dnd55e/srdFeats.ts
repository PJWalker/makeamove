import data from "./srd/feats.json";
import type { OptionDef } from "../types";

/** The SRD's feats, generated from the rulebook by `npm run generate:rules`. */
export const SRD_FEATS = data as unknown as OptionDef[];
