import type { ReactNode } from "react";
import { store } from "../lib/store";
import type { LocalDoc, LocalValue } from "../data/localDoc";
import type { Icon } from "../ui/icons";
import type { MenuItem } from "../ui/ContextMenu";
import type { Campaign } from "../campaign/campaign";
import type { DragEntity } from "./entityDrag";
import { locate } from "./layoutModel";
import type { DockItemId, PanelLayout } from "./panelLayout";

/*
 * Windows showing one thing each (an entry, an inventory item, a link's
 * target), kept per campaign. What a window shows comes from whoever opens
 * it; only its title, text and tags are kept in the local document, so it
 * comes back after a reload.
 */

/** What a window stands for, so its title can be dragged as that thing. */
export interface WindowProxy {
  campaign: Campaign;
  kind: string;
  id: string;
  defaultIcon?: string | undefined;
  entity: DragEntity;
}

export interface EntityWindowRecord {
  id: DockItemId;
  title: string;
  icon?: Icon | undefined;
  graphicRef?: { kind: string; id: string } | undefined;
  graphicDefaultIcon?: string | undefined;
  content?: ReactNode | undefined;
  text?: string | undefined;
  tags?: string[] | undefined;
  proxy?: WindowProxy | undefined;
  menuItems?: MenuItem[] | undefined;
  close?: (() => void) | undefined;
}

interface SavedEntityWindow {
  id: string;
  title: string;
  text?: string | undefined;
  tags?: string[] | undefined;
}

function readSaved(stored: unknown): SavedEntityWindow[] {
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) {
    console.warn("Ignoring stored entity windows: not a list", stored);
    return [];
  }
  return stored.filter((item: Partial<SavedEntityWindow> | null) => {
    const ok = !!item?.id?.startsWith("entity:") && typeof item.title === "string";
    if (!ok) console.warn("Leaving out a stored entity window that can't be read", item);
    return ok;
  }) as SavedEntityWindow[];
}

const ENTRY_PREFIX = "entity:entry:";

const entryKeysOf = (ids: Iterable<string>) =>
  [...ids].filter((id) => id.startsWith(ENTRY_PREFIX)).map((id) => id.slice(ENTRY_PREFIX.length));

export const entityTabId = (key: string) => `entity:${key}` as const;

/** Whether the fields kept in the local document are unchanged. */
function sameSavedFields(a: EntityWindowRecord, b: EntityWindowRecord) {
  return (
    a.title === b.title &&
    a.text === b.text &&
    (a.tags ?? []).length === (b.tags ?? []).length &&
    (a.tags ?? []).every((tag, index) => tag === b.tags?.[index])
  );
}

export class EntityWindows {
  readonly #saved: LocalValue<SavedEntityWindow[]>;
  readonly records = store<Record<string, EntityWindowRecord>>({});
  /** Entries (rules, items, moves) with a window open, by entry key. */
  readonly openEntries = store<string[]>([]);
  readonly #stop: () => void;

  constructor(
    local: LocalDoc,
    private readonly panels: PanelLayout,
  ) {
    this.#saved = local.value("entityWindows", readSaved);
    const records: Record<string, EntityWindowRecord> = {};
    for (const { id, title, text, tags } of this.#saved.value)
      records[id] = { id: id as DockItemId, title, text, tags };
    this.records.value = records;
    this.openEntries.value = entryKeysOf(Object.keys(records));
    // An entry stays open only while its window does, however that window was closed.
    let windowIds = new Set(Object.keys(records));
    this.#stop = this.records.subscribe(() => {
      const now = this.records.value;
      const closed = new Set(entryKeysOf([...windowIds].filter((id) => !(id in now))));
      windowIds = new Set(Object.keys(now));
      if (closed.size)
        this.openEntries.value = this.openEntries.value.filter((k) => !closed.has(k));
    });
  }

  #persist(records: Record<string, EntityWindowRecord>) {
    this.#saved.value = Object.values(records).map(({ id, title, text, tags }) => ({
      id,
      title,
      text,
      tags,
    }));
  }

  register(record: EntityWindowRecord) {
    const previous = this.records.value[record.id];
    // Always a new record, so memoized windows see new content; only what's saved is persisted.
    const records = { ...this.records.value, [record.id]: { ...previous, ...record } };
    this.records.value = records;
    if (!previous || !sameSavedFields(previous, record)) this.#persist(records);
    if (locate(this.panels.layout.value, record.id) === "closed") {
      this.panels.detachPanel(record.id, Math.max(innerWidth / 2 - 190, 0), 96, 380, 440);
    }
  }

  close(id: DockItemId) {
    const records = { ...this.records.value };
    delete records[id];
    this.records.value = records;
    this.#persist(records);
    this.panels.closeEntityTab(id);
  }

  /** An entity window's record; components pass the records they read. */
  record(id: DockItemId, records = this.records.value) {
    return records[id];
  }

  dispose() {
    this.#stop();
  }
}
