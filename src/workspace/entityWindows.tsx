import { store } from "../lib/store";
import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import {
  addItem,
  baseSystemOf,
  canEdit,
  getCharacter,
  selectedCharacterId,
  setLearned,
  startMove,
  systemOf,
  updateItem,
} from "../features/characters/api";
import { checkOf } from "../features/characters/moves";
import { getStorageJson, setStorageJson } from "../platform/localStorage";
import { useY } from "../ui/useY";
import { entryByKey, librariesFor, useLibrariesFor } from "../features/library";
import type { Icon } from "../ui/icons";
import { IconOpenWindow } from "../ui/icons";
import { IconPost, IconRoll, IconTarget } from "../ui/icons";
import { Button } from "../ui/Button";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog, type WindowProxy } from "./CampaignDialogs";
import { closeEntityTab, detachPanel, dockPanel, isFloating, layout } from "./panelLayout";
import { locate } from "./layoutModel";
import type { DockItemId } from "./panelLayout";
import type { MenuItem } from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu } from "../ui/ContextMenu";
import { withTransition } from "../ui/transition";
import { useValue } from "../ui/useValue";

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

const META_KEY = "mam:entity-windows-1";

function load(): Record<string, EntityWindowRecord> {
  const saved = getStorageJson<unknown>(META_KEY, []);
  if (!Array.isArray(saved)) return {};
  const records: Record<string, EntityWindowRecord> = {};
  for (const item of saved as SavedEntityWindow[]) {
    if (!item?.id?.startsWith("entity:") || typeof item.title !== "string") continue;
    const id = item.id as DockItemId;
    records[id] = { id, title: item.title, text: item.text, tags: item.tags };
  }
  return records;
}

export const entityWindows = store<Record<string, EntityWindowRecord>>(load());

const ENTRY_PREFIX = "entity:entry:";

const entryKeysOf = (ids: Iterable<string>) =>
  [...ids].filter((id) => id.startsWith(ENTRY_PREFIX)).map((id) => id.slice(ENTRY_PREFIX.length));

/** Entries (rules, items, moves) with a window open, by entry key. */
export const openEntries = store<string[]>(entryKeysOf(Object.keys(entityWindows.value)));

// An entry stays open only while its window does, however that window was closed.
let windowIds = new Set(Object.keys(entityWindows.value));
entityWindows.subscribe(() => {
  const closed = new Set(entryKeysOf([...windowIds].filter((id) => !(id in entityWindows.value))));
  windowIds = new Set(Object.keys(entityWindows.value));
  if (closed.size) openEntries.value = openEntries.value.filter((key) => !closed.has(key));
});

export const entityTabId = (key: string) => `entity:${key}` as const;

/** Whether the fields kept in localStorage (see `persist`) are unchanged. */
function sameSavedFields(a: EntityWindowRecord, b: EntityWindowRecord) {
  return (
    a.title === b.title &&
    a.text === b.text &&
    (a.tags ?? []).length === (b.tags ?? []).length &&
    (a.tags ?? []).every((tag, index) => tag === b.tags?.[index])
  );
}

function persist(records: Record<string, EntityWindowRecord>) {
  const saved: SavedEntityWindow[] = Object.values(records).map(({ id, title, text, tags }) => ({
    id,
    title,
    text,
    tags,
  }));
  setStorageJson(META_KEY, saved);
}

export function registerEntityWindow(record: EntityWindowRecord) {
  const previous = entityWindows.value[record.id];
  // Always a new record, so memoized windows see new content; only what's saved is persisted.
  const records = { ...entityWindows.value, [record.id]: { ...previous, ...record } };
  entityWindows.value = records;
  if (!previous || !sameSavedFields(previous, record)) persist(records);
  if (locate(layout.value, record.id) === "closed") {
    detachPanel(record.id, Math.max(innerWidth / 2 - 190, 0), 96, 380, 440);
  }
}

export function closeEntityWindow(id: DockItemId) {
  const records = { ...entityWindows.value };
  delete records[id];
  entityWindows.value = records;
  persist(records);
  closeEntityTab(id);
}

