import { store } from "../../lib/store";
import { useQuery } from "../../ui/useQuery";
import type { Campaign } from "../../campaign/campaign";
import { dataName } from "../../platform/dataEpoch";
import { getStorageItem, setStorageItem } from "../../platform/localStorage";
import { visibilityOf } from "./types";

/*
 * Unread chat: messages from other people that arrived after this device
 * last had the chat in view. The marker is a HLC stamp per campaign, kept
 * in localStorage (it's a per-device convenience, not shared state).
 */

const key = (campaignId: string) => dataName("chat-seen", campaignId);

function load(campaignId: string): string {
  return getStorageItem(key(campaignId)) ?? "";
}

const stamps = new Map<string, string>();
/** Bumped when a stamp changes, so the unread count recomputes. */
const version = store(0);

/** The last stamp seen in a campaign. */
function seenStamp(campaignId: string): string {
  if (!stamps.has(campaignId)) stamps.set(campaignId, load(campaignId));
  return stamps.get(campaignId)!;
}

/** How many messages in a campaign's chat this device hasn't seen. */
export function useUnreadCount(c: Campaign): number {
  const messages = useQuery(c.chat.messages);
  useQuery(version);
  const since = seenStamp(c.id);
  const me = c.device.value.id;
  const isGm = c.isGm();
  let n = 0;
  for (const m of messages) {
    if (
      m.hlc > since &&
      m.author !== me &&
      m.kind !== "system" &&
      visibilityOf(m, me, isGm) !== "hidden"
    )
      n++;
  }
  return n;
}

/** A campaign's chat is in view: everything up to now is read. */
export function markRead(c: Campaign) {
  const last = c.chat.messages.value.at(-1);
  if (!last || last.hlc <= seenStamp(c.id)) return;
  stamps.set(c.id, last.hlc);
  version.value++;
  setStorageItem(key(c.id), last.hlc);
}
