import { useLayoutEffect, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import {
  baseSystemOf,
  canEdit,
  getCharacter,
  actingCharacterId,
  systemOf,
} from "../features/characters/api";
import type { ItemInstance } from "../features/characters/types";
import { checkOf } from "../features/characters/moves";
import { useQuery } from "../ui/useQuery";
import { entryByKey, librariesFor, useLibrariesFor } from "../features/library";
import { IconOpenWindow } from "../ui/icons";
import { IconPost, IconRoll, IconTarget } from "../ui/icons";
import { Button } from "../ui/Button";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog } from "./Dialog";
import { entryKeyOf, type EntityWindowRecord } from "./entityWindowState";
import { parseEntryKey, type EntryRef } from "./entryKeys";
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
    for (const id of ids) {
      const key = entryKeyOf(id);
      const ref = key === undefined ? undefined : parseEntryKey(key);
      if (ref && !entryExists(campaign, ref)) ctx.windows.close(id);
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
  if (record.content) return record.content;
  const key = entryKeyOf(record.id);
  const ref = key === undefined ? undefined : parseEntryKey(key);
  const text = (
    <p className="move-text move-window-text">{record.text ?? "This window is not available."}</p>
  );
  return (
    <>
      {text}
      {ref?.kind === "inventory" && <InventoryActions campaign={campaign} entry={ref} />}
      {ref?.kind === "lib" && <LibraryActions campaign={campaign} entry={ref} />}
      {ref?.kind === "move" && <MoveActions campaign={campaign} entry={ref} />}
    </>
  );
}

/** Whether what an entry window shows still exists. */
function entryExists(campaign: Campaign, ref: EntryRef) {
  if (ref.kind === "inventory")
    return !!getCharacter(campaign, ref.characterId)?.inventory.some((i) => i.id === ref.itemId);
  if (ref.kind === "move") return systemOf(campaign).actions.some((m) => m.id === ref.moveId);
  const found = entryByKey(librariesFor(systemOf(campaign)), ref.key);
  return !found || !!found.entry;
}

function InventoryActions({
  campaign,
  entry: { characterId, itemId },
}: {
  campaign: Campaign;
  entry: Extract<EntryRef, { kind: "inventory" }>;
}) {
  const ctx = useCampaign();
  const character = useQuery(campaign.characters, () => getCharacter(campaign, characterId));
  const item = character?.inventory.find((candidate) => candidate.id === itemId);
  if (!character || !item) return null;
  const editable = canEdit(campaign, character);
  const patch = (changes: Partial<ItemInstance>) =>
    ctx.execute(updateItem, { characterId, itemId, patch: changes });
  return (
    <>
      {item.equippable && (
        <Button
          pressed={item.equipped}
          disabled={!editable}
          onClick={() => patch({ equipped: !item.equipped })}
        >
          {item.equipped ? "Equipped" : "Equip"}
        </Button>
      )}
      {item.uses !== undefined && (
        <Button
          disabled={!editable || !item.usesLeft}
          onClick={() => patch({ usesLeft: Math.max(0, (item.usesLeft ?? 0) - 1) })}
        >
          Use
        </Button>
      )}
    </>
  );
}

function LibraryActions({
  campaign,
  entry: ref,
}: {
  campaign: Campaign;
  entry: Extract<EntryRef, { kind: "lib" }>;
}) {
  const ctx = useCampaign();
  const libraries = useLibrariesFor(baseSystemOf(campaign));
  const selectedId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const character = useQuery(campaign.characters, () => getCharacter(campaign, selectedId));
  const entry = entryByKey(libraries, ref.key)?.entry;
  const editable = !!character && canEdit(campaign, character);
  if (entry?.kind === "item")
    return (
      <Button
        variant="primary"
        disabled={!editable}
        onClick={() =>
          character && ctx.execute(giveItem, { characterId: character.id, item: entry.item })
        }
      >
        {character ? `Give to ${character.name}` : "Choose a Character"}
      </Button>
    );
  if (entry?.kind === "move")
    return <MoveAction move={entry.move} character={character} enabled={editable} />;
  return null;
}

function MoveActions({
  campaign,
  entry: { ownerId, moveId },
}: {
  campaign: Campaign;
  entry: Extract<EntryRef, { kind: "move" }>;
}) {
  const ctx = useCampaign();
  const system = useQuery(campaign.homebrew, () => systemOf(campaign));
  const character = useQuery(campaign.characters, () => getCharacter(campaign, ownerId));
  const move = system.actions.find((candidate) => candidate.id === moveId);
  if (!character || !move) return null;
  const editable = canEdit(campaign, character);
  return (
    <>
      {character.learned.includes(move.id) && editable && (
        <Button
          variant="ghost"
          onClick={() =>
            ctx.execute(setLearned, { id: character.id, action: move.id, known: false })
          }
        >
          Forget
        </Button>
      )}
      <MoveAction move={move} character={character} enabled={editable} />
    </>
  );
}

/** The button that starts a move as a character: it targets, rolls or posts, by what the move does. */
function MoveAction({
  move,
  character,
  enabled,
}: {
  move: ReturnType<typeof systemOf>["actions"][number];
  character: ReturnType<typeof getCharacter>;
  enabled: boolean;
}) {
  const ctx = useCampaign();
  const { label, Icon } = move.target
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
      <Icon size={22} /> {label}
      {character ? ` as ${character.name}` : ""}
    </Button>
  );
}
