import { store } from "../lib/store";
import { playedCharacterId, viewCharacter } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import type { LinkKind } from "../features/notes/links";
import { linkLabel } from "../features/notes/targets";
import type { LibraryView } from "./libraryView";
import type { PanelLayout } from "./panelLayout";

/** Where links lead: the page open in the Notes panel, and how each kind of link is followed. */
export class LinkNavigation {
  /** The page open in the Notes panel, if any. */
  readonly openNoteId = store<string | null>(null);

  /** A match to select after its page's editor is ready. */
  readonly noteSearchTarget = store<{ noteId: string; from: number; to: number } | null>(null);

  /** Counts each request to open a page, even the one already chosen, so the panel shows it. */
  readonly noteOpened = store(0);

  constructor(
    private readonly campaign: Campaign,
    private readonly panels: PanelLayout,
    private readonly library: LibraryView,
  ) {}

  /** Show a character's sheet: in My Character for this device's own, else in Characters. */
  openCharacter(id: string) {
    if (id === playedCharacterId(this.campaign)) return this.panels.showPanel("pc");
    viewCharacter(this.campaign, id);
    this.panels.showPanel("characters");
  }

  /** Open a note's page in the Notes panel. */
  openNote(id: string) {
    this.openNoteId.value = id;
    this.noteOpened.value++;
    this.panels.showPanel("notes");
  }

  /** Show a link's target in its panel: the page, the sheet, the Scenes list, or the Libraries. */
  openInSidebar(kind: LinkKind, id: string) {
    if (kind === "scene") return this.panels.showPanel("scene");
    this.followLink(kind, id);
  }

  /** Follow a link: open the page, the character's sheet, the scene, or the Libraries. */
  followLink(kind: LinkKind, id: string) {
    switch (kind) {
      case "note":
        return this.openNote(id);
      case "character":
        return this.openCharacter(id);
      case "scene":
        return this.campaign.setActiveScene(id);
      case "item":
      case "move":
        return this.library.search(kind, linkLabel(this.campaign, kind, id) ?? "");
    }
  }
}
