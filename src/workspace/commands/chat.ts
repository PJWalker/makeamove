import { commandText, contentForCommand } from "../../features/chat/content";
import type { ChatContent } from "../../features/chat/content";
import {
  counterValue,
  isPinned,
  removeMessage,
  saveEdit,
  setCounter,
  setPinned,
  workTimer,
} from "../../features/chat/messages";
import type { TimerAction } from "../../features/chat/messages";
import { rerollDie, rerollMessage, toggleRollDie } from "../../features/chat/rollState";
import {
  addToRoll,
  ensureSystemCounter,
  markSession,
  postCounter,
  postPinned,
  postRoll,
  postText,
  postTimer,
} from "../../features/chat/send";
import {
  diceFormula,
  parseDuration,
  splitFormula,
  unquote,
  whisperTarget,
} from "../../features/chat/slash";
import { canDelete, canEditMessage, canWork } from "../../features/chat/types";
import type { ChatMessage, RollVisibility } from "../../features/chat/types";
import { seededDie } from "../../features/dice/notation";
import type { TrayPick } from "../../features/dice/pool";
import { systemOf } from "../../features/characters/api";
import {
  arrayOf,
  isBoolean,
  isNothing,
  isNumber,
  isObject,
  isString,
  objectOf,
  oneOf,
  optional,
} from "../../lib/guards";
import type { Availability } from "../../kernel/commands";
import { device } from "../../platform/device";
import { IconDelete, IconDice, IconPin, IconRename } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command } from "./types";
import type { AnyTableCommand, SlashForm } from "./types";

/*
 * The chat: what can be typed in it, and what can be done with messages once
 * they're sent. Sending isn't undone: everyone has already seen it.
 */

const isContent = (v: unknown): v is ChatContent => isObject(v);
const isVisibility = oneOf("public", "private");
const said = (typed: ChatContent, rest: string) => contentForCommand(typed, rest.trim());

const required =
  <P>(error: string, make: (rest: string, typed: ChatContent) => P) =>
  (rest: string, _: CampaignContext, typed: ChatContent): P | { error: string } =>
    rest.trim() ? make(rest, typed) : { error };

// Sending

export const say = command<{
  content: ChatContent;
  emote?: boolean | undefined;
  to?: string[] | undefined;
  toNames?: string[] | undefined;
}>({
  id: "chat.say",
  params: objectOf({
    content: isContent,
    emote: optional(isBoolean),
    to: optional(arrayOf(isString)),
    toNames: optional(arrayOf(isString)),
  }),
  title: "Send Message",
  undoGroup: false,
  slash: [
    {
      names: ["me"],
      usage: "/me draws her sword",
      help: "Describe what you do",
      parse: required("Describe what you do: /me …", (rest, typed) => ({
        content: said(typed, rest),
        emote: true,
      })),
    },
    {
      names: ["w", "whisper"],
      usage: "/w name message",
      help: "Whisper to one person (or “gm”)",
      parse: (rest, context, typed) => {
        if (!rest.trim()) return { error: "Whisper to whom? Try /w name message." };
        const target = whisperTarget(rest, context.campaign.memberViews());
        if (!target) return { error: `No one here is called “${rest.split(/\s/)[0]}”.` };
        if (!target.text) return { error: `What do you want to whisper to ${target.to[0]!.name}?` };
        return {
          content: said(typed, target.text),
          to: target.to.map((m) => m.id),
          toNames: target.to.map((m) => m.name),
        };
      },
    },
  ],
  run: ({ campaign }, { content, ...options }) => postText(campaign, content, options),
});

export const roll = command<
  {
    formula: string;
    visibility?: RollVisibility | undefined;
    comment?: string | undefined;
    seed?: string | undefined;
    messageId?: string | undefined;
  },
  Promise<ChatMessage>
>({
  id: "dice.roll",
  params: objectOf({
    formula: isString,
    visibility: optional(isVisibility),
    comment: optional(isString),
    seed: optional(isString),
    messageId: optional(isString),
  }),
  title: (_, { formula, visibility }) =>
    `${visibility === "private" ? "Secret Roll" : "Roll"} ${formula}`,
  aliases: ["dice"],
  icon: IconDice,
  undoGroup: false,
  slash: (["public", "private"] as const).map(
    (visibility): SlashForm<{ formula: string; visibility: RollVisibility; comment?: string }> => ({
      names: visibility === "public" ? ["r", "roll"] : ["sr"],
      usage: visibility === "public" ? "/r 2d6+1 note" : "/sr 2d6+1 note",
      help:
        visibility === "public"
          ? "Roll for everyone to see"
          : "Secret roll: only you and the GM see it",
      parse: (rest) => {
        const split = splitFormula(rest);
        return "error" in split ? split : { ...split, visibility };
      },
    }),
  ),
  run: ({ campaign }, { formula, visibility, comment, seed, messageId }) =>
    postRoll(
      campaign,
      formula,
      visibility ?? "public",
      comment,
      undefined,
      seed ? seededDie(seed) : undefined,
      messageId,
    ),
});

