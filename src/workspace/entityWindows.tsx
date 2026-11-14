import { useLayoutEffect, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import {
  baseSystemOf,
  canEdit,
  getCharacter,
  actingCharacterId,
  systemOf,
} from "../features/characters/api";
import { checkOf } from "../features/characters/moves";
import { useQuery } from "../ui/useQuery";
import { entryByKey, librariesFor, useLibrariesFor } from "../features/library";
import { IconOpenWindow, type Icon } from "../ui/icons";
import { IconPost, IconRoll, IconTarget } from "../ui/icons";
import { Button } from "../ui/Button";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog } from "./Dialog";
import type { EntityWindowRecord } from "./entityWindowState";
import type { MenuItem } from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu } from "../ui/ContextMenu";
import { withTransition } from "../ui/transition";
import { useCampaign } from "./campaignContext";
import { giveItem, setLearned, startMove, updateItem } from "./commands/characters";

export function EntityWindowHost({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  useLayoutEffect(() => {
    const ids = [
      ...ctx.panels.layout.value.left.panels,
      ...ctx.panels.layout.value.right.panels,
      ...ctx.panels.layout.value.floating.map((win) => win.id),
    ];
    const system = systemOf(campaign);
    const sources = librariesFor(system);
    for (const id of ids) {
      if (!id.startsWith("entity:entry:")) continue;
      const key = id.slice("entity:entry:".length);
      if (key.startsWith("inventory:")) {
        const parts = key.slice("inventory:".length).split(":");
        const character = parts.length === 2 ? getCharacter(campaign, parts[0]) : undefined;
        if (!character?.inventory.some((item) => item.id === parts[1])) ctx.windows.close(id);
      } else if (key.startsWith("move:")) {
        const moveId = key.split(":").at(-1);
        if (!system.actions.some((move) => move.id === moveId)) ctx.windows.close(id);
      } else if (key.startsWith("lib:")) {
        const found = entryByKey(sources, key);
        if (found && !found.entry) {
          ctx.windows.close(id);
        }
      }
    }
  }, [ctx, campaign]);
  const records = useQuery(ctx.windows.records);
  const shown = useQuery(ctx.panels.layout);
  return (
    <>
      {Object.values(records).flatMap((record) =>
        ctx.panels.isFloating(record.id, shown)
          ? [<EntityPopup key={record.id} campaign={campaign} record={record} />]
          : [],
      )}
    </>
  );
}
function EntityPopup({ campaign, record }: { campaign: Campaign; record: EntityWindowRecord }) {
  const ctx = useCampaign();
  const ref = usePopupDialog();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));
  const close = () => {
    record.close?.();
    ctx.windows.close(record.id);
  };
  const items: MenuItem[] = [
    {
      label: "Dock to Left Sidebar",
      onSelect: () => void withTransition(() => ctx.panels.dockPanel(record.id, "left")),
    },
    {
      label: "Dock to Right Sidebar",
      onSelect: () => void withTransition(() => ctx.panels.dockPanel(record.id, "right")),
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

export function EntityWindowContent({
  campaign,
  record,
}: {
  campaign: Campaign;
  record: EntityWindowRecord;
}) {
  const ctx = useCampaign();
  const key = record.id.startsWith("entity:entry:") ? record.id.slice("entity:entry:".length) : "";
  const inventoryParts = key.startsWith("inventory:")
    ? key.slice("inventory:".length).split(":")
    : [];
  const inventoryCharacterId = inventoryParts.length === 2 ? inventoryParts[0] : undefined;
  const moveParts = key.startsWith("move:") ? key.slice("move:".length).split(":") : [];
  const moveOwnerId = moveParts.length > 1 ? moveParts[0] : undefined;
  const moveId = moveParts.length > 1 ? moveParts.slice(1).join(":") : moveParts[0];
  const system = useQuery(campaign.homebrew, () => systemOf(campaign));
  const selectedId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const selectedCharacter = useQuery(campaign.characters, () => getCharacter(campaign, selectedId));
  const inventoryCharacter = useQuery(campaign.characters, () =>
    getCharacter(campaign, inventoryCharacterId),
  );
  const moveCharacter = useQuery(campaign.characters, () =>
    getCharacter(campaign, moveOwnerId ?? selectedId),
  );
  const libraries = useLibrariesFor(baseSystemOf(campaign));

  if (record.content) return record.content;

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
              ctx.execute(updateItem, {
                characterId: inventoryCharacter.id,
                itemId: item.id,
                patch: {
                  equipped: !item.equipped,
                },
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
              ctx.execute(updateItem, {
                characterId: inventoryCharacter.id,
                itemId: item.id,
                patch: {
                  usesLeft: Math.max(0, (item.usesLeft ?? 0) - 1),
                },
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
            onClick={() =>
              selectedCharacter &&
              ctx.execute(giveItem, { characterId: selectedCharacter.id, item: entry.item })
            }
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
            onClick={() =>
              ctx.execute(setLearned, { id: moveCharacter.id, action: move.id, known: false })
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
  const ctx = useCampaign();
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
      onClick={() =>
        character && ctx.execute(startMove, { characterId: character.id, move: move.id })
      }
    >
      <action.Icon size={22} /> {action.label}
      {character ? ` as ${character.name}` : ""}
    </Button>
  );
}
