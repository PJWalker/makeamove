import type { SystemExtension } from "../extensionTypes";
import { Dw2Bonds } from "./BondsSection";
import { ChangeClassAction } from "./ClassChange";
import { dungeonWorld2Commands } from "./commands";
import { Dw2ItemUse } from "./ItemUse";
import { DW2_MOVE_FORMS } from "./MoveForms";
import { DungeonWorld2NpcSheet, DungeonWorld2Sheet } from "./Sheet";

export const dungeonWorld2Extension: SystemExtension = {
  sheets: { pc: DungeonWorld2Sheet, npc: DungeonWorld2NpcSheet },
  moveForms: DW2_MOVE_FORMS,
  advancementActions: ChangeClassAction,
  relationshipsExtra: Dw2Bonds,
  ItemUse: Dw2ItemUse,
  commands: dungeonWorld2Commands,
};
