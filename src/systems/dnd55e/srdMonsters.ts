import type { MonsterDef } from "../types";
import data from "./srd/monsters.json";

/** The SRD's monsters, generated from the rulebook by `npm run generate:rules`. */
const SRD_MONSTERS = data as unknown as MonsterDef[];

export default SRD_MONSTERS;
