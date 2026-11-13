import { store } from "../lib/store";
import type { EntryKind } from "../features/library";
import type { PanelLayout } from "./panelLayout";

export type KindFilter = "all" | EntryKind;

/** What the Libraries panel shows, kept apart from it so sheets and actions can steer it. */
export class LibraryView {
  readonly view = store<{ kind: KindFilter; query: string }>({ kind: "all", query: "" });
  /** Collections and entries shown open, by "source/collection[/entry…]". */
  readonly openedEntries = store<Set<string>>(new Set());

  constructor(private readonly panels: PanelLayout) {}

  /** Open the Libraries panel on one kind of entry, such as items for an inventory. */
  browse(kind: KindFilter) {
    this.view.value = { ...this.view.value, kind };
    this.panels.showPanel("libraries");
  }

  /** Open the Libraries panel searching for `query` among one kind of entry. */
  search(kind: KindFilter, query: string) {
    this.view.value = { kind, query };
    this.panels.showPanel("libraries");
  }
}