export function EntityWindowHost({ campaign }: { campaign: Campaign }) {
  useLayoutEffect(() => {
    const ids = [
      ...layout.value.left.panels,
      ...layout.value.right.panels,
      ...layout.value.floating.map((win) => win.id),
    ];
    const system = systemOf(campaign);
    const sources = librariesFor(system);
    for (const id of ids) {
      if (!id.startsWith("entity:entry:")) continue;
      const key = id.slice("entity:entry:".length);
      if (key.startsWith("inventory:")) {
        const parts = key.slice("inventory:".length).split(":");
        const character = parts.length === 2 ? getCharacter(campaign, parts[0]) : undefined;
        if (!character?.inventory.some((item) => item.id === parts[1])) closeEntityWindow(id);
      } else if (key.startsWith("move:")) {
        const moveId = key.split(":").at(-1);
        if (!system.actions.some((move) => move.id === moveId)) closeEntityWindow(id);
      } else if (key.startsWith("lib:")) {
        const found = entryByKey(sources, key);
        if (found && !found.entry) {
          closeEntityWindow(id);
        }
      }
    }
  }, [campaign]);
  const records = useValue(entityWindows);
  const shown = useValue(layout);
  return (
    <>
      {Object.values(records)
        .filter((record) => isFloating(record.id, shown))
        .map((record) => (
          <EntityPopup key={record.id} campaign={campaign} record={record} />
        ))}
    </>
  );
}

