import { setSystemCampaignData } from "../../campaign/campaign";
import type { CampaignDefaults } from "../../campaign/types";
import { isNumber, isObject, isString, objectOf, optional } from "../../data/guards";
import { actingCharacterId } from "../../features/characters/api";
import { hotbarSlots, MAX_SLOTS, setHotbar } from "../../features/characters/hotbar";
import { deleteHomebrew, saveGear, saveMove } from "../../features/homebrew/homebrew";
import type { EntityGraphic } from "../../media/images";
import { device } from "../../platform/device";
import type { ActionDef, ItemDef } from "../../systems/types";
import { setShortcut as bindShortcut, setSlotLook, type SlotLook } from "./custom";
import { setEntityGraphic } from "../entityGraphics";
import { command } from "./types";

/* The campaign itself: its name and defaults, who's in it, homebrew, and each player's own hotbar and shortcuts. */

export const renameCampaign = command<{ name: string }>({
  id: "campaign.rename",
  params: objectOf({ name: isString }),
  title: "Rename Campaign",
  permission: "gm",
  undoGroup: "campaign.rename",
  run: ({ campaign }, { name }) => {
    if (name.trim()) campaign.rename(name.trim());
  },
});

export const setDefaults = command<{ patch: Partial<CampaignDefaults> }>({
  id: "campaign.setDefaults",
  params: objectOf({ patch: (v): v is Partial<CampaignDefaults> => isObject(v) }),
  title: "Change Defaults",
  permission: "gm",
  run: ({ campaign }, { patch }) => campaign.setDefaults(patch),
});

export const setCampaignField = command<{ field: string; value: string | number | boolean }>({
  id: "campaign.setSystemField",
  params: objectOf({
    field: isString,
    value: (v): v is string | number | boolean =>
      ["string", "number", "boolean"].includes(typeof v),
  }),
  title: "Change Campaign",
  permission: "gm",
  undoGroup: ({ field }) => `campaign.field ${field}`,
  run: ({ campaign }, { field, value }) => setSystemCampaignData(campaign, field, value),
});

/** This player's name in the campaign, as others see it. */
export const setMyName = command<{ name: string }>({
  id: "member.setName",
  params: objectOf({ name: isString }),
  title: "Change Your Name",
  undoGroup: "member.setName",
  run: ({ campaign }, { name }) => {
    if (name.trim()) campaign.ensureMember(name.trim());
  },
});

export const removeMember = command<{ id: string }>({
  id: "member.remove",
  params: objectOf({ id: isString }),
  title: "Remove from Campaign",
  danger: true,
  permission: (ctx, { id }) =>
    !ctx.isGm()
      ? "GM only"
      : id === device.value.id || ctx.campaign.members.get(id)?.get("role") === "gm"
        ? "The GM stays"
        : true,
  // Their device has been told to leave.
  undoGroup: false,
  run: ({ campaign }, { id }) => campaign.revokeMember(id),
});

export const allowBack = command<{ id: string }>({
  id: "member.allowBack",
  params: objectOf({ id: isString }),
  title: "Allow Back",
  permission: "gm",
  run: ({ campaign }, { id }) => campaign.allowBack(id),
});

export const chooseGraphic = command<{
  kind: string;
  id: string;
  graphic?: EntityGraphic | undefined;
}>({
  id: "graphic.set",
  params: objectOf({
    kind: isString,
    id: isString,
    graphic: optional((v): v is EntityGraphic => isObject(v)),
  }),
  title: "Change Graphic",
  undoGroup: ({ kind, id }) => `graphic ${kind} ${id}`,
  run: ({ campaign }, { kind, id, graphic }) => setEntityGraphic(campaign, kind, id, graphic),
});

const isGraphicChoice = (v: unknown): v is EntityGraphic | null => v === null || isObject(v);

/** Save homebrew gear and its graphic as one step; a null graphic puts its own back. */
export const saveHomebrewGear = command<
  { item: ItemDef; graphic?: EntityGraphic | null | undefined },
  string
