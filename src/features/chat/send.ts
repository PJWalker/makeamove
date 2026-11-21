import { roll } from "../dice/notation";
import { makeSessionPage } from "../notes/sessions";
import { setPinned } from "./messages";
import { addRollDie, addRollModifier } from "./rollState";
import type { TrayPick } from "../dice/pool";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import type { ChatContent } from "./content";
import {
  canWork,
  type ChatMessage,
  type RollMessage,
  type RollVisibility,
  type TextMessage,
} from "./types";
import type { SystemCounterDef } from "../../systems/types";
import { getSystem } from "../../systems";
import { isString } from "../../lib/guards";

/** This device's name in the campaign, as other players see it. */
export function myName(campaign: Campaign): string {
  return campaign.members.get(device.value.id)?.get("name") ?? (device.value.name || "Player");
}

const me = (campaign: Campaign) => ({ id: device.value.id, name: myName(campaign) });

export function postText(
  campaign: Campaign,
  content: ChatContent,
  { emote, to, toNames }: { [K in "emote" | "to" | "toNames"]?: TextMessage[K] | undefined } = {},
) {
  return campaign.chat.post(
    {
      kind: "text",
      text: content,
      ...(emote ? { emote } : {}),
      ...(to ? { to } : {}),
      ...(toNames ? { toNames } : {}),
    },
    me(campaign),
  );
}

/** Create a system-owned count once; its live value remains the core counter card state. */
export async function ensureSystemCounter(campaign: Campaign, counter: SystemCounterDef) {
  const field = `counter:${counter.id}`;
  const stored = campaign.systemData.value(field);
  const id = isString(stored) ? stored : undefined;
  const existing = campaign.chat.messages.value.find(
    (message) =>
      message.kind === "counter" && (message.id === id || message.systemCounter === counter.id),
  );
  if (existing) {
    if (existing.id !== id) campaign.systemData.setValue(field, existing.id);
    return existing;
  }
  const system = getSystem(campaign.systemId);
  if (!system.counters?.some((candidate) => candidate.id === counter.id)) return;
  const message = await pinWhenPosted(
    campaign,
    campaign.chat.post(
      {
        kind: "counter",
        label: counter.label,
        start: counter.start,
        ...(counter.max === undefined ? {} : { max: counter.max }),
        systemCounter: counter.id,
      },
      me(campaign),
    ),
  );
  campaign.systemData.setValue(field, message.id);
  return message;
}

/** Adds a new die or a modifier to a roll in the chat, if it's one this device may change. */
export function addToRoll(campaign: Campaign, messageId: string, pick: TrayPick) {
  const message = campaign.chat.messages.value.find((candidate) => candidate.id === messageId);
  if (!message || (message.kind !== "roll" && message.kind !== "move") || !message.roll) return;
  if (!canWork(message, device.value.id, campaign.isGm())) return;
  if (pick.kind === "die") addRollDie(campaign.messageState, messageId, message.roll, pick.sides);
  else
    addRollModifier(
      campaign.messageState,
      messageId,
      message.roll,
      pick.value,
      pick.kind === "stat" ? pick.stat : undefined,
    );
}

/** Roll a formula and post the result. Throws NotationError for bad formulas. */
export function postRoll(
  campaign: Campaign,
  formula: string,
  visibility: RollVisibility,
  comment?: string,
  damage?: RollMessage["damage"],
  die?: (sides: number) => number,
  messageId?: string,
) {
  const r = roll(formula, die);
  return campaign.chat.post(
    {
      kind: "roll",
      roll: r,
      visibility,
      ...(comment ? { comment } : {}),
      ...(damage ? { damage } : {}),
    },
    me(campaign),
    messageId,
  );
}

/** Pin a message once it's posted. */
async function pinWhenPosted<M extends ChatMessage>(campaign: Campaign, posting: Promise<M>) {
  const m = await posting;
  setPinned(campaign, m.id, true);
  return m;
}

/** Post a message and pin it. */
export function postPinned(campaign: Campaign, content: ChatContent) {
  return pinWhenPosted(campaign, postText(campaign, content));
}

/** A pinned countdown. */
export function postTimer(campaign: Campaign, seconds: number, label: string) {
  return pinWhenPosted(
    campaign,
    campaign.chat.post(
      { kind: "timer", label, seconds, endsAt: Date.now() + seconds * 1000 },
      me(campaign),
    ),
  );
}

/** A pinned counter, moved by hand; with a maximum, a clock. */
export function postCounter(campaign: Campaign, start: number, label: string, max?: number) {
  return pinWhenPosted(
    campaign,
    campaign.chat.post(
      { kind: "counter", label, start, ...(max === undefined ? {} : { max }) },
      me(campaign),
    ),
  );
}

/** Mark the start or end of a session. Sessions are numbered in the campaign itself, so every peer agrees. */
export function markSession(campaign: Campaign, action: "start" | "end") {
  const count = campaign.meta.get("sessions");
  const session = action === "start" ? count + 1 : count;
  if (action === "start") campaign.meta.set("sessions", session);
  void campaign.chat.post(
    {
      kind: "system",
      text: action === "start" ? `Session ${session} begins` : `Session ${session} ends`,
      event: action === "start" ? "session-start" : "session-end",
      session,
    },
    me(campaign),
  );
  // Its page in the Sessions folder, ready for notes.
  if (action === "start") void makeSessionPage(campaign, session);
}
