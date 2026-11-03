import {
  canEdit,
  getCharacter,
  listCharacters,
  setData,
  setScore,
  systemOf,
} from "../../features/characters/api";
import { formatCommaList, parseCommaList } from "../../lib/list";
import { getState, setState } from "../../features/chat/messageState";
import {
  systemCampaignData,
  setSystemCampaignData,
  type Campaign,
} from "../../campaign/campaign";
import { ATTRIBUTES } from "./index";

export function advanceAttribute(
  campaign: Campaign,
  characterId: string,
  attributeId: string,
  actionId: string,
): boolean {
  const character = getCharacter(campaign, characterId);
  const attribute = ATTRIBUTES.find((entry) => entry.id === attributeId);
  const mastery = parseCommaList(
    String(systemCampaignData(campaign).crewUpgrades ?? ""),
  ).includes("mastery");
  const cap = mastery ? 4 : 3;
  if (
    systemOf(campaign).id !== "blades-in-the-dark" ||
    !character ||
    !canEdit(campaign, character) ||
    !attribute?.actions.includes(actionId) ||
    Number(character.data[`${attributeId}Xp`] ?? 0) < 6 ||
    (character.scores[actionId] ?? 0) >= cap
  )
    return false;
  campaign.doc.transact(() => {
    setScore(
      campaign,
      characterId,
      actionId,
      (character.scores[actionId] ?? 0) + 1,
    );
    setData(campaign, characterId, `${attributeId}Xp`, 0);
  });
  return true;
}

export function advanceCrew(campaign: Campaign, reward: string): boolean {
  const system = systemOf(campaign);
  if (system.id !== "blades-in-the-dark" || !campaign.isGm()) return false;
  const counterId = campaign.systemData.get("counter:crew-xp");
  const counter = campaign.chat.messages.value.find(
    (message) => message.id === counterId && message.kind === "counter",
  );
  if (!counter || counter.kind !== "counter") return false;
  const needed = counter.max ?? 10;
  const xp =
    getState<number>(campaign.messageState, counter.id, "value") ??
    counter.start;
  const state = systemCampaignData(campaign);
  const abilities = parseCommaList(String(state.crewAbilities ?? "")).filter(
    Boolean,
  );
  const allowed = system.campaignFields
    ?.find((field) => field.id === "crewAbilities")
    ?.options?.some((option) => option.id === reward);
  if (
    xp < needed ||
    (reward !== "upgrades" && (!allowed || abilities.includes(reward)))
  )
    return false;
  campaign.doc.transact(() => {
    if (reward === "upgrades")
      setSystemCampaignData(
        campaign,
        "crewUpgradePoints",
        Number(state.crewUpgradePoints ?? 0) + 2,
      );
    else
      setSystemCampaignData(
        campaign,
        "crewAbilities",
        formatCommaList([...abilities, reward]),
      );
    setState(campaign.messageState, counter.id, "value", 0);
    for (const character of listCharacters(campaign).filter(
      (entry) => entry.kind === "pc",
    ))
      setData(
        campaign,
        character.id,
        "stash",
        Number(character.data.stash ?? 0) + Number(state.crewTier ?? 0) + 2,
      );
  });
  return true;
}

export function buyCrewUpgrade(campaign: Campaign, upgrade: string): boolean {
  const system = systemOf(campaign);
  const allowed = system.campaignFields
    ?.find((field) => field.id === "crewUpgrades")
    ?.options?.some((option) => option.id === upgrade);
  const state = systemCampaignData(campaign);
  const owned = parseCommaList(String(state.crewUpgrades ?? "")).filter(
    Boolean,
  );
  const cost = upgrade === "mastery" ? 4 : upgrade === "cohort" ? 2 : 1;
  if (
    system.id !== "blades-in-the-dark" ||
    !campaign.isGm() ||
    !allowed ||
    owned.includes(upgrade) ||
    Number(state.crewUpgradePoints ?? 0) < cost
  )
    return false;
  campaign.doc.transact(() => {
    setSystemCampaignData(
      campaign,
      "crewUpgrades",
      formatCommaList([...owned, upgrade]),
    );
    setSystemCampaignData(
      campaign,
      "crewUpgradePoints",
      Number(state.crewUpgradePoints) - cost,
    );
  });
  return true;
}

export function crewTierCost(campaign: Campaign) {
  const state = systemCampaignData(campaign);
  const abilities = parseCommaList(String(state.crewAbilities ?? ""));
  return {
    rep: Math.max(
      6,
      12 -
        Number(state.crewTurf ?? 0) -
        (abilities.includes("fiends") ? Number(state.crewWanted ?? 0) : 0),
    ),
    coin:
      (Number(state.crewTier ?? 0) + 1) *
      (abilities.includes("patron") ? 4 : 8),
  };
}

export function advanceCrewTier(campaign: Campaign): boolean {
  if (systemOf(campaign).id !== "blades-in-the-dark" || !campaign.isGm())
    return false;
  const state = systemCampaignData(campaign);
  const cost = crewTierCost(campaign);
  const weak = state.crewHold === "weak";
  if (
    Number(state.crewRep ?? 0) < cost.rep ||
    (!weak &&
      (Number(state.crewCoin ?? 0) < cost.coin ||
        Number(state.crewTier ?? 0) >= 4))
  )
    return false;
  campaign.doc.transact(() => {
    setSystemCampaignData(campaign, "crewRep", 0);
    setSystemCampaignData(campaign, "crewHold", weak ? "strong" : "weak");
    if (!weak) {
      setSystemCampaignData(campaign, "crewTier", Number(state.crewTier) + 1);
      setSystemCampaignData(
        campaign,
        "crewCoin",
        Number(state.crewCoin) - cost.coin,
      );
    }
  });
  return true;
}
