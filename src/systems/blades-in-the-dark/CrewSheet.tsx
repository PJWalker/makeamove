import { useState } from "react";
import { commaListOf } from "../../lib/list";
import { systemOf } from "../../features/characters/api";
import { getState } from "../../features/chat/messageState";
import { systemCampaignData, type Campaign } from "../../campaign/campaign";
import { useQuery } from "../../ui/useQuery";
import { Button } from "../../ui/Button";
import { Counter } from "../../workspace/sheetParts";
import { crewTierCost } from "./progression";
import { advanceCrew, advanceTier, buyUpgrade } from "./commands";
import { useCampaign } from "../../workspace/campaignContext";
import { bumpSystemCounter } from "../../workspace/commands/chat";
import { can } from "../../workspace/commands/views";

export function BladesCrewControls({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const [reward, setReward] = useState("upgrades");
  const [upgrade, setUpgrade] = useState("");
  const system = systemOf(campaign);
  const state = useQuery(campaign.systemData, () => systemCampaignData(campaign));
  const counter = system.counters?.find((entry) => entry.id === "crew-xp");
  const abilities = system.campaignFields?.find((field) => field.id === "crewAbilities")?.options;
  const upgrades = system.campaignFields?.find((field) => field.id === "crewUpgrades")?.options;
  const messageId = String(campaign.systemData.value("counter:crew-xp") ?? "");
  const xp = useQuery(
    campaign.messageState,
    () => getState<number>(campaign.messageState, messageId, "value") ?? 0,
  );
  if (!counter || !abilities || !upgrades) return null;
  const ownedAbilities = commaListOf(state.crewAbilities);
  const ownedUpgrades = commaListOf(state.crewUpgrades);
  const ownedAbilityIds = new Set(ownedAbilities);
  const ownedUpgradeIds = new Set(ownedUpgrades);
  const cost = crewTierCost(campaign);
  const upgradeCost = upgrade === "mastery" ? 4 : upgrade === "cohort" ? 2 : 1;
  // The crew is the GM's to advance.
  const gm = can(ctx, advanceTier, undefined);
  return (
    <section className="dialog-section" aria-label="Crew advancement">
      <h3 className="dialog-heading">Crew advancement</h3>
      <Counter
        label="Crew XP"
        value={xp}
        max={counter.max}
        disabled={!gm}
        onChange={(by) => void ctx.execute(bumpSystemCounter, { counter: counter.id, by })}
      />
      <label className="field">
        Crew advance
        <select
          disabled={!gm}
          value={reward}
          onChange={(event) => setReward(event.currentTarget.value)}
        >
          <option value="upgrades">Two crew upgrades</option>
          {abilities.flatMap((ability) =>
            ownedAbilityIds.has(ability.id)
              ? []
              : [
                  <option key={ability.id} value={ability.id}>
                    {ability.label}
                  </option>,
                ],
          )}
        </select>
      </label>
      <Button
        disabled={!gm || xp < (counter.max ?? 10)}
        onClick={() => ctx.execute(advanceCrew, { reward })}
      >
        Advance Crew
      </Button>
      <label className="field">
        Upgrade ({state.crewUpgradePoints} unspent)
        <select
          disabled={!gm}
          value={upgrade}
          onChange={(event) => setUpgrade(event.currentTarget.value)}
        >
          <option value="">Choose an upgrade</option>
          {upgrades.flatMap((entry) =>
            ownedUpgradeIds.has(entry.id)
              ? []
              : [
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>,
                ],
          )}
        </select>
      </label>
      <Button
        disabled={!gm || !upgrade || Number(state.crewUpgradePoints ?? 0) < upgradeCost}
        onClick={() => ctx.execute(buyUpgrade, { upgrade })}
      >
        Buy Upgrade ({upgradeCost})
      </Button>
      <Button
        disabled={
          !gm ||
          Number(state.crewRep ?? 0) < cost.rep ||
          (state.crewHold !== "weak" &&
            (Number(state.crewCoin ?? 0) < cost.coin || Number(state.crewTier ?? 0) >= 4))
        }
        onClick={() => ctx.execute(advanceTier, undefined)}
      >
        {state.crewHold === "weak"
          ? `Strengthen hold (${cost.rep} rep)`
          : `Increase Tier (${cost.rep} rep, ${cost.coin} coin)`}
      </Button>
    </section>
  );
}
