import { useSignal } from "@preact/signals-react";
import { addItem, removeItem, updateItem, spendItemUse } from "../features/characters/api";
import { clearArtifactTrack, markArtifactTrack, systemOf } from "../features/characters/api";
import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { Derived } from "../systems/types";
import type { Campaign } from "../campaign/campaign";
import { Button } from "../ui/Button";
import { IconDelete, IconImage } from "../ui/icons";
import { List } from "../ui/List";
import { EntryRow, EntryWindow, useEntryWindows } from "./EntryWindow";
import { linkProxy } from "./LinkChip";
import { browseLibrary } from "./libraryView";
import { actionMenuItems } from "./actionMenu";
import { dragEntity, entity } from "./entityDrag";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { editEntityGraphic } from "./GraphicDialogs";
import { getEntityGraphic } from "./entityGraphics";
import { extensionOf, type ItemUseProps } from "../systems/extensions";

const menuTargets = (i: ItemInstance) => [
  ...(i.uses !== undefined ? [{ id: `use:${i.id}`, title: `Use ${i.name}` }] : []),
  ...(i.equippable
    ? [
        {
          id: `equip:${i.id}`,
          title: `${i.equipped ? "Unequip" : "Equip"} ${i.name}`,
        },
      ]
    : []),
];

const metaOf = (i: ItemInstance) =>
  [
    i.weight ? `${i.weight} wt` : "",
    i.uses !== undefined ? `${i.usesLeft ?? 0}/${i.uses} uses` : "",
    i.broken ? "Broken" : "",
  ]
    .filter(Boolean)
    .join(" · ");

const tipOf = (i: { description: string; tags: string[] }) =>
  i.tags.length ? `${i.description}\n\n${i.tags.join(", ")}` : i.description;

