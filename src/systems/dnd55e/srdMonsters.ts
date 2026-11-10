import data from "./srd/monsters.json";
import type { MonsterDef } from "../types";

/** The SRD's monsters, generated from the rulebook by `npm run generate:rules`. */
export const SRD_MONSTERS = data as unknown as MonsterDef[];