export const pinMessage = command<{ content: ChatContent }>({
  id: "chat.sendPinned",
  params: objectOf({ content: isContent }),
  title: "Send Pinned Message",
  undoGroup: false,
  slash: [
    {
      names: ["pin"],
      usage: "/pin message",
      help: "Send a message and pin it",
      parse: required("What should the pinned message say? /pin …", (rest, typed) => ({
        content: said(typed, rest),
      })),
    },
  ],
  run: ({ campaign }, { content }) => postPinned(campaign, content),
});

export const startTimer = command<{ seconds: number; label: string }>({
  id: "chat.timer",
  params: objectOf({ seconds: isNumber, label: isString }),
  title: "Start Timer",
  undoGroup: false,
  slash: [
    {
      names: ["timer"],
      usage: "/timer 60s World ends",
      help: "A pinned countdown, in seconds (s), minutes (m) or hours (h)",
      parse: (rest) => {
        const [first = "", ...words] = rest.trim().split(/\s+/);
        const seconds = parseDuration(first);
        if (!seconds) return { error: "How long? Try /timer 60s World ends." };
        return { seconds, label: unquote(words.join(" ")) };
      },
    },
  ],
  run: ({ campaign }, { seconds, label }) => postTimer(campaign, seconds, label),
});

export const startCounter = command<{ start: number; max?: number | undefined; label: string }>({
  id: "chat.counter",
  params: objectOf({ start: isNumber, max: optional(isNumber), label: isString }),
  title: "Start Counter",
  undoGroup: false,
  slash: [
    {
      names: ["count", "counter"],
      usage: "/count 0/8 The cops arrive",
      help: "A pinned counter to move by hand",
      parse: (rest) => {
        const m = /^(-?\d+)(?:\s*\/\s*(\d+))?\s*([\S\s]*)$/.exec(rest.trim());
        if (!m?.[1]) return { error: "Start where? Try /count 0/8 The cops arrive." };
        const max = m[2] === undefined ? undefined : +m[2];
        if (max !== undefined && max < 1) return { error: "Count up to 1 or more." };
        return { start: +m[1], ...(max === undefined ? {} : { max }), label: unquote(m[3] ?? "") };
      },
    },
    {
      names: ["clock"],
      usage: "/clock 8 The alarm sounds",
      help: "A pinned progress clock with the given number of segments",
      parse: (rest) => {
        const m = /^(\d+)\s+([\S\s]*)$/.exec(rest.trim());
        if (!m?.[1] || +m[1] < 1)
          return { error: "How many segments? Try /clock 8 The alarm sounds." };
        return { start: 0, max: +m[1], label: unquote(m[2] ?? "") };
      },
    },
  ],
  run: ({ campaign }, { start, max, label }) => postCounter(campaign, start, label, max),
});

export const session = command<{ action: "end" | "start" }>({
  id: "chat.session",
  params: objectOf({ action: oneOf("start", "end") }),
  title: (_, { action }) => (action === "start" ? "Start Session" : "End Session"),
  permission: "gm",
  undoGroup: false,
  slash: [
    {
      names: ["session"],
      usage: "/session start | end",
      help: "Mark the start or end of a session",
      parse: (rest) => {
        const action = rest.trim().toLowerCase();
        return action === "start" || action === "end"
          ? { action }
          : { error: "Use /session start or /session end." };
      },
    },
  ],
  run: ({ campaign }, { action }) => {
    markSession(campaign, action);
  },
});

export const chatHelp = command({
  id: "chat.help",
  params: isNothing,
  title: "Chat Commands",
  transact: false,
  slash: [{ names: ["help", "?"], usage: "/help", help: "List these commands", parse: () => {} }],
  run: (context) => {
    context.table.noteInChat(
      [
        "Commands:",
        ...slashForms(context).map(({ form }) => `${form.usage}  ${form.help}`),
        "Formulas: 2d6+1, 4d6kh3, 2d20kl1, d6!, 1d8+2[STR]",
      ].join("\n"),
    );
  },
});

