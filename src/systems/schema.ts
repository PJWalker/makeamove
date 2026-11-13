import { isNumber } from "../data/guards";
import { collection, counter, lww, record, type Item } from "../data/schema";
import type { DataValue } from "../data/types";

/*
 * What a game system keeps in a campaign: on each character, and
 * campaign-wide. Each lives under the system's id (`ext[systemId]`), so only
 * that system writes it, and two players editing different parts of it
 * never overwrite each other.
 */

const isDataValue = (v: unknown): v is DataValue =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** The version of a system's data it was written as (see data/migrate.ts). */
const schemaVersion = lww(isNumber);

/** What a system keeps on a character: its fields, scores, resources and modifiers by id. */
export const systemCharacterData = record({
  schemaVersion,
  /** The system's own fields (GameSystem.characterData). */
  data: collection(lww(isDataValue)),
  /** Stat id -> score. */
  scores: collection(lww(isNumber)),
  /** Resource id -> current value (HP, spell slots…); concurrent changes add up. */
  resources: collection(counter()),
  /** Modifier id -> value (Dungeon World's forward, ongoing). */
  modifiers: collection(lww(isNumber)),
  /** An NPC's system-defined fields. */
  fields: collection(lww((v): v is string | number => typeof v === "string" || isNumber(v))),
});

/** What a system keeps campaign-wide. */
export const systemCampaignData = record({
  schemaVersion,
  /** Declared fields (GameSystem.campaignFields) and the system's own values. */
  values: collection(lww(isDataValue)),
  /** Keyed collections of the system's own records (campaign/systemStore.ts). */
  stores: collection(collection(lww<unknown>())),
});

export type SystemCharacterRec = Item<typeof systemCharacterData>;
export type SystemCampaignRec = Item<typeof systemCampaignData>;
