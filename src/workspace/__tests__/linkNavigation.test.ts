import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Campaign } from "../../campaign/campaign";
import type { PanelLayout } from "../panelLayout";

const dependencies = vi.hoisted(() => ({
  linkLabel: vi.fn(),
  viewCharacter: vi.fn(),
  playedCharacterId: vi.fn(),
}));

vi.mock("../../features/characters/api", () => ({
  viewCharacter: dependencies.viewCharacter,
  playedCharacterId: dependencies.playedCharacterId,
}));
vi.mock("../../features/notes/targets", () => ({ linkLabel: dependencies.linkLabel }));

import { LinkNavigation } from "../linkNavigation";
import { LibraryView } from "../libraryView";

const labels: Record<string, string> = { sword: "Longsword", strike: "Strike" };

const setActiveScene = vi.fn();
const campaign = { setActiveScene } as unknown as Campaign;
const showPanel = vi.fn();
const panels = { showPanel } as unknown as PanelLayout;
let library: LibraryView;
let links: LinkNavigation;

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.linkLabel.mockImplementation((_, _kind, id: string) => labels[id] ?? null);
  library = new LibraryView(panels);
  links = new LinkNavigation(campaign, panels, library);
});

describe("link navigation", () => {
  it("opens each link in its corresponding panel or scene", () => {
    links.followLink("note", "current");
    expect(links.openNoteId.value).toBe("current");
    expect(links.noteOpened.value).toBe(1);
    expect(showPanel).toHaveBeenLastCalledWith("notes");

    links.followLink("character", "ayla");
    expect(dependencies.viewCharacter).toHaveBeenCalledWith(campaign, "ayla");
    expect(showPanel).toHaveBeenLastCalledWith("characters");

    // The character this device plays has its own panel.
    dependencies.playedCharacterId.mockReturnValue("brom");
    links.followLink("character", "brom");
    expect(dependencies.viewCharacter).not.toHaveBeenCalledWith(campaign, "brom");
    expect(showPanel).toHaveBeenLastCalledWith("pc");

    links.followLink("scene", "keep");
    expect(setActiveScene).toHaveBeenCalledWith("keep");

    links.followLink("item", "sword");
    expect(library.view.value).toEqual({ kind: "item", query: "Longsword" });
    expect(showPanel).toHaveBeenLastCalledWith("libraries");

    links.followLink("move", "strike");
    expect(library.view.value).toEqual({ kind: "move", query: "Strike" });

    links.openInSidebar("scene", "keep");
    expect(showPanel).toHaveBeenLastCalledWith("scene");
    expect(setActiveScene).toHaveBeenCalledOnce();
  });
});
