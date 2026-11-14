import type { SystemExtension } from "../extensionTypes";
import { Dw2Bonds } from "./BondsSection";
import { ChangeClassAction } from "./ClassChange";
import { dungeonWorld2Commands } from "./commands";
import { Dw2ItemUse } from "./ItemUse";
import { ComfortOrSupport, Downtime, EndSession, MakeCamp, PerilousJourney } from "./MoveForms";
import { DungeonWorld2NpcSheet, DungeonWorld2Sheet } from "./Sheet";

export const dungeonWorld2Extension: SystemExtension = {
  sheets: { pc: DungeonWorld2Sheet, npc: DungeonWorld2NpcSheet },
  moveForms: {
    "comfort-or-support": ComfortOrSupport,
    "perilous-journey": PerilousJourney,
    "enjoy-downtime": Downtime,
    "end-the-session": EndSession,
    "make-camp": MakeCamp,
  },
  advancementActions: ChangeClassAction,
  relationshipsExtra: Dw2Bonds,
  ItemUse: Dw2ItemUse,
  commands: dungeonWorld2Commands,
};
