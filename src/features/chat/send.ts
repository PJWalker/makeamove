import { roll } from "../dice/notation";
import { makeSessionPage } from "../notes/sessions";
import { setState } from "./messageState";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import type { Command } from "./commands";
import { contentForCommand, contentFromText, type ChatContent } from "./content";
import type { RollMessage, RollVisibility, TextMessage } from "./types";
import type { SystemCounterDef } from "../../systems/types";
import { getSystem } from "../../systems";

/** This device's name in the campaign, as other players see it. */
export function myName(campaign: Campaign): string {
  return campaign.members.get(device.value.id)?.get("name") ?? (device.value.name || "Player");
}

const me = (campaign: Campaign) => ({ id: device.value.id, name: myName(campaign) });

function messageContent(content: ChatContent | undefined, text: string): ChatContent {
  return content ? contentForCommand(content, text) : contentFromText(text);
}

export function postText(
  campaign: Campaign,
  content: ChatContent,
  options: Pick<TextMessage, "emote" | "to" | "toNames"> = {},
) {
  return campaign.chat.post({ kind: "text", text: content, ...options }, me(campaign));
}

/** Create a system-owned count once; its live value remains the core counter card state. */
export async function ensureSystemCounter(campaign: Campaign, counter: SystemCounterDef) {
  if (!campaign.isGm()) return undefined;
  const field = `counter:${counter.id}`;
  const id = campaign.systemData.get(field) as string | undefined;
  const existing = campaign.chat.messages.value.find(
    (message) =>
      message.kind === "counter" && (message.id === id || message.systemCounter === counter.id),
  );
  if (existing) {
    if (existing.id !== id) campaign.systemData.set(field, existing.id);
    return existing;
  }
  const system = getSystem(campaign.meta.get("systemId"));
  if (!system.counters?.some((candidate) => candidate.id === counter.id)) return undefined;
  const message = await campaign.chat.post(
    {
      kind: "counter",
      label: counter.label,
      start: counter.start,
      ...(counter.max !== undefined ? { max: counter.max } : {}),
      systemCounter: counter.id,
    },
    me(campaign),
  );
  campaign.systemData.set(field, message.id);
  setState(campaign.messageState, message.id, "pinned", true);
  return message;
}

/** Roll a formula and post the result. Throws NotationError for bad formulas. */
export function postRoll(
  campaign: Campaign,
  formula: string,
  visibility: RollVisibility,
  comment?: string,
  damage?: RollMessage["damage"],
) {
  const r = roll(formula);
  return campaign.chat.post(
    {
      kind: "roll",
      roll: r,
      visibility,
      ...(comment ? { comment } : {}),
      ...(damage ? { damage } : {}),
    },
    me(campaign),
  );
}

/**
 * Carry out a chat command. Returns false for commands that only show
 * something locally (help, errors), which the panel handles itself.
 */
export function runCommand(campaign: Campaign, cmd: Command, content?: ChatContent): boolean {
  const author = me(campaign);
  switch (cmd.kind) {
    case "text":
      if (cmd.text) postText(campaign, messageContent(content, cmd.text));
      return true;
    case "emote":
      postText(campaign, messageContent(content, cmd.text), { emote: true });
      return true;
    case "whisper":
      postText(campaign, messageContent(content, cmd.text), {
        to: cmd.to.map((m) => m.id),
        toNames: cmd.to.map((m) => m.name),
      });
      return true;
    case "roll":
      postRoll(campaign, cmd.formula, cmd.visibility, cmd.comment);
      return true;
    case "pin":
      void postText(campaign, messageContent(content, cmd.text)).then((m) =>
        setState(campaign.messageState, m.id, "pinned", true),
      );
      return true;
    case "timer":
      void campaign.chat
        .post(
          {
            kind: "timer",
            label: cmd.label,
            seconds: cmd.seconds,
            endsAt: Date.now() + cmd.seconds * 1000,
          },
          author,
        )
        .then((m) => setState(campaign.messageState, m.id, "pinned", true));
      return true;
    case "counter":
      void campaign.chat
        .post(
          {
            kind: "counter",
            label: cmd.label,
            start: cmd.start,
            ...(cmd.max !== undefined ? { max: cmd.max } : {}),
          },
          author,
        )
        .then((m) => setState(campaign.messageState, m.id, "pinned", true));
      return true;
    case "session": {
      // Sessions are numbered in the campaign itself, so every peer agrees.
      const count: number = campaign.meta.get("sessions") ?? 0;
      const session = cmd.action === "start" ? count + 1 : count;
      if (cmd.action === "start") campaign.meta.set("sessions", session);
      campaign.chat.post(
        {
          kind: "system",
          text: cmd.action === "start" ? `Session ${session} begins` : `Session ${session} ends`,
          event: cmd.action === "start" ? "session-start" : "session-end",
          session,
        },
        author,
      );
      // Its page in the Sessions folder, ready for notes.
      if (cmd.action === "start") void makeSessionPage(campaign, session);
      return true;
    }
    default:
      return false;
  }
}
