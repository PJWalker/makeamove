import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Campaign, createCampaign } from "../../../campaign/campaign";
import type { ActionDef } from "../../../systems/types";
import { claimSessionMove, sessionUseIds } from "../sessionMoves";

const action: ActionDef = {
  id: "once-per-session",
  name: "Once per session",
  category: "test",
  sessionUse: "character",
  trigger: "",
  text: { type: "doc", content: [] },
  steps: [],
};

describe("session move uses", () => {
  it("returns the used move ids as a typed snapshot", async () => {
    const campaign = await Campaign.open(await createCampaign("Test", "Gwen"));

    expect(sessionUseIds(campaign, "ayla", [action], [])).toEqual([]);
    claimSessionMove(campaign, "ayla", action, []);
    expect(sessionUseIds(campaign, "ayla", [action], [])).toEqual([action.id]);

    campaign.destroy();
  });
});
