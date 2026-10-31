import { addItem, removeItem, updateItem } from "../characters/api";
import type { CharacterView, ItemInstance } from "../characters/store";
import type { Derived } from "../systems/types";
import type { Campaign } from "../store/campaign";
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

const menuTargets = (i: ItemInstance) => [
  ...(i.uses !== undefined
    ? [{ id: `use:${i.id}`, title: `Use ${i.name}` }]
    : []),
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
  ]
    .filter(Boolean)
    .join(" · ");

const tipOf = (i: { description: string; tags: string[] }) =>
  i.tags.length ? `${i.description}\n\n${i.tags.join(", ")}` : i.description;

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
  const patch = (i: ItemInstance, p: Partial<ItemInstance>) =>
    updateItem(campaign, c.id, i.id, p);
  const over = d && d.values.load > d.values.maxLoad;
  const itemMenu = (i: ItemInstance) => {
    const items = actionMenuItems(campaign, menuTargets(i));
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
      ...(i.uses !== undefined
        ? [
            {
              label: `Use ${i.name}`,
              disabled: !editable || !i.usesLeft,
              onSelect: () =>
                patch(i, { usesLeft: Math.max(0, (i.usesLeft ?? 0) - 1) }),
            },
          ]
        : []),
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
        onSelect: () =>
          editEntityGraphic(campaign, "item", i.defId ?? i.id, i.name, i.icon),
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
      {i.uses !== undefined && (
        <Button
          size="sm"
          disabled={!editable || !i.usesLeft}
          onClick={() =>
            patch(i, { usesLeft: Math.max(0, (i.usesLeft ?? 0) - 1) })
          }
        >
          Use
        </Button>
      )}
    </>
  );

  return (
    <section
      class="sheet-section inventory"
      aria-label="Inventory"
      data-item-drop={editable ? c.id : undefined}
    >
      <h3 class="sheet-heading">
        Inventory{" "}
        {d && (
          <span class="muted" data-over={over}>
            Load {d.values.load}/{d.values.maxLoad}
            {over && " · overloaded"}
          </span>
        )}
      </h3>
      {c.inventory.length === 0 ? (
        <p class="empty-inline">
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
              dim={i.equippable && !i.equipped}
              onOpen={(row) => windows.show(`inventory:${c.id}:${i.id}`, row)}
              onPointerDown={(ev) => {
                const source = i.defId
                  ? entity(campaign, "item", i.defId, i.name)
                  : {
                      label: i.name,
                      token: {
                        name: i.name,
                        graphic: getEntityGraphic(
                          campaign,
                          "item",
                          i.id,
                          i.icon,
                        ),
                        entityRef: { kind: "item", id: i.id },
                      },
                      give: {
                        kind: "item" as const,
                        to: (characterId: string) =>
                          addItem(campaign, characterId, i),
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
          class="inventory-find"
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
            proxy={
              i.defId
                ? linkProxy(campaign, "item", i.defId, i.name, i.icon)
                : undefined
            }
          >
            {metaOf(i) && <span class="muted">{metaOf(i)}</span>}
            {actions(i)}
          </EntryWindow>
        );
      })}
    </section>
  );
}
