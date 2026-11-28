import { store } from "../../lib/store";
import type { Campaign } from "../../campaign/campaign";
import { Shadow } from "./shadow";
import type { ShadowOptions, ShadowSource } from "./shadow";

/*
 * The GM shadow for an open campaign, on a GM device: none on a player's,
 * which has no vault to keep its memory in.
 */

/** Whose turn it is, as a line for the shadow. */
function turnLine(campaign: Campaign): string | null {
  const turn = campaign.combat.get("turn");
  if (!turn) return null;
  const name = campaign.combatants.get(turn)?.name ?? "someone";
  return `Combat, round ${String(campaign.combat.get("round"))}: ${name}'s turn`;
}

function sourceOf(campaign: Campaign): ShadowSource {
  const turn = store(turnLine(campaign));
  const close = campaign.combat.observe(() => {
    turn.value = turnLine(campaign);
  });
  return { gm: campaign.device.value.id, messages: campaign.chat.messages, turn, close };
}

/** The shadow for `campaign`, or null on a device that isn't the GM's. */
// eslint-disable-next-line import/prefer-default-export -- named, like the rest of the app's modules
export function shadowFor(campaign: Campaign, options?: ShadowOptions): Shadow | null {
  const vault = campaign.vault.value;
  if (!vault || !campaign.isGm()) return null;
  const shadow = new Shadow(sourceOf(campaign), vault.shadow, options);
  void shadow.check();
  void shadow.voice.check();
  return shadow;
}
