import type { SystemExtension } from "../extensions";
import { BladesCrewControls } from "./CrewSheet";
import { BladesNpcSheet, BladesSheet } from "./Sheet";

export const bladesExtension: SystemExtension = {
  sheets: { pc: BladesSheet, npc: BladesNpcSheet },
  campaignSheet: BladesCrewControls,
};
