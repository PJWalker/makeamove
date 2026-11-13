import { describe, expect, it, vi } from "vite-plus/test";
import { chatCall, chatCommands, suggestSlash } from "../../../workspace/commands/chat";
import type { CampaignContext } from "../../../workspace/campaignContext";
import { commandText, contentFromText, type ChatContent } from "../content";
import { diceFormula, parseDuration, splitFormula } from "../slash";

vi.mock("../../../ui/icons", () => ({
  IconDelete: () => null,
  IconDice: () => null,
  IconPin: () => null,
  IconRename: () => null,
}));

const members = [
  { id: "g", name: "Gwen", role: "gm" },
  { id: "r", name: "Robin", role: "player" },
  { id: "rh", name: "Robin Hood", role: "player" },
];

const context = (gm = false) =>
  ({
    campaign: { memberViews: () => members },
    commands: { all: () => chatCommands },
    isGm: () => gm,
  }) as unknown as CampaignContext;

const parseCommand = (text: string, gm = false) =>
  chatCall(context(gm), contentFromText(text), "public");

function expectCall(
  text: string,
  commandId: string,
  params: Record<string, unknown> = {},
  gm = false,
) {
  const result = parseCommand(text, gm);
  if ("error" in result) throw new Error(result.error);
  expect(result.command.id).toBe(commandId);
  expect(result.params).toMatchObject(params);
  return result;
}

const sentText = (params: unknown) => commandText((params as { content: ChatContent }).content);

describe("commands", () => {
  it("sends plain text, and // escapes a slash", () => {
    expect(sentText(expectCall(" hello ", "chat.say").params)).toBe("hello");
    expect(sentText(expectCall("//shrug", "chat.say").params)).toBe("/shrug");
  });
  it("rolls a bare formula without /r, but leaves ordinary text alone", () => {
    expectCall(" 2d6+1 ", "dice.roll", { formula: "2d6+1", visibility: "public" });
    expectCall("4d6kh3 + 1d8[STR]", "dice.roll", { formula: "4d6kh3 + 1d8[STR]" });
    for (const text of ["3", "2 + 2", "d20 time", "dd", "D&D tonight?", "roll 2d6"]) {
      expect(sentText(expectCall(text, "chat.say").params)).toBe(text);
    }
    expect(diceFormula("d%")).toBe("d%");
    expect(diceFormula("5")).toBeNull();
  });
  it("rolls with a comment, and picks visibility from the command", () => {
    expectCall("/r 2d6 + 1 hack and slash", "dice.roll", {
      formula: "2d6 + 1",
      comment: "hack and slash",
      visibility: "public",
    });
    expectCall("/sr d20", "dice.roll", { visibility: "private" });
    expect(parseCommand("/gm d20")).toHaveProperty("error");
  });
  it("keeps labels with spaces in the formula", () => {
    expect(splitFormula("1d4+1[Ring of Strength] for the door")).toEqual({
      formula: "1d4+1[Ring of Strength]",
      comment: "for the door",
    });
  });
  it("explains bad rolls", () => {
    expect(parseCommand("/r")).toHaveProperty("error");
    expect(parseCommand("/r banana")).toHaveProperty("error");
  });
  it("whispers to the longest matching name, or to the GM", () => {
    expectCall("/w robin hood psst", "chat.say", {
      to: ["rh"],
      toNames: ["Robin Hood"],
    });
    expect(sentText(expectCall("/w Robin psst", "chat.say").params)).toBe("psst");
    expectCall("/w gm I steal it", "chat.say", { to: ["g"], toNames: ["Gwen"] });
    expect(parseCommand("/w Nobody hi")).toHaveProperty("error");
    expect(parseCommand("/w Robin")).toHaveProperty("error");
  });
  it("keeps GM commands from players", () => {
    expectCall("/session start", "chat.session", { action: "start" }, true);
    expect(parseCommand("/session start")).toHaveProperty("error");
    expect(suggestSlash(context(), "/se")).toEqual([]);
    expect(suggestSlash(context(true), "/se").map((form) => form.names[0])).toEqual(["session"]);
  });
  it("does emotes and help", () => {
    expect(sentText(expectCall("/me waves", "chat.say", { emote: true }).params)).toBe("waves");
    expectCall("/help", "chat.help");
    expect(parseCommand("/nope")).toHaveProperty("error");
  });
});

describe("chat commands", () => {
  it("reads /pin, /timer, /count and /clock", () => {
    expect(sentText(expectCall("/pin Meet at the inn", "chat.sendPinned").params)).toBe(
      "Meet at the inn",
    );
    expectCall('/timer 60s "World Ends"', "chat.timer", {
      seconds: 60,
      label: "World Ends",
    });
    expectCall("/timer 1h30m Siege", "chat.timer", {
      seconds: 5400,
      label: "Siege",
    });
    expectCall("/timer 2:30", "chat.timer", {
      seconds: 150,
      label: "",
    });
    expect(parseCommand("/timer soon")).toHaveProperty("error");
    expectCall('/count 0/8 "The cops arrive"', "chat.counter", {
      start: 0,
      max: 8,
      label: "The cops arrive",
    });
    expectCall("/count 3 Torches", "chat.counter", {
      start: 3,
      label: "Torches",
    });
    expect(parseCommand("/count lots")).toHaveProperty("error");
    expectCall("/clock 8 The alarm sounds", "chat.counter", {
      start: 0,
      max: 8,
      label: "The alarm sounds",
    });
    expect(parseCommand("/clock zero Alarm")).toHaveProperty("error");
  });

  it("reads durations", () => {
    expect([
      parseDuration("90"),
      parseDuration("5m"),
      parseDuration("1h"),
      parseDuration("1:00:05"),
      parseDuration("x"),
    ]).toEqual([90, 300, 3600, 3605, null]);
  });
});
