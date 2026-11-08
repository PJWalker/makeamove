import { store } from "../lib/store";
import { selectCharacter } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import type { LinkKind } from "../features/notes/links";
import { linkLabel } from "../features/notes/targets";
import { libraryView } from "./libraryView";
import { showPanel } from "./panelLayout";

/** The page open in the Notes panel, if any. */
export const openNoteId = store<string | null>(null);

/** A match to select after its page's editor is ready. */
export const noteSearchTarget = store<{ noteId: string; from: number; to: number } | null>(null);

/** Counts each request to open a page, even the one already chosen, so the panel shows it. */
export const noteOpened = store(0);

/** Open a note's page in the Notes panel. */
export function openNote(id: string) {
  openNoteId.value = id;
  noteOpened.value++;
  showPanel("notes");
}

/** Show a link's target in its panel: the page, the sheet, the Scenes list, or the Libraries. */
export function openInSidebar(campaign: Campaign, kind: LinkKind, id: string) {
  if (kind === "scene") return showPanel("scene");
  followLink(campaign, kind, id);
}

/** Follow a link: open the page, the character's sheet, the scene, or the Libraries. */
export function followLink(campaign: Campaign, kind: LinkKind, id: string) {
  switch (kind) {
    case "note":
      return openNote(id);
    case "character":
      selectCharacter(campaign, id);
      return showPanel("characters");
    case "scene":
      return campaign.setActiveScene(id);
    case "item":
    case "move": {
      const label = linkLabel(campaign, kind, id) ?? "";
      libraryView.value = { kind, query: label };
      return showPanel("libraries");
    }
  }
}
