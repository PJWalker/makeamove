import {
  arrayOf,
  isBoolean,
  isNothing,
  isObject,
  isString,
  objectOf,
  oneOf,
  optional,
} from "../../data/guards";
import type { DataValue } from "../../data/types";
import { actingCharacterId, getCharacter } from "../../features/characters/api";
import { characterCommand, useItem } from "../../workspace/commands/characters";
import { command } from "../../workspace/commands/types";
import {
  applyClassChange,
  beginDungeonWorld2Downtime,
  breakDungeonWorld2Weapon,
  carouseDungeonWorld2,
  consumeDungeonWorld2Item,
  endDungeonWorld2Session,
  makeDungeonWorld2Camp,
  prepareDungeonWorld2Journey,
  resolveComfortOrSupport,
  resolveStruggle,
  resupplyDungeonWorld2,
  revealStruggle,
  saleValueDungeonWorld2Item,
  sellDungeonWorld2Item,
  shopDungeonWorld2Service,
  trainDungeonWorld2,
  WEAPON_TAGS,
  type ComfortBenefit,
  type DungeonWorld2ItemUse,
  type JourneyPace,
} from "./campaign";
import type { ServiceRank } from "./wealth";

/*
 * Dungeon World 2's own changes: its moves' bookkeeping (camp, journeys,
 * downtime), struggles, class changes, and what using or selling gear does.
 * Rolls and the chat cards these post aren't undone.
 */

const isRecord = <T>(v: unknown): v is Record<string, T> => isObject(v);
const isItem = objectOf({ characterId: isString, itemId: isString });
const itemOf = (
  campaign: Parameters<typeof getCharacter>[0],
  characterId: string,
  itemId: string,
) => getCharacter(campaign, characterId)?.inventory.find((i) => i.id === itemId);

/** Using gear does what the game says that kind does, instead of only spending a use. */
export const useGear = command<
  {
    itemId: string;
    characterId?: string | undefined;
    choice?: DungeonWorld2ItemUse | undefined;
  },
  boolean
>({
  ...useItem,
  replaces: true,
  params: objectOf({
    itemId: isString,
    characterId: optional(isString),
    choice: optional(isObject<DungeonWorld2ItemUse>),
  }),
  run: (ctx, { itemId, characterId, choice }) => {
    const who = characterId ?? actingCharacterId(ctx.campaign);
    return !!who && consumeDungeonWorld2Item(ctx.campaign, who, itemId, choice);
  },
});

export const breakWeapon = characterCommand<{ characterId: string; itemId: string }, boolean>({
  id: "dw2.breakWeapon",
  params: isItem,
  title: (ctx, { characterId, itemId }) =>
    `Mark ${itemOf(ctx.campaign, characterId, itemId)?.name ?? "Weapon"} Broken`,
  section: "act",
  menu: {
    item: (ctx, t) => {
      const i = itemOf(ctx.campaign, t.characterId, t.itemId);
      return i?.equippable && !i.broken && i.tags.some((tag) => WEAPON_TAGS.has(tag))
        ? [{ params: t }]
        : [];
    },
  },
  run: ({ campaign }, { characterId, itemId }) =>
    breakDungeonWorld2Weapon(campaign, characterId, itemId),
});

export const sellGear = characterCommand<{ characterId: string; itemId: string }, boolean>({
  id: "dw2.sell",
  params: isItem,
  title: (ctx, { characterId, itemId }) => {
    const name = itemOf(ctx.campaign, characterId, itemId)?.name ?? "Item";
    const value = saleValueDungeonWorld2Item(ctx.campaign, characterId, itemId);
    return value ? `Sell ${name} for 1 Treasure` : `Sell ${name} for no Treasure`;
  },
  section: "act",
  menu: {
    item: (ctx, t) =>
      saleValueDungeonWorld2Item(ctx.campaign, t.characterId, t.itemId) !== null
        ? [{ params: t }]
        : [],
  },
  run: ({ campaign }, { characterId, itemId }) =>
    sellDungeonWorld2Item(campaign, characterId, itemId),
});

export const revealCharacterStruggle = characterCommand<
  { characterId: string; struggle: string },
  boolean
>({
  id: "dw2.revealStruggle",
  params: objectOf({ characterId: isString, struggle: isString }),
  title: "Reveal Struggle",
  run: ({ campaign }, { characterId, struggle }) => revealStruggle(campaign, characterId, struggle),
});

export const resolveCharacterStruggle = characterCommand<{ characterId: string }, boolean>({
  id: "dw2.resolveStruggle",
  params: objectOf({ characterId: isString }),
  title: "Resolve Struggle",
  run: ({ campaign }, { characterId }) => resolveStruggle(campaign, characterId),
});

