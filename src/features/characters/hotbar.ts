import { callKey } from "../../kernel/commands";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";

import { actionsFor, derive, itemActive } from "./store";
import { getCharacter, actingCharacterId, systemOf } from "./api";

/*
 * The hotbar is a list of action ids per player and character, kept in the
 * player's own member entry so it syncs between their devices but never
 * touches anyone else's.
 */

export const MAX_SLOTS = 12;

/*
 * Slots hold command calls by key (kernel/commands.ts). These build the keys
 * for what a fresh bar holds; the commands themselves are in
 * workspace/commands, under the same ids.
 */
export const SLOT_COMMANDS = {
  move: "move.start",
  use: "item.use",
  tool: "tool.select",
  library: "item.add",
} as const;
export const moveSlot = (move: string) => callKey(SLOT_COMMANDS.move, { move });
export const useSlot = (itemId: string) => callKey(SLOT_COMMANDS.use, { itemId });
/** Adding a library item to the acting character's inventory. */
export const librarySlot = (item: string) => callKey(SLOT_COMMANDS.library, { item });
export const toolSlot = (tool: string) => callKey(SLOT_COMMANDS.tool, { tool });
const BASIC_SLOTS = [toolSlot("ping"), toolSlot("ruler")];

/** Without a character there is one shared bar, so pinning always works. */
const key = (characterId?: string) => characterId ?? "global";

/** Pin to the end; already-pinned ids stay where they are. */
export function pin(slots: string[], id: string): string[] {
  return slots.includes(id) || slots.length >= MAX_SLOTS ? slots : [...slots, id];
}

export const unpin = (slots: string[], id: string) => slots.filter((s) => s !== id);

/** Move a slot one place left (-1) or right (+1). */
export function shift(slots: string[], id: string, by: -1 | 1): string[] {
  const i = slots.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= slots.length) return slots;
  const next = [...slots];
  const left = next[i]!;
  const right = next[j]!;
  next[i] = right;
  next[j] = left;
  return next;
}

/** What a fresh hotbar holds: the character's moves, gear with uses, and the table tools. */
export function defaultHotbar(campaign: Campaign, characterId: string): string[] {
  const system = systemOf(campaign);
  const c = getCharacter(campaign, characterId);
  if (!c) return BASIC_SLOTS;
  const d = derive(c, system);
  const skip = new Set(
    system.actionCategories.filter((k) => k.onHotbar === false).map((k) => k.id),
  );
  const moves = actionsFor(c, system, d)
    .filter((m) => !skip.has(m.category))
    .map((m) => moveSlot(m.id));
  const gear = c.inventory.filter((i) => i.uses && itemActive(i)).map((i) => useSlot(i.id));
  return [...moves, ...gear, ...BASIC_SLOTS].slice(0, MAX_SLOTS);
}

export function hotbarSlots(campaign: Campaign, characterId: string | undefined): string[] {
  const saved = campaign.members.get(device.value.id)?.get("hotbars")?.get(key(characterId));
  return saved ?? (characterId ? defaultHotbar(campaign, characterId) : BASIC_SLOTS);
}

export function setHotbar(campaign: Campaign, characterId: string | undefined, slots: string[]) {
  campaign.members.get(device.value.id)?.ensure("hotbars").set(key(characterId), slots);
}

/** Move a slot to a position (as counted before it was lifted out). */
export function moveTo(slots: string[], id: string, index: number): string[] {
  const from = slots.indexOf(id);
  if (from < 0) return slots;
  const rest = slots.filter((s) => s !== id);
  rest.splice(index > from ? index - 1 : index, 0, id);
  return rest;
}

/** Edit the selected character's hotbar (or the shared one with no character). */
export function editHotbar(campaign: Campaign, edit: (slots: string[]) => string[]): boolean {
  const id = actingCharacterId(campaign);
  if (!campaign.members.get(device.value.id)) return false;
  setHotbar(campaign, id, edit(hotbarSlots(campaign, id)));
  return true;
}

export const isPinned = (campaign: Campaign, id: string) =>
  hotbarSlots(campaign, actingCharacterId(campaign)).includes(id);

/** Pin an action at a position, or move it there if it is already pinned. */
export function insertAt(slots: string[], id: string, index: number): string[] {
  if (slots.includes(id)) return placeAt(slots, id, index);
  if (slots.length >= MAX_SLOTS) return slots;
  const next = [...slots];
  next.splice(index, 0, id);
  return next;
}

/** Put a slot at a position among the other slots (counted with it lifted out). */
export function placeAt(slots: string[], id: string, index: number): string[] {
  if (!slots.includes(id)) return slots;
  const rest = slots.filter((s) => s !== id);
  rest.splice(index, 0, id);
  return rest;
}
