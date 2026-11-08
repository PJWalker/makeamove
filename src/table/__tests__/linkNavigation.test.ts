import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "../../campaign/campaign";

const dependencies = vi.hoisted(() => ({
  linkLabel: vi.fn(),
  selectCharacter: vi.fn(),
  showPanel: vi.fn(),
}));

vi.mock("../../features/characters/api", () => ({
  selectCharacter: dependencies.selectCharacter,
}));
vi.mock("../../features/notes/targets", () => ({ linkLabel: dependencies.linkLabel }));
vi.mock("../panelLayout", () => ({ showPanel: dependencies.showPanel }));

import { followLink, noteOpened, openInSidebar, openNoteId } from "../linkNavigation";
import { libraryView } from "../libraryView";

const labels: Record<string, string> = { sword: "Longsword", strike: "Strike" };

const setActiveScene = vi.fn();
const campaign = { setActiveScene } as unknown as Campaign;

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.linkLabel.mockImplementation((_, _kind, id: string) => labels[id] ?? null);
  openNoteId.value = null;
  noteOpened.value = 0;
  libraryView.value = { kind: "all", query: "" };
});

describe("link navigation", () => {
  it("opens each link in its corresponding panel or scene", () => {
    followLink(campaign, "note", "current");
    expect(openNoteId.value).toBe("current");
    expect(noteOpened.value).toBe(1);
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("notes");

    followLink(campaign, "character", "ayla");
    expect(dependencies.selectCharacter).toHaveBeenCalledWith(campaign, "ayla");
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("characters");

    followLink(campaign, "scene", "keep");
    expect(setActiveScene).toHaveBeenCalledWith("keep");

    followLink(campaign, "item", "sword");
    expect(libraryView.value).toEqual({ kind: "item", query: "Longsword" });
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("libraries");

    followLink(campaign, "move", "strike");
    expect(libraryView.value).toEqual({ kind: "move", query: "Strike" });

    openInSidebar(campaign, "scene", "keep");
    expect(dependencies.showPanel).toHaveBeenLastCalledWith("scene");
    expect(setActiveScene).toHaveBeenCalledOnce();
  });
});