/** Every way to type a command that this player may run, in the order registered. */
export function slashForms(context: CampaignContext) {
  return (context.commands.all() as AnyTableCommand[]).flatMap((command) =>
    (command.slash ?? []).flatMap((form: SlashForm<unknown>) =>
      permittedAtAll(context, command) ? [{ command, form }] : [],
    ),
  );
}

/** Slash commands are listed by who may run them at all; what's typed is checked when it runs. */
const permittedAtAll = (context: CampaignContext, command: AnyTableCommand) =>
  command.permission !== "gm" || context.isGm();

/** Slash commands whose names start with what's typed so far, for the hint list. */
export function suggestSlash(context: CampaignContext, input: string): SlashForm<unknown>[] {
  const m = /^\/(\S*)$/.exec(input);
  if (!m) return [];
  const typed = (m[1] ?? "").toLowerCase();
  return slashForms(context).flatMap(({ form }) =>
    form.names.some((n) => n.startsWith(typed)) ? [form] : [],
  );
}

/**
 * What the chat box makes of what's typed: plain text is a message, a
 * message that's nothing but a dice formula rolls it (with `visibility`),
 * a leading slash is a command, and `//text` sends text starting with a slash.
 */
export function chatCall(
  context: CampaignContext,
  typed: ChatContent,
  visibility: RollVisibility,
): { command: AnyTableCommand; params: unknown } | { error: string } {
  const text = commandText(typed).trim();
  if (!text.startsWith("/")) {
    const formula = diceFormula(text);
    return formula
      ? { command: roll, params: { formula, visibility } }
      : { command: say, params: { content: said(typed, text) } };
  }
  if (text.startsWith("//"))
    return { command: say, params: { content: said(typed, text.slice(1)) } };
  const m = /^\/(\S+)\s*([\S\s]*)$/.exec(text);
  if (!m?.[1]) return { error: "Enter a command name." };
  const name = m[1].toLowerCase();
  const found = slashForms(context).find(({ form }) => form.names.includes(name));
  if (!found) return { error: `There’s no /${name} command. Try /help.` };
  const parameters = found.form.parse(m[2] ?? "", context, typed);
  if (isObject<{ error?: unknown }>(parameters) && isString(parameters.error))
    return { error: parameters.error };
  return { command: found.command, params: parameters };
}

// Messages once sent

const isId = objectOf({ id: isString });
const message = (context: CampaignContext, id: string): ChatMessage | undefined =>
  context.campaign.chat.messages.value.find((m) => m.id === id);
const me = () => device.value.id;
/** Whether the player may work a message's controls: its dice, timer or counter. */
const works = (context: CampaignContext, { id }: { id: string }): Availability => {
  const m = message(context, id);
  return (!!m && canWork(m, me(), context.isGm())) || "Not yours to change";
};
const ownMessage = (context: CampaignContext, { id }: { id: string }): Availability => {
  const m = message(context, id);
  return (!!m && canEditMessage(m, me())) || "Not your message";
};
const systemCounter = (context: CampaignContext, id: string) =>
  systemOf(context.campaign).counters?.find((c) => c.id === id);

export const editMessage = command<{ id: string }>({
  id: "message.edit",
  params: isId,
  title: "Edit Message",
  icon: IconRename,
  section: "edit",
  transact: false,
  permission: ownMessage,
  menu: { chatMessage: (_, { id }) => [{ params: { id } }] },
  run: (context, { id }) => {
    context.table.editingMessage.set(id);
  },
});

export const saveMessageEdit = command<{ id: string; content: ChatContent }>({
  id: "message.saveEdit",
  params: objectOf({ id: isString, content: isContent }),
  title: "Save Edit",
  permission: ownMessage,
  run: ({ campaign }, { id, content }) => {
    saveEdit(campaign, id, content);
  },
});

export const pinChatMessage = command<{ id: string; pinned: boolean }>({
  id: "message.pin",
  params: objectOf({ id: isString, pinned: isBoolean }),
  title: (_, { pinned }) => (pinned ? "Pin Message" : "Unpin Message"),
  icon: IconPin,
  section: "act",
  permission: (context, { id }) =>
    (context.isGm() && message(context, id)?.kind !== "system") || "Only the GM pins messages",
  menu: {
    chatMessage: (context, { id }) => [{ params: { id, pinned: !isPinned(context.campaign, id) } }],
  },
  run: ({ campaign }, { id, pinned }) => {
    setPinned(campaign, id, pinned);
  },
});

