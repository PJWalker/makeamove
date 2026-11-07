import type { SystemExtension } from "../extensions";
import { DungeonWorldNpcSheet, DungeonWorldSheet } from "./Sheet";

export const dungeonWorldExtension: SystemExtension = {
  sheets: { pc: DungeonWorldSheet, npc: DungeonWorldNpcSheet },
};
