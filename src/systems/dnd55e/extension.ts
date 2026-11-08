import type { SystemExtension } from "../extensionTypes";
import { DndNpcSheet, DndSheet } from "./Sheet";

export const dnd55eExtension: SystemExtension = {
  sheets: { pc: DndSheet, npc: DndNpcSheet },
};
