import { store } from "../lib/store";
import type { EntryKind } from "../features/library";
import { showPanel } from "./panelLayout";

export type KindFilter = "all" | EntryKind;

/** What the Libraries panel shows, kept apart from it so sheets and actions can steer it. */
export const libraryView = store<{ kind: KindFilter; query: string }>({ kind: "all", query: "" });

/** Collections and entries shown open, by "source/collection[/entry…]" (this device only). */
export const openedLibraryEntries = store<Set<string>>(new Set());

/** Open the Libraries panel on one kind of entry, such as items for an inventory. */
export function browseLibrary(kind: KindFilter) {
  libraryView.value = { ...libraryView.value, kind };
  showPanel("libraries");
}
