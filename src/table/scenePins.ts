import { parseLink } from "../features/notes/links";
import { linkTarget } from "../features/notes/targets";
import { watch } from "../lib/store";
import type SceneController from "../scene/controller";
import type { PinRequest } from "../scene/gestures/types";
import type { CampaignContext } from "../workspace/campaignContext";

/**
 * How map pins reach the table: what each leads to on this device (redrawn
 * as pages, characters and scenes change, and as the GM vault arrives),
 * following its link when clicked, and asking what a new one leads to.
 * Returns the function that takes it all down again.
 */
export default function bindPins(
  context: CampaignContext,
  ctl: SceneController,
  onRequest: (request: PinRequest) => void,
): () => void {
  const { campaign } = context;
  ctl.renderer.setPinTargets((link) => linkTarget(campaign, link));
  ctl.onPinClick = (pin) => {
    const { kind, id } = parseLink(pin.link);
    context.links.followLink(kind, id);
  };
  ctl.onPinRequest = onRequest;
  const redraw = () => {
    ctl.renderer.invalidate();
  };
  let vault = campaign.vault.value;
  campaign.doc.on("update", redraw);
  vault?.doc.on("update", redraw);
  const stopWatchingVault = watch([campaign.vault], () => {
    vault?.doc.off("update", redraw);
    vault = campaign.vault.value;
    vault?.doc.on("update", redraw);
    redraw();
  });
  return () => {
    campaign.doc.off("update", redraw);
    vault?.doc.off("update", redraw);
    stopWatchingVault();
    ctl.onPinClick = null;
    ctl.onPinRequest = null;
  };
}