export const deleteMessage = command<{ id: string }>({
  id: "message.delete",
  params: isId,
  title: "Delete Message",
  icon: IconDelete,
  danger: true,
  section: "delete",
  permission: (context, { id }) => {
    const m = message(context, id);
    return (!!m && canDelete(m, me(), context.isGm())) || "Not your message";
  },
  undoGroup: false,
  menu: { chatMessage: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => {
    removeMessage(campaign, id);
  },
});

export const timerControl = command<{ id: string; action: TimerAction }>({
  id: "message.timer",
  params: objectOf({ id: isString, action: oneOf("restart", "stop", "resume") }),
  title: (_, { action }) => ({ restart: "Restart", stop: "Stop", resume: "Resume" })[action],
  permission: works,
  run: (context, { id, action }) => {
    const m = message(context, id);
    if (m?.kind === "timer") workTimer(context.campaign, m, action);
  },
});

export const setCounterValue = command<{ id: string; value: number }>({
  id: "message.setCounter",
  params: objectOf({ id: isString, value: isNumber }),
  title: "Change Counter",
  permission: works,
  undoGroup: ({ id }) => `counter ${id}`,
  run: (context, { id, value }) => {
    const m = message(context, id);
    if (m?.kind === "counter") setCounter(context.campaign, m, value);
  },
});

/** A system's own count (Blades' crew XP): shown as a pinned counter, made the first time. */
export const showSystemCounter = command<{ counter: string }>({
  id: "systemCounter.show",
  params: objectOf({ counter: isString }),
  title: (context, { counter }) => `Show ${systemCounter(context, counter)?.label ?? "Counter"}`,
  aliases: ["count"],
  source: (context) => systemOf(context.campaign).name,
  permission: "gm",
  undoGroup: false,
  offers: (context) =>
    (systemOf(context.campaign).counters ?? []).map((c) => ({
      params: { counter: c.id },
      aliases: [c.label.toLowerCase()],
    })),
  run: (context, { counter }) => {
    const def = systemCounter(context, counter);
    return def && ensureSystemCounter(context.campaign, def);
  },
});

/** Move a system's own count by some amount, making its counter first if need be. */
export const bumpSystemCounter = command<{ counter: string; by: number }>({
  id: "systemCounter.bump",
  params: objectOf({ counter: isString, by: isNumber }),
  title: "Change Counter",
  permission: "gm",
  undoGroup: false,
  run: async (context, { counter, by }) => {
    const def = systemCounter(context, counter);
    const m = def && (await ensureSystemCounter(context.campaign, def));
    if (m?.kind === "counter")
      setCounter(context.campaign, m, counterValue(context.campaign, m) + by);
  },
});

const rollOf = (context: CampaignContext, id: string) => {
  const m = message(context, id);
  return (m?.kind === "roll" || m?.kind === "move") && m.roll ? m.roll : undefined;
};

/** Reroll a die of a roll in the chat, or with no die, all of it. Rerolls are rolls, so aren't undone. */
export const reroll = command<{ id: string; term?: number | undefined; die?: number | undefined }>({
  id: "roll.reroll",
  params: objectOf({ id: isString, term: optional(isNumber), die: optional(isNumber) }),
  title: (_, { die }) => (die === undefined ? "Reroll All" : "Reroll"),
  permission: works,
  undoGroup: false,
  menu: { chatMessage: (context, { id }) => (rollOf(context, id) ? [{ params: { id } }] : []) },
  run: (context, { id, term, die }) => {
    const source = rollOf(context, id);
    if (!source) return;
    if (term === undefined || die === undefined)
      rerollMessage(context.campaign.messageState, id, source);
    else rerollDie(context.campaign.messageState, id, source, term, die);
  },
});

export const toggleDie = command<{ id: string; term: number; die: number }>({
  id: "roll.toggleDie",
  params: objectOf({ id: isString, term: isNumber, die: isNumber }),
  title: "Keep or Drop Die",
  permission: works,
  run: (context, { id, term, die }) => {
    const source = rollOf(context, id);
    if (source) toggleRollDie(context.campaign.messageState, id, source, term, die);
  },
});

/** Add a die or a modifier to a roll in the chat. */
export const addToChatRoll = command<{ id: string; pick: TrayPick }>({
  id: "roll.add",
  params: objectOf({ id: isString, pick: (v): v is TrayPick => isObject(v) }),
  title: "Add to Roll",
  permission: works,
  undoGroup: false,
  run: ({ campaign }, { id, pick }) => {
    addToRoll(campaign, id, pick);
  },
});

export const chatCommands = [
  say,
  roll,
  pinMessage,
  startTimer,
  startCounter,
  session,
  chatHelp,
  editMessage,
  saveMessageEdit,
  pinChatMessage,
  deleteMessage,
  timerControl,
  setCounterValue,
  showSystemCounter,
  bumpSystemCounter,
  reroll,
  toggleDie,
  addToChatRoll,
];
