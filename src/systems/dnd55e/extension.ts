import type { SystemExtension } from "../extensions";
import { DndNpcSheet, DndSheet } from "./Sheet";

export const dnd55eExtension: SystemExtension = {
  sheets: { pc: DndSheet, npc: DndNpcSheet },
};
