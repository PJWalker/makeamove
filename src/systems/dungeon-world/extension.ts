import type { SystemExtension } from "../extensionTypes";
import { DungeonWorldNpcSheet, DungeonWorldSheet } from "./Sheet";

export const dungeonWorldExtension: SystemExtension = {
  sheets: { pc: DungeonWorldSheet, npc: DungeonWorldNpcSheet },
};
