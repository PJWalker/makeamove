import type { SystemExtension } from "../extensionTypes";
import { DungeonWorldNpcSheet, DungeonWorldSheet } from "./Sheet";

const dungeonWorldExtension: SystemExtension = {
  sheets: { pc: DungeonWorldSheet, npc: DungeonWorldNpcSheet },
};

export default dungeonWorldExtension;
