import { useState } from "react";
import { richTextFromPlain } from "../data/richText";
import { systemOf } from "../features/characters/api";
import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { Derived } from "../systems/types";
import type { Campaign } from "../campaign/campaign";
import Button from "../ui/Button";
import { List } from "../ui/List";
import type { ItemUseProps as ItemUseProperties } from "../systems/extensionTypes";
import { callKey } from "../kernel/commands";
import { RichTextView } from "./RichTextView";
import { EntryRow, EntryWindow } from "./EntryWindow";
import useEntryWindows from "./entryWindowState";
import { inventoryKey } from "./entryKeys";
import linkProxy from "./linkProxy";
import { actionMenuItems } from "./actionMenu";
import { dragEntity } from "./entityDrag";
import { entity } from "./dragEntities";
import CampaignEntityGraphic from "./EntityGraphic";
import { getEntityGraphic } from "./entityGraphics";
import { useExtension } from "./systemExtensions";
import { useCampaign } from "./campaignContext";
import {
  clearItemTrack,
  equipItem,
  giveItem,
  itemUsable,
  markItemTrack,
  updateItem,
  useItem,
} from "./commands/characters";
import { findAction, joinSections, menuFor } from "./commands/views";

const metaOf = (index: ItemInstance) =>
  [
    index.weight ? `${index.weight} wt` : "",
    index.uses === undefined ? "" : `${index.usesLeft ?? 0}/${index.uses} uses`,
    index.broken ? "Broken" : "",
  ]
    .filter(Boolean)
    .join(" · ");

