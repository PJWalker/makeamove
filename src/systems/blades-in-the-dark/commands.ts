import { isNothing, isString, objectOf } from "../../data/guards";
import { characterCommand } from "../../workspace/commands/characters";
import { command } from "../../workspace/commands/types";
import {
  advanceAttribute,
  advanceCrew as rewardCrew,
  advanceCrewTier,
  buyCrewUpgrade,
} from "./progression";

/* Blades in the Dark's own changes: advancing a scoundrel's actions, and the GM advancing the crew. */

export const advanceAction = characterCommand<
  { characterId: string; attribute: string; action: string },
  boolean
>({
  id: "blades.advanceAction",
  params: objectOf({ characterId: isString, attribute: isString, action: isString }),
  title: "Advance",
  run: ({ campaign }, { characterId, attribute, action }) =>
    advanceAttribute(campaign, characterId, attribute, action),
});

export const advanceCrew = command<{ reward: string }, boolean>({
  id: "blades.advanceCrew",
  params: objectOf({ reward: isString }),
  title: "Advance the Crew",
  permission: "gm",
  run: ({ campaign }, { reward }) => rewardCrew(campaign, reward),
});

export const buyUpgrade = command<{ upgrade: string }, boolean>({
  id: "blades.buyUpgrade",
  params: objectOf({ upgrade: isString }),
  title: "Buy Upgrade",
  permission: "gm",
  run: ({ campaign }, { upgrade }) => buyCrewUpgrade(campaign, upgrade),
});

export const advanceTier = command<void, boolean>({
  id: "blades.advanceTier",
  params: isNothing,
  title: "Advance Tier",
  permission: "gm",
  run: ({ campaign }) => advanceCrewTier(campaign),
});

export const bladesCommands = [advanceAction, advanceCrew, buyUpgrade, advanceTier];
