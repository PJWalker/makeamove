import { useState } from "react";
import { commaListOf } from "../../lib/list";
import { systemOf } from "../../features/characters/api";
import { getState, setState } from "../../features/chat/messageState";
import { ensureSystemCounter } from "../../features/chat/send";
import { systemCampaignData, type Campaign } from "../../campaign/campaign";
import { useY } from "../../ui/useY";
import { Button } from "../../ui/Button";
import { Counter } from "../../table/sheetParts";
import { advanceCrew, advanceCrewTier, buyCrewUpgrade, crewTierCost } from "./progression";

export function BladesCrewControls({ campaign }: { campaign: Campaign }) {
  const [reward, setReward] = useState("upgrades");
  const [upgrade, setUpgrade] = useState("");
  const system = systemOf(campaign);
  const state = useY(campaign.systemData, () => systemCampaignData(campaign));
  const counter = system.counters!.find((entry) => entry.id === "crew-xp")!;
  const messageId = String(campaign.systemData.get("counter:crew-xp") ?? "");
  const xp = useY(
    campaign.messageState,
    () => getState<number>(campaign.messageState, messageId, "value") ?? 0,
  );
  const abilities = system.campaignFields!.find((field) => field.id === "crewAbilities")!.options!;
  const upgrades = system.campaignFields!.find((field) => field.id === "crewUpgrades")!.options!;
  const ownedAbilities = commaListOf(state.crewAbilities);
  const ownedUpgrades = commaListOf(state.crewUpgrades);
  const cost = crewTierCost(campaign);
  const upgradeCost = upgrade === "mastery" ? 4 : upgrade === "cohort" ? 2 : 1;
  const gm = campaign.isGm();
  return (
    <section className="dialog-section" aria-label="Crew advancement">
      <h3 className="dialog-heading">Crew advancement</h3>
      <Counter
        label="Crew XP"
        value={xp}
        max={counter.max}
        disabled={!gm}
        onChange={(by) => {
          void ensureSystemCounter(campaign, counter).then((message) => {
            if (message && campaign.isGm())
              setState(
                campaign.messageState,
                message.id,
                "value",
                Math.max(
                  0,
                  Math.min(
                    counter.max ?? Infinity,
                    (getState<number>(campaign.messageState, message.id, "value") ?? 0) + by,
                  ),
                ),
              );
          });
        }}
      />
      <label className="field">
        Crew advance
        <select
          disabled={!gm}
          value={reward}
          onChange={(event) => setReward(event.currentTarget.value)}
        >
          <option value="upgrades">Two crew upgrades</option>
          {abilities
            .filter((ability) => !ownedAbilities.includes(ability.id))
            .map((ability) => (
              <option key={ability.id} value={ability.id}>
                {ability.label}
              </option>
            ))}
        </select>
      </label>
      <Button
        disabled={!gm || xp < (counter.max ?? 10)}
        onClick={() => advanceCrew(campaign, reward)}
      >
        Advance crew
      </Button>
      <label className="field">
        Upgrade ({state.crewUpgradePoints} unspent)
        <select
          disabled={!gm}
          value={upgrade}
          onChange={(event) => setUpgrade(event.currentTarget.value)}
        >
          <option value="">Choose an upgrade</option>
          {upgrades
            .filter((entry) => !ownedUpgrades.includes(entry.id))
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
        </select>
      </label>
      <Button
        disabled={!gm || !upgrade || Number(state.crewUpgradePoints ?? 0) < upgradeCost}
        onClick={() => buyCrewUpgrade(campaign, upgrade)}
      >
        Buy upgrade ({upgradeCost})
      </Button>
      <Button
        disabled={
          !gm ||
          Number(state.crewRep ?? 0) < cost.rep ||
          (state.crewHold !== "weak" &&
            (Number(state.crewCoin ?? 0) < cost.coin || Number(state.crewTier ?? 0) >= 4))
        }
        onClick={() => advanceCrewTier(campaign)}
      >
        {state.crewHold === "weak"
          ? `Strengthen hold (${cost.rep} rep)`
          : `Increase Tier (${cost.rep} rep, ${cost.coin} coin)`}
      </Button>
    </section>
  );
}
