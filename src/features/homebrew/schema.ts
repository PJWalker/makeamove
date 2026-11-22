import { isObject, isString } from "../../lib/guards";
import { collection, lww  } from "../../data/schema";
import type {Item} from "../../data/schema";
import type { ActionDef, ItemDef } from "../../systems/types";

export type HomebrewEntry = { kind: "gear"; item: ItemDef } | { kind: "move"; move: ActionDef };

/** Gear and moves made at the table, by id (homebrew.ts). */
const isHomebrewEntry = (value: unknown): value is HomebrewEntry => {
  if (!isObject<{ kind?: unknown; item?: unknown; move?: unknown }>(value)) return false;
  if (value.kind === "gear")
    return isObject<{ name?: unknown }>(value.item) && isString(value.item.name);
  if (value.kind === "move")
    return isObject<{ name?: unknown }>(value.move) && isString(value.move.name);
  return false;
};

export const homebrewField = collection(lww(isHomebrewEntry), "homebrew entry");
export type Homebrew = Item<typeof homebrewField>;
