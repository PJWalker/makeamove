import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useLayoutEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { Campaign } from "../store/campaign";
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
} from "../characters/api";
import { checkOf } from "../characters/moves";
import { useY } from "../store/useY";
import { librariesFor } from "../library";
import type { Icon } from "../ui/icons";
import { IconOpenWindow } from "../ui/icons";
import { IconPost, IconRoll, IconTarget } from "../ui/icons";
import { Button } from "../ui/Button";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog, type WindowProxy } from "./CampaignDialogs";
import {
  closeEntityTab,
  detachPanel,
  dockPanel,
  isFloating,
  layout,
} from "./panelLayout";
import { locate } from "./layoutModel";
import type { DockItemId } from "./panelLayout";
import type { MenuItem } from "./ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu } from "./ContextMenu";
import { withTransition } from "../ui/transition";

export interface EntityWindowRecord {
  id: DockItemId;
  title: string;
  icon?: Icon;
  content?: ComponentChildren;
  text?: string;
  tags?: string[];
  proxy?: WindowProxy;
  menuItems?: MenuItem[];
  close?: () => void;
}

interface SavedEntityWindow {
  id: string;
  title: string;
  text?: string;
  tags?: string[];
}

const META_KEY = "mam:entity-windows-1";

function load(): Record<string, EntityWindowRecord> {
  try {
    const saved = JSON.parse(
      localStorage.getItem(META_KEY) ?? "[]",
    ) as SavedEntityWindow[];
    const records: Record<string, EntityWindowRecord> = {};
    for (const item of saved) {
      if (!item?.id?.startsWith("entity:") || typeof item.title !== "string")
        continue;
      const id = item.id as DockItemId;
      records[id] = { id, title: item.title, text: item.text, tags: item.tags };
    }
    return records;
  } catch {
    return {};
  }
}

export const entityWindows = signal<Record<string, EntityWindowRecord>>(load());

export const entityTabId = (key: string) => `entity:${key}` as const;

function persist(records: Record<string, EntityWindowRecord>) {
  try {
    const saved: SavedEntityWindow[] = Object.values(records).map(
      ({ id, title, text, tags }) => ({ id, title, text, tags }),
    );
    localStorage.setItem(META_KEY, JSON.stringify(saved));
  } catch {
    // Entity windows remain usable even when local storage is unavailable.
  }
}

export function registerEntityWindow(record: EntityWindowRecord) {
  const records = {
    ...entityWindows.value,
    [record.id]: { ...entityWindows.value[record.id], ...record },
  };
  entityWindows.value = records;
  persist(records);
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
        const character =
          parts.length === 2 ? getCharacter(campaign, parts[0]) : undefined;
        if (!character?.inventory.some((item) => item.id === parts[1]))
          closeEntityWindow(id as DockItemId);
      } else if (key.startsWith("move:")) {
        const moveId = key.split(":").at(-1);
        if (!system.actions.some((move) => move.id === moveId))
          closeEntityWindow(id as DockItemId);
      } else if (key.startsWith("lib:")) {
        const parts = key.slice("lib:".length).split(":");
        const entryId = parts.pop();
        const kind = parts.pop();
        const sourceId = parts.join(":");
        const source = sources.find((candidate) => candidate.id === sourceId);
        if (
          source &&
          !source.collections.some((collection) =>
            collection.entries.some(
              (entry) => entry.id === entryId && entry.kind === kind,
            ),
          )
        ) {
          closeEntityWindow(id as DockItemId);
        }
      }
    }
  }, [campaign]);
  return (
    <>
      {Object.values(entityWindows.value)
        .filter((record) => isFloating(record.id))
        .map((record) => (
          <EntityPopup key={record.id} campaign={campaign} record={record} />
        ))}
    </>
  );
}

