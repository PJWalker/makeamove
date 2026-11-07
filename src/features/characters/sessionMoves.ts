import * as Y from "yjs";
import type { Campaign } from "../../campaign/campaign";
import type { ChatMessage } from "../chat/types";
import { splitSessions } from "../chat/sessions";
import type { ActionDef } from "../../systems/types";

const usesKey = "dungeon-world-2:session-move-uses";

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

function usesMap(campaign: Campaign, create: boolean): Y.Map<true> | undefined {
  let uses = campaign.systemData.get(usesKey) as Y.Map<true> | undefined;
  if (!(uses instanceof Y.Map) && create) {
    uses = new Y.Map<true>();
    campaign.systemData.set(usesKey, uses);
  }
  return uses instanceof Y.Map ? uses : undefined;
}

export function sessionMoveUsed(
  campaign: Campaign,
  characterId: string,
  action: ActionDef,
  messages: ChatMessage[] = campaign.chat.messages.value,
): boolean {
  const key = sessionUseKey(characterId, action, messages);
  return !!key && !!usesMap(campaign, false)?.has(key);
}

export function claimSessionMove(
  campaign: Campaign,
  characterId: string,
  action: ActionDef,
  messages: ChatMessage[] = campaign.chat.messages.value,
): boolean {
  const key = sessionUseKey(characterId, action, messages);
  if (!key) return true;
  const uses = usesMap(campaign, true);
  if (!uses) return false;
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