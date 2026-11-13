import type { Campaign } from "../../campaign/campaign";
import type { ChatContent } from "./content";
import { clearState, getState, setState } from "./messageState";
import type { CounterMessage, TimerMessage } from "./types";

/*
 * Changes to messages after they're sent. Messages themselves never change,
 * so these are kept in the campaign's message state (messageState.ts).
 */

export function saveEdit(campaign: Campaign, id: string, text: ChatContent) {
  campaign.transact(() => {
    setState(campaign.messageState, id, "text", text);
    setState(campaign.messageState, id, "editedAt", Date.now());
  });
}

export const isPinned = (campaign: Campaign, id: string) =>
  !!getState<boolean>(campaign.messageState, id, "pinned");

export const setPinned = (campaign: Campaign, id: string, on: boolean) =>
  setState(campaign.messageState, id, "pinned", on || undefined);

/** Delete a message and whatever was recorded about it. */
export function removeMessage(campaign: Campaign, id: string) {
  campaign.transact(() => {
    campaign.chat.remove(id);
    clearState(campaign.messageState, id);
  });
}

export type TimerAction = "restart" | "stop" | "resume";

export function workTimer(campaign: Campaign, m: TimerMessage, action: TimerAction) {
  const state = campaign.messageState;
  const now = Date.now();
  campaign.transact(() => {
    if (action === "stop") return setState(state, m.id, "stoppedAt", now);
    const endsAt = getState<number>(state, m.id, "endsAt") ?? m.endsAt;
    const stoppedAt = getState<number>(state, m.id, "stoppedAt");
    // Resuming carries on from where it was stopped.
    const next =
      action === "restart" || !stoppedAt ? now + m.seconds * 1000 : now + (endsAt - stoppedAt);
    setState(state, m.id, "endsAt", next);
    setState(state, m.id, "stoppedAt", undefined);
  });
}

/** A counter card's value. */
export const counterValue = (campaign: Campaign, m: Pick<CounterMessage, "id" | "start">) =>
  getState<number>(campaign.messageState, m.id, "value") ?? m.start;

/** Set a counter card's value: within 0 and its maximum, if it has one. */
export function setCounter(
  campaign: Campaign,
  m: Pick<CounterMessage, "id" | "max">,
  value: number,
) {
  setState(
    campaign.messageState,
    m.id,
    "value",
    m.max !== undefined ? Math.min(m.max, Math.max(0, value)) : value,
  );
}
