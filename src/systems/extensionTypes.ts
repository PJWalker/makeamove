import type { ComponentType } from "react";
import type { Campaign } from "../campaign/campaign";
import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { AnyTableCommand } from "../workspace/commands/types";
import type { GameSystem } from "./types";

/*
 * The shape of what a system adds to the table. Systems implement these; the
 * registry that maps a system to its extension lives in ./extensions.ts.
 */

export interface SheetProps {
  campaign: Campaign;
  system: GameSystem;
  c: CharacterView;
}

/** A form drawn under a move's text, for the character making it. */
export interface MoveFormProps {
  sheet: {
    campaign: Campaign;
    /** The character making the move. */
    c: CharacterView;
    system: GameSystem;
    editable: boolean;
  };
}

export interface ItemUseProps {
  campaign: Campaign;
  character: CharacterView;
  item: ItemInstance;
  editable: boolean;
}

export interface SystemExtension {
  /** The system's own sheet components, instead of the core's declarative sheet. */
  sheets?: { pc: ComponentType<SheetProps>; npc: ComponentType<SheetProps> };
  /** Campaign-wide controls (a crew sheet). */
  campaignSheet?: ComponentType<{ campaign: Campaign }>;
  /** Forms for moves, by move id. */
  moveForms?: Record<string, ComponentType<MoveFormProps>>;
  /** Buttons beside the declarative sheet's advancement banner. */
  advancementActions?: ComponentType<{ campaign: Campaign; characterId: string }>;
  /** Drawn at the end of a character's Relationships section. */
  relationshipsExtra?: ComponentType<{ campaign: Campaign; c: CharacterView; editable: boolean }>;
  /** Controls for using an item with uses, instead of the core's Use button. */
  ItemUse?: ComponentType<ItemUseProps>;
  /** The system's own commands: its moves' bookkeeping, its entries in menus, and stand-ins for the core's. */
  commands?: readonly AnyTableCommand[];
}
