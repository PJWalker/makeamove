import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "../../../campaign/campaign";

const dependencies = vi.hoisted(() => ({
  getCharacter: vi.fn(),
  listCharacters: vi.fn(),
  listNotes: vi.fn(),
  selectCharacter: vi.fn(),
  showPanel: vi.fn(),
  systemOf: vi.fn(),
}));

vi.mock("../../characters/api", () => ({
  getCharacter: dependencies.getCharacter,
  listCharacters: dependencies.listCharacters,
  selectCharacter: dependencies.selectCharacter,
  systemOf: dependencies.systemOf,
}));
vi.mock("../api", () => ({ listNotes: dependencies.listNotes }));
vi.mock("../../../table/panelLayout", () => ({ showPanel: dependencies.showPanel }));

import {
  characterLinkTargets,
  followLink,
  linkLabel,
  linkTargets,
  linkTip,
  matchingLinkTargets,
  noteOpened,
  openInSidebar,
  openNoteId,
} from "../targets";
import { libraryView } from "../../../table/libraryView";

const notes = [
  { id: "current", title: "Current Page", gmOnly: false },
  { id: "secret", title: "Secret Page", gmOnly: true },
];
const characters = [
  { id: "ayla", name: "Ayla", kind: "pc", template: null },
  { id: "goblin", name: "Goblin", kind: "npc", template: null },
];
const scenes = [{ id: "keep", name: "The Keep" }];
const items = [
  { id: "sword", name: "Longsword", description: "A balanced blade", icon: "sword" },
  { id: "potion", name: "Healing Potion", description: "Restores health" },
];
const actions = [
  { id: "strike", name: "Strike", trigger: "When you attack", category: "class" },
  { id: "defend", name: "Defend", trigger: "When you stand firm" },
];

const campaign = {
  sceneViews: () => scenes,
  setActiveScene: vi.fn(),
} as unknown as Campaign;

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.listNotes.mockReturnValue(notes);
  dependencies.listCharacters.mockReturnValue(characters);
  dependencies.getCharacter.mockImplementation((_, id: string) =>
    characters.find((character) => character.id === id),
  );
  dependencies.systemOf.mockReturnValue({ items, actions });
  openNoteId.value = null;
  noteOpened.value = 0;
  libraryView.value = { kind: "all", query: "" };
});

describe("note link targets", () => {
  it("ranks name prefixes before other matches and honors the limit", () => {
    const targets = [
      { kind: "note", id: "middle", label: "The Harbor", detail: "Note" },
      { kind: "note", id: "first", label: "Harbor Keep", detail: "Note" },
      { kind: "note", id: "second", label: "Harbor Road", detail: "Note" },
    ] as const;

    expect(matchingLinkTargets([...targets], "  HARBOR ").map(({ id }) => id)).toEqual([
      "first",
      "second",
      "middle",
    ]);
    expect(matchingLinkTargets([...targets], "harbor", 2).map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
    expect(matchingLinkTargets([...targets], " ", 2).map(({ id }) => id)).toEqual([
      "middle",
      "first",
    ]);
  });

  it("offers current notes, characters, scenes, gear, and moves without the page being edited", () => {
    expect(characterLinkTargets(campaign)).toEqual([
      { kind: "character", id: "ayla", label: "Ayla", detail: "Character" },
      { kind: "character", id: "goblin", label: "Goblin", detail: "NPC" },
    ]);

    expect(linkTargets(campaign, "", "current", 20)).toEqual([
      { kind: "note", id: "secret", label: "Secret Page", detail: "GM page", gmOnly: true },
      { kind: "character", id: "ayla", label: "Ayla", detail: "Character" },
      { kind: "character", id: "goblin", label: "Goblin", detail: "NPC" },
      { kind: "scene", id: "keep", label: "The Keep", detail: "Scene" },
      {
        kind: "item",
        id: "sword",
        label: "Longsword",
        detail: "Gear",
        icon: "sword",
      },
      { kind: "item", id: "potion", label: "Healing Potion", detail: "Gear" },
      { kind: "move", id: "strike", label: "Strike", detail: "Move", icon: "class-move" },
      { kind: "move", id: "defend", label: "Defend", detail: "Move" },
    ]);
  });

  it("resolves target names and useful tooltip text, or returns null for missing targets", () => {
    expect(linkLabel(campaign, "note", "current")).toBe("Current Page");
    expect(linkLabel(campaign, "character", "goblin")).toBe("Goblin");
    expect(linkLabel(campaign, "scene", "keep")).toBe("The Keep");
    expect(linkLabel(campaign, "item", "sword")).toBe("Longsword");
    expect(linkLabel(campaign, "move", "strike")).toBe("Strike");

    expect(linkTip(campaign, "note", "secret")).toBe("Secret Page\nGM page");
    expect(linkTip(campaign, "character", "goblin")).toBe("Goblin\nNPC");
    expect(linkTip(campaign, "scene", "keep")).toBe("The Keep\nScene");
    expect(linkTip(campaign, "item", "sword")).toBe("Longsword\nA balanced blade");
    expect(linkTip(campaign, "move", "strike")).toBe("Strike\nWhen you attack");

    for (const kind of ["note", "character", "scene", "item", "move"] as const) {
      expect(linkLabel(campaign, kind, "missing")).toBeNull();
      expect(linkTip(campaign, kind, "missing")).toBeNull();
    }
  });

  it("opens each link in its corresponding panel or scene", () => {
    followLink(campaign, "note", "current");
    expect(openNoteId.value).toBe("current");
    expect(noteOpened.value).toBe(1);
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("notes");

    followLink(campaign, "character", "ayla");
    expect(dependencies.selectCharacter).toHaveBeenCalledWith(campaign, "ayla");
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("characters");

    followLink(campaign, "scene", "keep");
    expect(campaign.setActiveScene).toHaveBeenCalledWith("keep");

    followLink(campaign, "item", "sword");
    expect(libraryView.value).toEqual({ kind: "item", query: "Longsword" });
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("libraries");

    followLink(campaign, "move", "strike");
    expect(libraryView.value).toEqual({ kind: "move", query: "Strike" });

    openInSidebar(campaign, "scene", "keep");
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("scene");
    expect(campaign.setActiveScene).toHaveBeenCalledOnce();
  });
});