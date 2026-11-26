import type { OptionDef } from "../types";
import data from "./srd/feats.json";

/** The SRD's feats, generated from the rulebook by `npm run generate:rules`. */
const SRD_FEATS = data as unknown as OptionDef[];

export default SRD_FEATS;
