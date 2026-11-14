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

type Choice = { id: string; label: string };

/** The `<option>`s the crew doesn't own yet. */
function UnownedOptions({ options, owned }: { options: readonly Choice[]; owned: Set<string> }) {
  return options.flatMap((option) =>
    owned.has(option.id)
      ? []
      : [
          <option key={option.id} value={option.id}>
            {option.label}
          </option>,
        ],
  );
}

const UPGRADE_COSTS: Record<string, number> = { mastery: 4, cohort: 2 };

/** Whether the crew can pay for its next tier. */
function canAdvanceTier(state: Record<string, unknown>, cost: { rep: number; coin: number }) {
  if (Number(state.crewRep ?? 0) < cost.rep) return false;
  if (state.crewHold === "weak") return true;
  return Number(state.crewCoin ?? 0) >= cost.coin && Number(state.crewTier ?? 0) < 4;
}

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
  const ownedAbilityIds = new Set(commaListOf(state.crewAbilities));
  const ownedUpgradeIds = new Set(commaListOf(state.crewUpgrades));
  const cost = crewTierCost(campaign);
  const upgradeCost = UPGRADE_COSTS[upgrade] ?? 1;
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
          <UnownedOptions options={abilities} owned={ownedAbilityIds} />
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
          <UnownedOptions options={upgrades} owned={ownedUpgradeIds} />
        </select>
      </label>
      <Button
        disabled={!gm || !upgrade || Number(state.crewUpgradePoints ?? 0) < upgradeCost}
        onClick={() => ctx.execute(buyUpgrade, { upgrade })}
      >
        Buy Upgrade ({upgradeCost})
      </Button>
      <Button
        disabled={!gm || !canAdvanceTier(state, cost)}
        onClick={() => ctx.execute(advanceTier, undefined)}
      >
        {state.crewHold === "weak"
          ? `Strengthen hold (${cost.rep} rep)`
          : `Increase Tier (${cost.rep} rep, ${cost.coin} coin)`}
      </Button>
    </section>
  );
}