const tipOf = (index: { description: string; tags: string[] }) =>
  index.tags.length > 0 ? `${index.description}\n\n${index.tags.join(", ")}` : index.description;

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
  const tracker = useArtifactTracker(campaign, characterId, item);
  if (!tracker) return null;
  const { artifact, progress, unlocked, available, needsChoice, selected, setChoice, mark, clear } =
    tracker;
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
                onChange={() => {
                  setChoice(move.id);
                }}
              />
              {move.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="sheet-row">
        <Button
          disabled={!editable || progress >= artifact.capacity || (needsChoice && !selected)}
          onClick={mark}
        >
          Mark {artifact.track}
        </Button>
        <Button variant="ghost" disabled={!editable || progress === 0} onClick={clear}>
          Clear 1
        </Button>
      </div>
      <details>
        <summary>Artifact moves</summary>
        <ul>
          {artifact.unlocks.map((move) => (
            <li key={move.id}>
              <strong>{move.name}</strong> {unlocked.has(move.id) ? "(unlocked)" : "(locked)"}
              {move.text && (
                <RichTextView
                  campaign={campaign}
                  text={richTextFromPlain(move.text)}
                  characterId={characterId}
                />
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function useArtifactTracker(campaign: Campaign, characterId: string, item: ItemInstance) {
  const context = useCampaign();
  const [choice, setChoice] = useState("");
  const definition = systemOf(campaign).items.find((entry) => entry.id === item.defId);
  const artifact = definition?.artifact;
  if (!artifact) return null;
  const progress = item.artifactProgress ?? 0;
  const unlocked = new Set(item.artifactUnlocked ?? []);
  const available = artifact.unlocks.filter((move) => !unlocked.has(move.id));
  const needsChoice =
    progress === artifact.capacity - 1 && available.length > 0 && artifact.unlockMode === "choose";
  const selected =
    choice && available.some((move) => move.id === choice) ? choice : (available[0]?.id ?? "");
  const mark = () =>
    context.execute(markItemTrack, {
      characterId,
      itemId: item.id,
      unlock: needsChoice ? selected : undefined,
    });
  const clear = () => context.execute(clearItemTrack, { characterId, itemId: item.id });
  return { artifact, progress, unlocked, available, needsChoice, selected, setChoice, mark, clear };
}

/** The core's Use button: spends a use, or does whatever the system's command for it does. */
function UseButton({ character, item, editable }: ItemUseProperties) {
  const context = useCampaign();
  return (
    <Button
      disabled={!editable || (item.usesLeft ?? 0) <= 0}
      onClick={() => context.execute(useItem, { characterId: character.id, itemId: item.id })}
    >
      Use
    </Button>
  );
}

/**
 * A character's inventory, as a section of their sheet: what they carry and
 * the load it comes to. New things come from the Libraries.
 */
function Inventory({
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
  const context = useCampaign();
  const windows = useEntryWindows();
  const patch = (index: ItemInstance, p: Partial<ItemInstance>) =>
    context.execute(updateItem, { characterId: c.id, itemId: index.id, patch: p });
  const over = d && (d.values["load"] ?? 0) > (d.values["maxLoad"] ?? 0);
  const system = systemOf(campaign);
  const extension = useExtension(system);
  const ItemUse = extension.ItemUse ?? UseButton;
  /** Its commands, then pinning its use or equipping to the hotbar. */
  const itemMenu = (index: ItemInstance) => {
    const target = { characterId: c.id, itemId: index.id };
    const pinnable = [useItem, equipItem]
      .filter((command) => command.menu?.item?.(context, target).length)
      .flatMap((command) => findAction(context, callKey(command.id, { itemId: index.id })) ?? [])
      .map((a) => ({ id: a.id, title: a.title }));
    return joinSections([
      menuFor(context, { kind: "item", ...target }),
      actionMenuItems(context, pinnable),
    ]);
  };

  const actions = (index: ItemInstance) => (
    <>
      {index.equippable && (
        <Button
          pressed={index.equipped}
          disabled={!editable}
          onClick={() => patch(index, { equipped: !index.equipped })}
        >
          {index.equipped ? "Equipped" : "Equip"}
        </Button>
      )}
      {itemUsable(context, index) && (
        <ItemUse campaign={campaign} character={c} item={index} editable={editable} />
      )}
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
        {d?.values["load"] !== undefined && d.values["maxLoad"] !== undefined && (
          <span className="muted" data-over={over}>
            Load {d.values["load"]}/{d.values["maxLoad"]}
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
          {c.inventory.map((index) => (
            <EntryRow
              key={index.id}
              name={index.name}
              lead={
                <CampaignEntityGraphic
                  campaign={campaign}
                  kind="item"
                  id={index.defId ?? index.id}
                  defaultIcon={index.icon}
                  size={22}
                />
              }
              meta={metaOf(index)}
              tip={tipOf(index)}
              dim={(index.equippable && !index.equipped) || index.broken}
              onOpen={(row) => {
                windows.show(inventoryKey(c.id, index.id), row);
              }}
              onPointerDown={(event) => {
                const source = index.defId
                  ? entity(context, "item", index.defId, index.name)
                  : {
                      label: index.name,
                      token: {
                        name: index.name,
                        graphic: getEntityGraphic(campaign, "item", index.id, index.icon),
                        entityRef: { kind: "item", id: index.id },
                      },
                      give: {
                        kind: "item" as const,
                        to: (characterId: string) =>
                          context.execute(giveItem, { characterId, item: index }),
                      },
                    };
                dragEntity(context.canvas, event, source);
              }}
              menuItems={itemMenu(index)}
            >
              {actions(index)}
            </EntryRow>
          ))}
        </List>
      )}
      {editable && (
        <Button
          variant="ghost"
          className="inventory-find"
          onClick={() => {
            context.library.browse("item");
          }}
        >
          Find Items in the Libraries…
        </Button>
      )}
      {windows.keys.map((key) => {
        const index = c.inventory.find((k) => inventoryKey(c.id, k.id) === key);
        if (!index) return null;
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={index.name}
            text={index.description}
            tags={index.tags}
            onClose={() => {
              windows.close(key);
            }}
            menuItems={itemMenu(index)}
            graphicRef={{ kind: "item", id: index.defId ?? index.id }}
            graphicDefaultIcon={index.icon}
            // Gear from the Libraries stands for its entry there.
            proxy={
              index.defId
                ? linkProxy(context, "item", index.defId, index.name, index.icon)
                : undefined
            }
          >
            {metaOf(index) && <span className="muted">{metaOf(index)}</span>}
            <ArtifactTracker
              campaign={campaign}
              characterId={c.id}
              item={index}
              editable={editable}
            />
            {actions(index)}
          </EntryWindow>
        );
      })}
    </section>
  );
}

export default Inventory;
