import { useLayoutEffect, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import { baseSystemOf, canEdit, getCharacter, systemOf } from "../features/characters/api";
import type { ItemInstance } from "../features/characters/types";
import { checkOf } from "../features/characters/moves";
import { useQuery } from "../ui/useQuery";
import { entryByKey, librariesFor, useLibrariesFor } from "../features/library";
import { IconOpenWindow, IconPost, IconRoll, IconTarget } from "../ui/icons";
import { Button } from "../ui/Button";
import type { MenuItem } from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu } from "../ui/ContextMenu";
import { withTransition } from "../ui/transition";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog } from "./Dialog";
import { entryKeyOf } from "./entityWindowState";
import type { EntityWindowRecord } from "./entityWindowState";
import { parseEntryKey } from "./entryKeys";
import type { EntryRef as EntryReference } from "./entryKeys";
import { EntryActionButtons } from "./EntryActionButtons";
import { useLibraryActions } from "./libraryActions";
import { useCampaign } from "./campaignContext";
import { setLearned, startMove, updateItem } from "./commands/characters";

export function EntityWindowHost({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  useLayoutEffect(() => {
    const ids = [
      ...context.panels.layout.value.left.panels,
      ...context.panels.layout.value.right.panels,
      ...context.panels.layout.value.floating.map((win) => win.id),
    ];
    for (const id of ids) {
      const key = entryKeyOf(id);
      const reference = key === undefined ? undefined : parseEntryKey(key);
      if (reference && !entryExists(campaign, reference)) context.windows.close(id);
    }
  }, [context, campaign]);
  const records = useQuery(context.windows.records);
  const shown = useQuery(context.panels.layout);
  return (
    <>
      {Object.values(records).flatMap((record) =>
        context.panels.isFloating(record.id, shown)
          ? [<EntityPopup key={record.id} campaign={campaign} record={record} />]
          : [],
      )}
    </>
  );
}
function EntityPopup({ campaign, record }: { campaign: Campaign; record: EntityWindowRecord }) {
  const context = useCampaign();
  const reference = usePopupDialog();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => {
    setMenu({ x, y });
  });
  const close = () => {
    record.close?.();
    context.windows.close(record.id);
  };
  const items: MenuItem[] = [
    {
      label: "Dock to Left Sidebar",
      onSelect: () =>
        void withTransition(() => {
          context.panels.dockPanel(record.id, "left");
        }),
    },
    {
      label: "Dock to Right Sidebar",
      onSelect: () =>
        void withTransition(() => {
          context.panels.dockPanel(record.id, "right");
        }),
    },
    "divider",
    { label: "Close", onSelect: close },
    ...(record.menuItems?.length ? ["divider" as const, ...record.menuItems] : []),
  ];
  return (
    <>
      <Dialog
        dialogRef={reference}
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
      {menu && (
        <ContextMenu
          {...menu}
          items={items}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
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
  const reference = key === undefined ? undefined : parseEntryKey(key);
  const text = (
    <p className="move-text move-window-text">{record.text ?? "This window is not available."}</p>
  );
  return (
    <>
      {text}
      {reference?.kind === "inventory" && (
        <InventoryActions campaign={campaign} entry={reference} />
      )}
      {reference?.kind === "lib" && <LibraryActions campaign={campaign} entry={reference} />}
      {reference?.kind === "move" && <MoveActions campaign={campaign} entry={reference} />}
    </>
  );
}

/** Whether what an entry window shows still exists. */
function entryExists(campaign: Campaign, reference: EntryReference) {
  if (reference.kind === "inventory")
    return !!getCharacter(campaign, reference.characterId)?.inventory.some(
      (index) => index.id === reference.itemId,
    );
  if (reference.kind === "move")
    return systemOf(campaign).actions.some((m) => m.id === reference.moveId);
  const found = entryByKey(librariesFor(systemOf(campaign)), reference.key);
  return !found || !!found.entry;
}

function InventoryActions({
  campaign,
  entry: { characterId, itemId },
}: {
  campaign: Campaign;
  entry: Extract<EntryReference, { kind: "inventory" }>;
}) {
  const context = useCampaign();
  const character = useQuery(campaign.characters, () => getCharacter(campaign, characterId));
  const item = character?.inventory.find((candidate) => candidate.id === itemId);
  if (!character || !item) return null;
  const editable = canEdit(campaign, character);
  const patch = (changes: Partial<ItemInstance>) =>
    context.execute(updateItem, { characterId, itemId, patch: changes });
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
  entry: reference,
}: {
  campaign: Campaign;
  entry: Extract<EntryReference, { kind: "lib" }>;
}) {
  const libraries = useLibrariesFor(baseSystemOf(campaign));
  const { actionsFor } = useLibraryActions(campaign);
  const entry = entryByKey(libraries, reference.key)?.entry;
  return entry ? <EntryActionButtons actions={actionsFor(entry)} /> : null;
}

function MoveActions({
  campaign,
  entry: { ownerId, moveId },
}: {
  campaign: Campaign;
  entry: Extract<EntryReference, { kind: "move" }>;
}) {
  const context = useCampaign();
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
            context.execute(setLearned, { id: character.id, action: move.id, known: false })
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
  const context = useCampaign();
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
        character && context.execute(startMove, { characterId: character.id, move: move.id })
      }
    >
      <Icon size={22} /> {label}
      {character ? ` as ${character.name}` : ""}
    </Button>
  );
}
