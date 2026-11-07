import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import type { Campaign } from "../../campaign/campaign";
import type { ItemDef } from "../../systems/types";
import type { ItemInstance } from "./types";
import { baseOf, getCharacter } from "./queries";
import { instanceOf } from "./store";
import { systemOf } from "./system";

/*
 * A character's inventory.
 */

/**
 * A character's inventory, to change. A copy that's still carrying its
 * template's gear gets its own copy of it first.
 */
function inventoryOf(campaign: Campaign, characterId: string): Y.Map<ItemInstance> | undefined {
  const m = campaign.characters.get(characterId);
  if (!m) return undefined;
  if (m.get("inventory") instanceof Y.Map) return m.get("inventory");
  const base = baseOf(campaign, m)?.get("inventory") as Y.Map<ItemInstance> | undefined;
  if (!m.get("base")) return undefined;
  const own = new Y.Map<ItemInstance>();
  m.set("inventory", own);
  for (const [id, item] of base?.entries() ?? []) own.set(id, item);
  return own;
}

export function addItem(campaign: Campaign, characterId: string, def: ItemDef, equip = false) {
  const inv = inventoryOf(campaign, characterId);
  if (!inv) return;
  const last =
    [...inv.values()]
      .map((i) => i.order)
      .sort()
      .at(-1) ?? null;
  const item = instanceOf(def, generateKeyBetween(last, null));
  if (equip && item.equippable) item.equipped = true;
  inv.set(item.id, item);
}

/** Items are replaced whole, so edit a copy: concurrent edits to one item keep the last writer's. */
export function updateItem(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  patch: Partial<ItemInstance>,
) {
  const inv = inventoryOf(campaign, characterId);
  const item = inv?.get(itemId);
  if (inv && item) inv.set(itemId, { ...item, ...patch });
}

export function markArtifactTrack(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  unlockId?: string,
): boolean {
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition =
    item && systemOf(campaign).items.find((entry) => entry.id === (item.defId ?? item.id));
  const artifact = definition?.artifact;
  if (!item || !artifact || character?.kind !== "pc") return false;
  const progress = item.artifactProgress ?? 0;
  if (progress >= artifact.capacity) return false;
  const nextProgress = progress + 1;
  if (nextProgress < artifact.capacity) {
    updateItem(campaign, characterId, itemId, { artifactProgress: nextProgress });
    return true;
  }

  const unlocked = item.artifactUnlocked ?? [];
  const available = artifact.unlocks.filter((move) => !unlocked.includes(move.id));
  if (!available.length) {
    updateItem(campaign, characterId, itemId, { artifactProgress: artifact.capacity });
    return true;
  }
  const selected =
    artifact.unlockMode === "choose"
      ? available.find((move) => move.id === unlockId)
      : available[0];
  if (!selected || (artifact.unlockMode === "choose" && !unlockId)) return false;
  updateItem(campaign, characterId, itemId, {
    artifactProgress: 0,
    artifactUnlocked:
      artifact.unlockMode === "sequential-replace" ? [selected.id] : [...unlocked, selected.id],
  });
  return true;
}

export function clearArtifactTrack(
  campaign: Campaign,
  characterId: string,
  itemId: string,
  amount = 1,
): boolean {
  const character = getCharacter(campaign, characterId);
  const item = character?.inventory.find((entry) => entry.id === itemId);
  const definition =
    item && systemOf(campaign).items.find((entry) => entry.id === (item.defId ?? item.id));
  const capacity = definition?.artifact?.capacity;
  const progress = item?.artifactProgress ?? 0;
  if (
    !item ||
    capacity === undefined ||
    character?.kind !== "pc" ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > progress
  )
    return false;
  updateItem(campaign, characterId, itemId, { artifactProgress: progress - amount });
  return true;
}

/** Spend one of an item's uses. */
export function spendItemUse(campaign: Campaign, characterId: string, itemId: string): boolean {
  const item = getCharacter(campaign, characterId)?.inventory.find((entry) => entry.id === itemId);
  if (!item || item.uses === undefined || (item.usesLeft ?? 0) <= 0) return false;
  updateItem(campaign, characterId, itemId, { usesLeft: (item.usesLeft ?? 0) - 1 });
  return true;
}

export function removeItem(campaign: Campaign, characterId: string, itemId: string) {
  inventoryOf(campaign, characterId)?.delete(itemId);
}
