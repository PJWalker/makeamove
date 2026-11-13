import { store } from "../lib/store";
import type { Campaign } from "../campaign/campaign";
import { getNote } from "../features/notes/api";
import { leave } from "../ui/morph";
import type { Confirmation } from "./commands/types";

/** What can be changed about an action from its menu (see ActionDialogs.tsx and commands/custom.ts). */
export type ActionEditKind = "rename" | "icon" | "shortcut";

/**
 * What the table has open for the moment, per campaign and never kept: the
 * command palette, a message being edited, pop-ups waiting to be filled in.
 */
export class TableState {
  readonly paletteOpen = store(false);
  /** The chat message being edited in place. */
  readonly editingMessage = store<string | null>(null);
  /** Earlier chat sessions the reader has opened, by key. */
  readonly openSessions = store<ReadonlySet<string>>(new Set());
  /** An action being renamed, given an icon or bound to a shortcut. */
  readonly actionEdit = store<{
    n: number;
    kind: ActionEditKind;
    id: string;
    title: string;
  } | null>(null);
  /** An entity whose graphic is being chosen. */
  readonly graphicEdit = store<{
    n: number;
    kind: string;
    id: string;
    title: string;
    defaultIcon?: string | undefined;
  } | null>(null);
  /** A command waiting for the player to confirm it (see commands/views.ts `invoke`). */
  readonly confirming = store<{ n: number; confirmation: Confirmation; run: () => void } | null>(
    null,
  );
  /** Notes shown in the chat to this player alone: command help and the like. */
  readonly chatNotes = store<{ id: number; text: string; error?: boolean }[]>([]);
  #edits = 0;
  /** The open palette's element, to animate away before it unmounts. */
  #palette: HTMLElement | null = null;

  constructor(private readonly campaign: Campaign) {}

  closePalette() {
    if (this.#palette) void leave(this.#palette, () => (this.paletteOpen.value = false));
    else this.paletteOpen.value = false;
  }

  togglePalette() {
    if (this.paletteOpen.value) this.closePalette();
    else this.paletteOpen.value = true;
  }

  /** The palette is showing as `el` until the returned function is called. */
  showingPalette(el: HTMLElement): () => void {
    this.#palette = el;
    return () => {
      if (this.#palette === el) this.#palette = null;
    };
  }

  noteInChat(text: string, error = false) {
    this.chatNotes.value = [...this.chatNotes.value, { id: ++this.#edits, text, error }];
  }

  /** Ask the player to confirm something, then run it if they do. */
  confirm(confirmation: Confirmation, run: () => void) {
    this.confirming.value = { n: ++this.#edits, confirmation, run };
  }

  /** Open an action's rename, icon or shortcut pop-up; each request gets its own. */
  editAction(kind: ActionEditKind, id: string, title: string) {
    this.actionEdit.value = { n: ++this.#edits, kind, id, title };
  }

  /** Choose an entity's graphic. GM-only pages have none. */
  editGraphic(kind: string, id: string, title: string, defaultIcon?: string) {
    if (kind === "note" && getNote(this.campaign, id)?.gmOnly) return;
    this.graphicEdit.value = { n: ++this.#edits, kind, id, title, defaultIcon };
  }
}