function EntityPopup({ campaign, record }: { campaign: Campaign; record: EntityWindowRecord }) {
  const ref = usePopupDialog();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));
  const close = () => {
    record.close?.();
    closeEntityWindow(record.id);
  };
  const items: MenuItem[] = [
    {
      label: "Dock to Left Sidebar",
      onSelect: () => void withTransition(() => dockPanel(record.id, "left")),
    },
    {
      label: "Dock to Right Sidebar",
      onSelect: () => void withTransition(() => dockPanel(record.id, "right")),
    },
    "divider",
    { label: "Close", onSelect: close },
    ...(record.menuItems?.length ? ["divider" as const, ...record.menuItems] : []),
  ];
  return (
    <>
      <Dialog
        dialogRef={ref}
        title={record.title}
        onClose={close}
        {...(record.proxy ? { proxy: record.proxy } : {})}
        graphicCampaign={campaign}
        graphicRef={record.graphicRef}
        graphicDefaultIcon={record.graphicDefaultIcon}
        windowIcon={record.icon ?? IconOpenWindow}
        dockId={record.id}
        contextMenu={trigger}
      >
        <EntityWindowContent campaign={campaign} record={record} />
        {record.tags && record.tags.length > 0 && (
          <p className="muted item-tags">{record.tags.join(", ")}</p>
        )}
      </Dialog>
      {menu && <ContextMenu {...menu} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}

/** An entity window's record; components pass the records they read. */
export function entityRecord(id: DockItemId, records = entityWindows.value) {
  return records[id];
}

export function EntityWindowContent({
  campaign,
  record,
}: {
  campaign: Campaign;
  record: EntityWindowRecord;
}) {
  const key = record.id.startsWith("entity:entry:") ? record.id.slice("entity:entry:".length) : "";
  const inventoryParts = key.startsWith("inventory:")
    ? key.slice("inventory:".length).split(":")
    : [];
  const inventoryCharacterId = inventoryParts.length === 2 ? inventoryParts[0] : undefined;
  const moveParts = key.startsWith("move:") ? key.slice("move:".length).split(":") : [];
  const moveOwnerId = moveParts.length > 1 ? moveParts[0] : undefined;
  const moveId = moveParts.length > 1 ? moveParts.slice(1).join(":") : moveParts[0];
  const system = useY(campaign.homebrew, () => systemOf(campaign));
  const selectedId = useY(campaign.members, () => selectedCharacterId(campaign));
  const selectedCharacter = useY(campaign.characters, () => getCharacter(campaign, selectedId));
  const inventoryCharacter = useY(campaign.characters, () =>
    getCharacter(campaign, inventoryCharacterId),
  );
  const moveCharacter = useY(campaign.characters, () =>
    getCharacter(campaign, moveOwnerId ?? selectedId),
  );
  const libraries = useLibrariesFor(baseSystemOf(campaign));

  if (record.content) return <>{record.content}</>;

  const text = (
    <p className="move-text move-window-text">{record.text ?? "This window is not available."}</p>
  );
  if (inventoryCharacter && inventoryParts.length === 2) {
    const item = inventoryCharacter.inventory.find(
      (candidate) => candidate.id === inventoryParts[1],
    );
    if (!item) return text;
    const editable = canEdit(campaign, inventoryCharacter);
    return (
      <>
        {text}
        {item.equippable && (
          <Button
            pressed={item.equipped}
            disabled={!editable}
            onClick={() =>
              updateItem(campaign, inventoryCharacter.id, item.id, {
                equipped: !item.equipped,
              })
            }
          >
            {item.equipped ? "Equipped" : "Equip"}
          </Button>
        )}
        {item.uses !== undefined && (
          <Button
            disabled={!editable || !item.usesLeft}
            onClick={() =>
              updateItem(campaign, inventoryCharacter.id, item.id, {
                usesLeft: Math.max(0, (item.usesLeft ?? 0) - 1),
              })
            }
          >
            Use
          </Button>
        )}
      </>
    );
  }

  if (key.startsWith("lib:")) {
    const entry = entryByKey(libraries, key)?.entry;
    if (!entry) return text;
    const editable = !!selectedCharacter && canEdit(campaign, selectedCharacter);
    if (entry.kind === "item") {
      return (
        <>
          {text}
          <Button
            variant="primary"
            disabled={!editable}
            onClick={() => selectedCharacter && addItem(campaign, selectedCharacter.id, entry.item)}
          >
            {selectedCharacter ? `Give to ${selectedCharacter.name}` : "Choose a Character"}
          </Button>
        </>
      );
    }
    if (entry.kind === "move") {
      return (
        <>
          {text}
          <MoveAction
            campaign={campaign}
            move={entry.move}
            character={selectedCharacter}
            enabled={editable}
          />
        </>
      );
    }
    return text;
  }

  if (moveParts.length && moveCharacter) {
    const move = system.actions.find((candidate) => candidate.id === moveId);
    if (!move) return text;
    const editable = canEdit(campaign, moveCharacter);
    const action = move.target
      ? { label: "Target", Icon: IconTarget }
      : checkOf(move)
        ? { label: "Roll", Icon: IconRoll }
        : { label: "Post", Icon: IconPost };
    return (
      <>
        {text}
        {moveCharacter.learned.includes(move.id) && editable && (
          <Button
            variant="ghost"
            onClick={() => setLearned(campaign, moveCharacter.id, move.id, false)}
          >
            Forget
          </Button>
        )}
        <MoveAction
          campaign={campaign}
          move={move}
          character={moveCharacter}
          enabled={editable}
          label={action.label}
          Icon={action.Icon}
        />
      </>
    );
  }

  return text;
}

function MoveAction({
  campaign,
  move,
  character,
  enabled,
  label,
  Icon,
}: {
  campaign: Campaign;
  move: ReturnType<typeof systemOf>["actions"][number];
  character: ReturnType<typeof getCharacter>;
  enabled: boolean;
  label?: string;
  Icon?: Icon;
}) {
  const action =
    label && Icon
      ? { label, Icon }
      : move.target
        ? { label: "Target", Icon: IconTarget }
        : checkOf(move)
          ? { label: "Roll", Icon: IconRoll }
          : { label: "Post", Icon: IconPost };
  return (
    <Button
      variant="primary"
      disabled={!character || !enabled}
      onClick={() => character && startMove(campaign, character.id, move)}
    >
      <action.Icon size={22} /> {action.label}
      {character ? ` as ${character.name}` : ""}
    </Button>
  );
}

export function isEntityTab(id: DockItemId): boolean {
  return id.startsWith("entity:");
}
