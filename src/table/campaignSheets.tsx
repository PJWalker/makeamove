import type { Campaign } from "../campaign/campaign";
import { extensionOf } from "../systems/extensions";

/** The campaign's system-wide controls, if its system has any. */
export function CampaignSystemSheet({ campaign }: { campaign: Campaign }) {
  const Sheet = extensionOf(String(campaign.meta.get("systemId"))).campaignSheet;
  return Sheet ? <Sheet campaign={campaign} /> : null;
}
