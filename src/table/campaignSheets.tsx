import type { ComponentType } from "react";
import type { Campaign } from "../campaign/campaign";
import { BladesCrewControls } from "../systems/blades-in-the-dark/CrewSheet";

const SHEETS: Record<string, ComponentType<{ campaign: Campaign }>> = {
  "blades-in-the-dark": BladesCrewControls,
};

export function CampaignSystemSheet({ campaign }: { campaign: Campaign }) {
  const Sheet = SHEETS[String(campaign.meta.get("systemId"))];
  return Sheet ? <Sheet campaign={campaign} /> : null;
}