export const changeClass = characterCommand<
  {
    characterId: string;
    classId: string;
    scores: Record<string, number>;
    data: Record<string, DataValue>;
  },
  boolean
>({
  id: "dw2.changeClass",
  params: objectOf({
    characterId: isString,
    classId: isString,
    scores: isRecord<number>,
    data: isRecord<DataValue>,
  }),
  title: "Change Class",
  run: ({ campaign }, { characterId, classId, scores, data }) =>
    applyClassChange(campaign, characterId, classId, scores, data),
});

export const endSession = characterCommand<{
  characterId: string;
  answers: [boolean, boolean, boolean];
}>({
  id: "dw2.endSession",
  params: objectOf({
    characterId: isString,
    answers: (v): v is [boolean, boolean, boolean] => arrayOf(isBoolean)(v) && v.length === 3,
  }),
  title: "Award Group XP",
  undoGroup: false,
  run: ({ campaign }, { characterId, answers }) =>
    endDungeonWorld2Session(campaign, characterId, answers),
});

export const makeCamp = characterCommand<{
  characterId: string;
  clear: Record<string, string>;
  repair: Record<string, string>;
}>({
  id: "dw2.makeCamp",
  params: objectOf({ characterId: isString, clear: isRecord<string>, repair: isRecord<string> }),
  title: "Finish Making Camp",
  undoGroup: false,
  run: ({ campaign }, { characterId, clear, repair }) =>
    makeDungeonWorld2Camp(campaign, characterId, clear, repair),
});

export const comfort = characterCommand<{
  characterId: string;
  comforted: string;
  benefits: ComfortBenefit[];
}>({
  id: "dw2.comfort",
  params: objectOf({
    characterId: isString,
    comforted: isString,
    benefits: (v): v is ComfortBenefit[] => Array.isArray(v),
  }),
  title: "Comfort or Support",
  undoGroup: false,
  run: ({ campaign }, { characterId, comforted, benefits }) =>
    resolveComfortOrSupport(campaign, characterId, comforted, benefits),
});

export const prepareJourney = characterCommand<
  { characterId: string; pace: JourneyPace; conditions: Record<string, string> },
  boolean
>({
  id: "dw2.prepareJourney",
  params: objectOf({
    characterId: isString,
    pace: oneOf("quick", "regular", "slow"),
    conditions: isRecord<string>,
  }),
  title: "Set Out",
  run: ({ campaign }, { characterId, pace, conditions }) =>
    prepareDungeonWorld2Journey(campaign, characterId, pace, conditions),
});

export const beginDowntime = command({
  id: "dw2.beginDowntime",
  params: isNothing,
  title: "Begin Downtime",
  permission: "gm",
  run: ({ campaign }) => beginDungeonWorld2Downtime(campaign),
});

export const carouse = characterCommand<
  {
    characterId: string;
    benefit: "clear-locked" | "gain-depth";
    target?: string | undefined;
    condition?: string | undefined;
  },
  boolean
>({
  id: "dw2.carouse",
  params: objectOf({
    characterId: isString,
    benefit: oneOf("clear-locked", "gain-depth"),
    target: optional(isString),
    condition: optional(isString),
  }),
  title: "Carouse",
  run: ({ campaign }, { characterId, benefit, target, condition }) =>
    carouseDungeonWorld2(campaign, characterId, benefit, target, condition),
});

export const resupply = characterCommand<{ characterId: string }, boolean>({
  id: "dw2.resupply",
  params: objectOf({ characterId: isString }),
  title: "Resupply",
  run: ({ campaign }, { characterId }) => resupplyDungeonWorld2(campaign, characterId),
});

export const shop = characterCommand<{ characterId: string; service: string; rank: ServiceRank }>({
  id: "dw2.shop",
  params: objectOf({ characterId: isString, service: isString, rank: oneOf(2, 3, 4) }),
  title: "Shop",
  undoGroup: false,
  run: ({ campaign }, { characterId, service, rank }) =>
    shopDungeonWorld2Service(campaign, characterId, service, rank),
});

export const train = characterCommand<{ characterId: string }, boolean>({
  id: "dw2.train",
  params: objectOf({ characterId: isString }),
  title: "Train",
  run: ({ campaign }, { characterId }) => trainDungeonWorld2(campaign, characterId),
});

export const dungeonWorld2Commands = [
  useGear,
  breakWeapon,
  sellGear,
  revealCharacterStruggle,
  resolveCharacterStruggle,
  changeClass,
  endSession,
  makeCamp,
  comfort,
  prepareJourney,
  beginDowntime,
  carouse,
  resupply,
  shop,
  train,
];
