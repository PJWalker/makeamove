import data from "./srd/magicItems.json";
import type { ItemDef } from "../types";

/** The SRD's magic items, generated from the rulebook by `npm run generate:rules`. */
export const SRD_MAGIC_ITEMS = data as unknown as ItemDef[];
