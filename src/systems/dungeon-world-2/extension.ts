import type { MenuItem } from "../../ui/ContextMenu";
import type { SystemExtension } from "../extensionTypes";
import { Dw2Bonds } from "./BondsSection";
import {
  breakDungeonWorld2Weapon,
  consumeDungeonWorld2Item,
  saleValueDungeonWorld2Item,
  sellDungeonWorld2Item,
  WEAPON_TAGS,
} from "./campaign";
import { ChangeClassAction } from "./ClassChange";
import { Dw2ItemUse } from "./ItemUse";
import { DW2_MOVE_FORMS } from "./MoveForms";
import { DungeonWorld2NpcSheet, DungeonWorld2Sheet } from "./Sheet";

export const dungeonWorld2Extension: SystemExtension = {
  sheets: { pc: DungeonWorld2Sheet, npc: DungeonWorld2NpcSheet },
  moveForms: DW2_MOVE_FORMS,
  advancementActions: ChangeClassAction,
  relationshipsExtra: Dw2Bonds,
  ItemUse: Dw2ItemUse,
  spendUse: (campaign, characterId, itemId) =>
    consumeDungeonWorld2Item(campaign, characterId, itemId),
  itemMenu(campaign, character, item, editable) {
    const entries: MenuItem[] = [];
    if (item.equippable && !item.broken && item.tags.some((tag) => WEAPON_TAGS.has(tag)))
      entries.push({
        label: `Mark ${item.name} Broken`,
        disabled: !editable,
        onSelect: () => breakDungeonWorld2Weapon(campaign, character.id, item.id),
      });
    const saleValue = saleValueDungeonWorld2Item(campaign, character.id, item.id);
    if (saleValue !== null)
      entries.push({
        label:
          saleValue > 0 ? `Sell ${item.name} for 1 Treasure` : `Sell ${item.name} for no Treasure`,
        disabled: !editable,
        onSelect: () => sellDungeonWorld2Item(campaign, character.id, item.id),
      });
    return entries;
  },
};
