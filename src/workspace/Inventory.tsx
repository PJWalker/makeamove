import { richTextFromPlain } from "../data/richText";
import { useState } from "react";
import { systemOf } from "../features/characters/api";
import type { CharacterView, ItemInstance } from "../features/characters/types";
import type { Derived } from "../systems/types";
import type { Campaign } from "../campaign/campaign";
import { Button } from "../ui/Button";
import { RichTextView } from "./RichTextView";
import { List } from "../ui/List";
import { EntryRow, EntryWindow } from "./EntryWindow";
import { useEntryWindows } from "./entryWindowState";
import { linkProxy } from "./linkProxy";
import { actionMenuItems } from "./actionMenu";
import { dragEntity } from "./entityDrag";
import { entity } from "./dragEntities";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { getEntityGraphic } from "./entityGraphics";
import { useExtension } from "./systemExtensions";
import type { ItemUseProps } from "../systems/extensionTypes";
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
import { callKey } from "../kernel/commands";
import { findAction, joinSections, menuFor } from "./commands/views";

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
  const ctx = useCampaign();
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
                onChange={() => setChoice(move.id)}
              />
              {move.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="sheet-row">
        <Button
          disabled={!editable || progress >= artifact.capacity || (needsChoice && !selected)}
          onClick={() =>
            ctx.execute(markItemTrack, {
              characterId,
              itemId: item.id,
              unlock: needsChoice ? selected : undefined,
            })
          }
        >
          Mark {artifact.track}
        </Button>
        <Button
          variant="ghost"
          disabled={!editable || progress === 0}
          onClick={() => ctx.execute(clearItemTrack, { characterId, itemId: item.id })}
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

/** The core's Use button: spends a use, or does whatever the system's command for it does. */
function UseButton({ character, item, editable }: ItemUseProps) {
  const ctx = useCampaign();
  return (
    <Button
      disabled={!editable || (item.usesLeft ?? 0) <= 0}
      onClick={() => ctx.execute(useItem, { characterId: character.id, itemId: item.id })}
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
  const ctx = useCampaign();
  const windows = useEntryWindows();
  const patch = (i: ItemInstance, p: Partial<ItemInstance>) =>
    ctx.execute(updateItem, { characterId: c.id, itemId: i.id, patch: p });
  const over = d && (d.values.load ?? 0) > (d.values.maxLoad ?? 0);
  const system = systemOf(campaign);
  const extension = useExtension(system);
  const ItemUse = extension.ItemUse ?? UseButton;
  /** Its commands, then pinning its use or equipping to the hotbar. */
  const itemMenu = (i: ItemInstance) => {
    const target = { characterId: c.id, itemId: i.id };
    const pinnable = [useItem, equipItem]
      .filter((command) => command.menu?.item?.(ctx, target).length)
      .flatMap((command) => findAction(ctx, callKey(command.id, { itemId: i.id })) ?? [])
      .map((a) => ({ id: a.id, title: a.title }));
    return joinSections([
      menuFor(ctx, { kind: "item", ...target }),
      actionMenuItems(ctx, pinnable),
    ]);
  };

  const actions = (i: ItemInstance) => (
    <>
      {i.equippable && (
        <Button
          pressed={i.equipped}
          disabled={!editable}
          onClick={() => patch(i, { equipped: !i.equipped })}
        >
          {i.equipped ? "Equipped" : "Equip"}
        </Button>
      )}
      {itemUsable(ctx, i) && (
        <ItemUse campaign={campaign} character={c} item={i} editable={editable} />
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
                  ? entity(ctx, "item", i.defId, i.name)
                  : {
                      label: i.name,
                      token: {
                        name: i.name,
                        graphic: getEntityGraphic(campaign, "item", i.id, i.icon),
                        entityRef: { kind: "item", id: i.id },
                      },
                      give: {
                        kind: "item" as const,
                        to: (characterId: string) =>
                          ctx.execute(giveItem, { characterId, item: i }),
                      },
                    };
                dragEntity(ctx.canvas, ev, source);
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
          variant="ghost"
          className="inventory-find"
          onClick={() => ctx.library.browse("item")}
        >
          Find Items in the Libraries…
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
            proxy={i.defId ? linkProxy(ctx, "item", i.defId, i.name, i.icon) : undefined}
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