function ArtifactTracker({
  campaign,
  characterId,
  item,
  editable,
}: {
  campaign: Campaign;
  characterId: string;
  item: ItemInstance;
  editable: boolean;
}) {
  const choice = useSignal("");
  const definition = systemOf(campaign).items.find((entry) => entry.id === item.defId);
  const artifact = definition?.artifact;
  if (!artifact) return null;
  const progress = item.artifactProgress ?? 0;
  const unlocked = new Set(item.artifactUnlocked ?? []);
  const available = artifact.unlocks.filter((move) => !unlocked.has(move.id));
  const needsChoice =
    progress === artifact.capacity - 1 && available.length > 0 && artifact.unlockMode === "choose";
  const selected =
    choice.value && available.some((move) => move.id === choice.value)
      ? choice.value
      : (available[0]?.id ?? "");
  return (
    <section className="inventory-artifact" aria-label={`${item.name} Artifact track`}>
      <h4>{artifact.track}</h4>
      <progress
        aria-label={`${artifact.track} progress`}
        max={artifact.capacity}
        value={progress}
      />
      <output>
        {progress}/{artifact.capacity}
      </output>
      {needsChoice && (
        <fieldset className="form-section">
          <legend>Unlock a move</legend>
          {available.map((move) => (
            <label className="check-option" key={move.id}>
              <input
                type="radio"
                name={`${item.id}-artifact-unlock`}
                value={move.id}
                checked={selected === move.id}
                disabled={!editable}
                onChange={() => (choice.value = move.id)}
              />
              {move.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="sheet-row">
        <Button
          size="sm"
          disabled={!editable || progress >= artifact.capacity || (needsChoice && !selected)}
          onClick={() =>
            markArtifactTrack(campaign, characterId, item.id, needsChoice ? selected : undefined)
          }
        >
          Mark {artifact.track}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!editable || progress === 0}
          onClick={() => clearArtifactTrack(campaign, characterId, item.id)}
        >
          Clear 1
        </Button>
      </div>
      <details>
        <summary>Artifact moves</summary>
        <ul>
          {artifact.unlocks.map((move) => (
            <li key={move.id}>
              <strong>{move.name}</strong> {unlocked.has(move.id) ? "(unlocked)" : "(locked)"}
              {move.text && <p>{move.text}</p>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The core's Use button: spends a use, or does what the system's extension says. */
function UseButton({ campaign, character, item, editable }: ItemUseProps) {
  const use = extensionOf(systemOf(campaign)).spendUse ?? spendItemUse;
  return (
    <Button
      size="sm"
      disabled={!editable || (item.usesLeft ?? 0) <= 0}
      onClick={() => use(campaign, character.id, item.id)}
    >
      Use
    </Button>
  );
}

/**
 * A character's inventory, as a section of their sheet: what they carry and
 * the load it comes to. New things come from the Libraries.
 */
export function Inventory({
  campaign,
  c,
  d,
  editable,
}: {
  campaign: Campaign;
  c: CharacterView;
  /** Load figures, for characters whose system tracks load. */
  d?: Derived;
  editable: boolean;
}) {
  const windows = useEntryWindows();
  const patch = (i: ItemInstance, p: Partial<ItemInstance>) => updateItem(campaign, c.id, i.id, p);
  const over = d && (d.values.load ?? 0) > (d.values.maxLoad ?? 0);
  const system = systemOf(campaign);
  const extension = extensionOf(system);
  const usable = (i: ItemInstance) =>
    i.uses !== undefined &&
    (system.itemUsable?.(
      i,
      system.items.find((entry) => entry.id === i.defId),
    ) ??
      true);
  const ItemUse = extension.ItemUse ?? UseButton;
  const itemMenu = (i: ItemInstance) => {
    const items = actionMenuItems(
      campaign,
      menuTargets(i).filter((target) => usable(i) || !target.id.startsWith(`use:${i.id}`)),
    );
    const extra = extension.itemMenu?.(campaign, c, i, editable) ?? [];
    return [
      ...(i.equippable
        ? [
            {
              label: i.equipped ? `Unequip ${i.name}` : `Equip ${i.name}`,
              disabled: !editable,
              onSelect: () => patch(i, { equipped: !i.equipped }),
            },
          ]
        : []),
      ...(usable(i)
        ? [
            {
              label: `Use ${i.name}`,
              disabled: !editable || !i.usesLeft,
              onSelect: () => (extension.spendUse ?? spendItemUse)(campaign, c.id, i.id),
            },
          ]
        : []),
      ...extra,
      ...(items.length ? (["divider"] as const) : []),
      ...items,
      ...(items.length ? (["divider"] as const) : []),
      {
        label: `Remove ${i.name}`,
        Icon: IconDelete,
        danger: true,
        disabled: !editable,
        onSelect: () => removeItem(campaign, c.id, i.id),
      },
      {
        label: "Change graphic…",
        Icon: IconImage,
        onSelect: () => editEntityGraphic(campaign, "item", i.defId ?? i.id, i.name, i.icon),
      },
    ];
  };

  const actions = (i: ItemInstance) => (
    <>
      {i.equippable && (
        <Button
          size="sm"
          pressed={i.equipped}
          disabled={!editable}
          onClick={() => patch(i, { equipped: !i.equipped })}
        >
          {i.equipped ? "Equipped" : "Equip"}
        </Button>
      )}
      {usable(i) && <ItemUse campaign={campaign} character={c} item={i} editable={editable} />}
    </>
  );

  return (
    <section
      className="form-section sheet-section inventory"
      aria-label="Inventory"
      data-item-drop={editable ? c.id : undefined}
    >
      <h3 className="sheet-heading">
        Inventory{" "}
        {d?.values.load !== undefined && d.values.maxLoad !== undefined && (
          <span className="muted" data-over={over}>
            Load {d.values.load}/{d.values.maxLoad}
            {over && " · overloaded"}
          </span>
        )}
      </h3>
      {c.inventory.length === 0 ? (
        <p className="empty-inline">
          Nothing carried yet.
          {editable && " Drag gear here from the Libraries."}
        </p>
      ) : (
        <List>
          {c.inventory.map((i) => (
            <EntryRow
              key={i.id}
              name={i.name}
              lead={
                <CampaignEntityGraphic
                  campaign={campaign}
                  kind="item"
                  id={i.defId ?? i.id}
                  defaultIcon={i.icon}
                  size={22}
                />
              }
              meta={metaOf(i)}
              tip={tipOf(i)}
              dim={(i.equippable && !i.equipped) || i.broken}
              onOpen={(row) => windows.show(`inventory:${c.id}:${i.id}`, row)}
              onPointerDown={(ev) => {
                const source = i.defId
                  ? entity(campaign, "item", i.defId, i.name)
                  : {
                      label: i.name,
                      token: {
                        name: i.name,
                        graphic: getEntityGraphic(campaign, "item", i.id, i.icon),
                        entityRef: { kind: "item", id: i.id },
                      },
                      give: {
                        kind: "item" as const,
                        to: (characterId: string) => addItem(campaign, characterId, i),
                      },
                    };
                dragEntity(ev, source);
              }}
              menuItems={itemMenu(i)}
            >
              {actions(i)}
            </EntryRow>
          ))}
        </List>
      )}
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          className="inventory-find"
          onClick={() => browseLibrary("item")}
        >
          Find items in the Libraries…
        </Button>
      )}
      {windows.keys.map((key) => {
        const i = c.inventory.find((k) => `inventory:${c.id}:${k.id}` === key);
        if (!i) return null;
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={i.name}
            text={i.description}
            tags={i.tags}
            onClose={() => windows.close(key)}
            menuItems={itemMenu(i)}
            graphicRef={{ kind: "item", id: i.defId ?? i.id }}
            graphicDefaultIcon={i.icon}
            // Gear from the Libraries stands for its entry there.
            proxy={i.defId ? linkProxy(campaign, "item", i.defId, i.name, i.icon) : undefined}
          >
            {metaOf(i) && <span className="muted">{metaOf(i)}</span>}
            <ArtifactTracker campaign={campaign} characterId={c.id} item={i} editable={editable} />
            {actions(i)}
          </EntryWindow>
        );
      })}
    </section>
  );
}
