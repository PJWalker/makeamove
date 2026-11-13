import type { SystemExtension } from "../extensionTypes";
import { bladesCommands } from "./commands";
import { BladesCrewControls } from "./CrewSheet";
import { BladesNpcSheet, BladesSheet } from "./Sheet";

export const bladesExtension: SystemExtension = {
  sheets: { pc: BladesSheet, npc: BladesNpcSheet },
  campaignSheet: BladesCrewControls,
  commands: bladesCommands,
};
