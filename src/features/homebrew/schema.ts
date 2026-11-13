import { isObject } from "../../data/guards";
import { collection, lww, type Item } from "../../data/schema";
import type { ActionDef, ItemDef } from "../../systems/types";

export type HomebrewEntry = { kind: "gear"; item: ItemDef } | { kind: "move"; move: ActionDef };

/** Gear and moves made at the table, by id (homebrew.ts). */
export const homebrewField = collection(lww(isObject<HomebrewEntry>), "homebrew entry");
export type Homebrew = Item<typeof homebrewField>;
