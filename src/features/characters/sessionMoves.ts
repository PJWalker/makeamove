import type { Campaign } from "../../campaign/campaign";
import { systemStore } from "../../campaign/systemStore";
import type { ChatMessage } from "../chat/types";
import { splitSessions } from "../chat/sessions";
import { getSystem } from "../../systems";
import type { ActionDef } from "../../systems/types";

/** Kept in the campaign's system data, under the system's own id. */
const usesOf = (campaign: Campaign) =>
  systemStore<true>(campaign.systemData, `${getSystem(campaign.systemId).id}:session-move-uses`);

function sessionUseKey(
  characterId: string,
  action: ActionDef,
  messages: ChatMessage[],
): string | undefined {
  if (!action.sessionUse) return undefined;
  const sessionId = splitSessions(messages).find((part) => part.current)?.key ?? "before";
  const owner = action.sessionUse === "campaign" ? "campaign" : characterId;
  return `${sessionId}/${action.id}/${owner}`;
}

export function sessionMoveUsed(
  campaign: Campaign,
  characterId: string,
  action: ActionDef,
  messages: ChatMessage[] = campaign.chat.messages.value,
): boolean {
  const key = sessionUseKey(characterId, action, messages);
  return !!key && usesOf(campaign).has(key);
}

export function claimSessionMove(
  campaign: Campaign,
  characterId: string,
  action: ActionDef,
  messages: ChatMessage[] = campaign.chat.messages.value,
): boolean {
  const key = sessionUseKey(characterId, action, messages);
  if (!key) return true;
  const uses = usesOf(campaign);
  let claimed = false;
  campaign.doc.transact(() => {
    if (uses.has(key)) return;
    uses.set(key, true);
    claimed = true;
  });
  return claimed;
}

export function sessionUseSnapshot(
  campaign: Campaign,
  characterId: string,
  actions: ActionDef[],
  messages: ChatMessage[],
): string {
  return JSON.stringify(
    actions
      .filter((action) => sessionMoveUsed(campaign, characterId, action, messages))
      .map((action) => action.id)
      .sort(),
  );
}
