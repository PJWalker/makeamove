import type { SystemExtension } from "../extensionTypes";
import { DndNpcSheet, DndSheet } from "./Sheet";

const dnd55eExtension: SystemExtension = {
  sheets: { pc: DndSheet, npc: DndNpcSheet },
};

export default dnd55eExtension;
