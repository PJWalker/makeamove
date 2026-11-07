import type { ComponentType } from "react";
import type { Campaign } from "../campaign/campaign";
import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { MenuItem } from "../table/ContextMenu";
import type { GameSystem } from "./types";
import { dnd55eExtension } from "./dnd55e/extension";
import { dungeonWorldExtension } from "./dungeon-world/extension";
import { dungeonWorld2Extension } from "./dungeon-world-2/extension";
import { bladesExtension } from "./blades-in-the-dark/extension";

/*
 * What a system adds to the table besides its rules: sheet components,
 * forms for its moves, and actions that change the campaign. The core asks
 * for these by hook and never by system id. Kept apart from the systems'
 * rules (./index.ts) so importing a system's rules does not pull in its UI.
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
  /** What the item menu's Use does, instead of spending one use. */
  spendUse?(campaign: Campaign, characterId: string, itemId: string): boolean;
  /** Extra entries for an item's menu. */
  itemMenu?(
    campaign: Campaign,
    character: CharacterView,
    item: ItemInstance,
    editable: boolean,
  ): MenuItem[];
}

const EXTENSIONS: Record<string, SystemExtension> = {
  "dnd-5.5e": dnd55eExtension,
  "dungeon-world": dungeonWorldExtension,
  "dungeon-world-2": dungeonWorld2Extension,
  "blades-in-the-dark": bladesExtension,
};

const NONE: SystemExtension = {};

/** What a system adds to the table; nothing for systems that add nothing. */
export const extensionOf = (system: Pick<GameSystem, "id"> | string | undefined): SystemExtension =>
  EXTENSIONS[typeof system === "string" ? system : (system?.id ?? "")] ?? NONE;