>({
  id: "homebrew.saveGear",
  params: objectOf({ item: isObject<ItemDef>, graphic: optional(isGraphicChoice) }),
  title: "Save Gear",
  run: ({ campaign }, { item, graphic }) => {
    const id = saveGear(campaign.homebrew, item);
    if (graphic !== undefined) setEntityGraphic(campaign, "item", id, graphic ?? undefined);
    return id;
  },
});

export const saveHomebrewMove = command<
  { move: ActionDef; graphic?: EntityGraphic | null | undefined },
  string
>({
  id: "homebrew.saveMove",
  params: objectOf({ move: isObject<ActionDef>, graphic: optional(isGraphicChoice) }),
  title: "Save Move",
  run: ({ campaign }, { move, graphic }) => {
    const id = saveMove(campaign.homebrew, move);
    if (graphic !== undefined) setEntityGraphic(campaign, "move", id, graphic ?? undefined);
    return id;
  },
});

export const deleteHomebrewEntry = command<{ id: string }>({
  id: "homebrew.delete",
  params: objectOf({ id: isString }),
  title: "Delete Homebrew",
  danger: true,
  run: ({ campaign }, { id }) => deleteHomebrew(campaign.homebrew, id),
});

// This player's hotbar (for the acting character) and shortcuts

export const setSlots = command<{ slots: string[] }>({
  id: "hotbar.set",
  params: objectOf({ slots: (v): v is string[] => Array.isArray(v) && v.every(isString) }),
  title: "Arrange Hotbar",
  run: ({ campaign }, { slots }) =>
    setHotbar(campaign, actingCharacterId(campaign), slots.slice(0, MAX_SLOTS)),
});

export const pinToHotbar = command<{ key: string; at?: number | undefined }>({
  id: "hotbar.pin",
  params: objectOf({ key: isString, at: optional(isNumber) }),
  title: "Add to Hotbar",
  available: (ctx, { key }) =>
    hotbarSlots(ctx.campaign, actingCharacterId(ctx.campaign)).includes(key) ||
    hotbarSlots(ctx.campaign, actingCharacterId(ctx.campaign)).length < MAX_SLOTS ||
    "The hotbar is full",
  run: ({ campaign }, { key, at }) => {
    const character = actingCharacterId(campaign);
    const rest = hotbarSlots(campaign, character).filter((s) => s !== key);
    rest.splice(at ?? rest.length, 0, key);
    setHotbar(campaign, character, rest.slice(0, MAX_SLOTS));
  },
});

export const unpinFromHotbar = command<{ key: string }>({
  id: "hotbar.unpin",
  params: objectOf({ key: isString }),
  title: "Remove from Hotbar",
  run: ({ campaign }, { key }) => {
    const character = actingCharacterId(campaign);
    setHotbar(
      campaign,
      character,
      hotbarSlots(campaign, character).filter((s) => s !== key),
    );
  },
});

export const lookOfSlot = command<{ key: string; look: SlotLook }>({
  id: "hotbar.setLook",
  params: objectOf({ key: isString, look: isObject<SlotLook> }),
  title: "Change Slot",
  run: ({ campaign }, { key, look }) => setSlotLook(campaign, key, look),
});

export const bindKey = command<{ key: string; combo: string | null }>({
  id: "shortcut.set",
  params: objectOf({ key: isString, combo: (v): v is string | null => v === null || isString(v) }),
  title: "Set Shortcut",
  run: ({ campaign }, { key, combo }) => bindShortcut(campaign, key, combo),
});

export const campaignCommands = [
  renameCampaign,
  setDefaults,
  setCampaignField,
  setMyName,
  removeMember,
  allowBack,
  chooseGraphic,
  saveHomebrewGear,
  saveHomebrewMove,
  deleteHomebrewEntry,
  setSlots,
  pinToHotbar,
  unpinFromHotbar,
  lookOfSlot,
  bindKey,
];
