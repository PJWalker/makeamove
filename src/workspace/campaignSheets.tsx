import type { Campaign } from "../campaign/campaign";
import { useExtension } from "./systemExtensions";

/** The campaign's system-wide controls, if its system has any. */
export function CampaignSystemSheet({ campaign }: { campaign: Campaign }) {
  const Sheet = useExtension(campaign.systemId).campaignSheet;
  return Sheet ? <Sheet campaign={campaign} /> : null;
}