function EntityPopup({
  campaign,
  record,
}: {
  campaign: Campaign;
  record: EntityWindowRecord;
}) {
  const ref = usePopupDialog();
  const menu = useSignal<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => (menu.value = { x, y }));
  const items: MenuItem[] = [
    {
      label: "Dock to left sidebar",
      onSelect: () => withTransition(() => dockPanel(record.id, "left")),
    },
    {
      label: "Dock to right sidebar",
      onSelect: () => withTransition(() => dockPanel(record.id, "right")),
    },
    ...(record.menuItems?.length
      ? ["divider" as const, ...record.menuItems]
      : []),
  ];
  return (
    <>
      <Dialog
        dialogRef={ref}
        title={record.title}
        onClose={() => {
          record.close?.();
          closeEntityWindow(record.id);
        }}
        proxy={record.proxy}
        windowIcon={record.icon ?? IconOpenWindow}
        dockId={record.id}
        contextMenu={trigger}
        onDockMenu={(x, y) => (menu.value = { x, y })}
      >
        <EntityWindowContent campaign={campaign} record={record} />
        {record.tags && record.tags.length > 0 && (
          <p class="muted item-tags">{record.tags.join(", ")}</p>
        )}
      </Dialog>
      {menu.value && (
        <ContextMenu
          {...menu.value}
          items={items}
          onClose={() => (menu.value = null)}
        />
      )}
    </>
  );
}

export function entityRecord(id: DockItemId) {
  return entityWindows.value[id];
}

export function EntityWindowContent({
  campaign,
  record,
}: {
  campaign: Campaign;
  record: EntityWindowRecord;
}) {
  const key = record.id.startsWith("entity:entry:")
    ? record.id.slice("entity:entry:".length)
    : "";
  const inventoryParts = key.startsWith("inventory:")
    ? key.slice("inventory:".length).split(":")
    : [];
  const inventoryCharacterId =
    inventoryParts.length === 2 ? inventoryParts[0] : undefined;
  const moveParts = key.startsWith("move:")
    ? key.slice("move:".length).split(":")
    : [];
  const moveOwnerId = moveParts.length > 1 ? moveParts[0] : undefined;
  const moveId =
    moveParts.length > 1 ? moveParts.slice(1).join(":") : moveParts[0];
  const system = useY(campaign.homebrew, () => systemOf(campaign));
  const selectedId = useY(campaign.members, () =>
    selectedCharacterId(campaign),
  );
  const selectedCharacter = useY(campaign.characters, () =>
    getCharacter(campaign, selectedId),
  );
  const inventoryCharacter = useY(campaign.characters, () =>
    getCharacter(campaign, inventoryCharacterId),
  );
  const moveCharacter = useY(campaign.characters, () =>
    getCharacter(campaign, moveOwnerId ?? selectedId),
  );

  if (record.content) return <>{record.content}</>;

  const text = (
    <p class="move-text move-window-text">
      {record.text ?? "This window is not available."}
    </p>
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
            size="sm"
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
            size="sm"
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
    const parts = key.slice("lib:".length).split(":");
    const entryId = parts.pop();
    const kind = parts.pop();
    const sourceId = parts.join(":");
    const entry = librariesFor(baseSystemOf(campaign))
      .find((source) => source.id === sourceId)
      ?.collections.flatMap((collection) => collection.entries)
      .find((candidate) => candidate.id === entryId && candidate.kind === kind);
    if (!entry) return text;
    const editable =
      !!selectedCharacter && canEdit(campaign, selectedCharacter);
    if (entry.kind === "item") {
      return (
        <>
          {text}
          <Button
            variant="primary"
            disabled={!editable}
            onClick={() =>
              selectedCharacter &&
              addItem(campaign, selectedCharacter.id, entry.item)
            }
          >
            {selectedCharacter
              ? `Give to ${selectedCharacter.name}`
              : "Choose a character"}
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
            onClick={() =>
              setLearned(campaign, moveCharacter.id, move.id, false)
            }
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
      <action.Icon size={18} /> {action.label}
      {character ? ` as ${character.name}` : ""}
    </Button>
  );
}

export function isEntityTab(id: DockItemId): boolean {
  return id.startsWith("entity:");
}
