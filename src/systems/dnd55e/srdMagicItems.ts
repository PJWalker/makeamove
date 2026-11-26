import type { ItemDef } from "../types";
import data from "./srd/magicItems.json";

/** The SRD's magic items, generated from the rulebook by `npm run generate:rules`. */
const SRD_MAGIC_ITEMS = data as unknown as ItemDef[];

export default SRD_MAGIC_ITEMS;
