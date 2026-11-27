import { useRef, useState } from "react";
import type * as React from "react";
import type { Campaign } from "../campaign/campaign";
import type SceneController from "../scene/controller";
import { dropArrangement, elementLabel, LAYER_LABELS, layerList, rowIds } from "../scene/layerList";
import type { DropSpot, LayerRow } from "../scene/layerList";
import { GM_KINDS, kindOf } from "../scene/tools";
import type { Layer } from "../scene/types";
import Button from "../ui/Button";
import CommitInput from "../ui/CommitInput";
import { IconGroup, IconHidden, IconLock, IconUnlock, IconVisible } from "../ui/icons";
import { List, ListExpand, ListGroup, ListRow } from "../ui/List";
import { startReorder } from "../ui/reorder";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import SELECT_KINDS from "./selectKinds";

/*
 * What's on the open scene, layer by layer from the top down: pick things
 * by their rows, drag rows to restack them or move them between layers,
 * lock them, hide them from players (for the GM), and name them.
 */

function LayersPanel({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const open = useQuery(context.canvas.canvasCommands);
  const gm = useQuery(campaign.members, () => campaign.isGm());
  if (!open) return <p className="empty-inline">No scene open.</p>;
  return <LayersList key={open.sceneId} controller={open.controller} gm={gm} />;
}

/** Where a drop below each draggable row or layer heading lands, by its `data-drop` key. */
type Spots = Map<string, DropSpot>;

function LayersList({ controller, gm }: { controller: SceneController; gm: boolean }) {
  useQuery(controller.revision);
  const selection = new Set(useQuery(controller.selection));
  const [closedLayers, setClosedLayers] = useState<ReadonlySet<Layer>>(() => new Set());
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Players see only what they could pick: not the GM's walls, lights and effects.
  const elements = controller
    .allElements()
    .filter((element) => gm || !GM_KINDS.includes(kindOf(element)));
  const sections = layerList(elements);
  const spots: Spots = new Map();

  const toggle = <T,>(set: ReadonlySet<T>, item: T) => {
    const next = new Set(set);
    if (!next.delete(item)) next.add(item);
    return next;
  };

  const pick = (row: LayerRow, e: React.MouseEvent, member: boolean) => {
    const ids = rowIds(row);
    if (e.shiftKey) {
      const all = ids.every((id) => selection.has(id));
      const these = new Set(ids);
      const sel = controller.selection.value;
      controller.select(all ? sel.filter((id) => !these.has(id)) : [...new Set([...sel, ...ids])]);
      return;
    }
    // A member's row opens its group, to pick it alone, as double-clicking it on the map does.
    const open = member && row.kind === "element" ? (row.element.group ?? null) : null;
    controller.select(ids, { open });
  };

  const drag = (e: React.PointerEvent<HTMLElement>, row: LayerRow) => {
    const moving = new Set(rowIds(row));
    startReorder({
      event: e,
      axis: "y",
      container: listRef.current,
      items: () => [...(listRef.current?.querySelectorAll<HTMLElement>("[data-drop]") ?? [])],
      onDrop: (index) => {
        const others = [
          ...(listRef.current?.querySelectorAll<HTMLElement>("[data-drop]") ?? []),
        ].filter((item) => item !== e.currentTarget);
        // Dropped after the row or heading above it; before anything, at the top of the top layer.
        const above = others[index - 1]?.getAttribute("data-drop");
        const spot = (above ? spots.get(above) : undefined) ?? { layer: sections[0]!.layer };
        controller.arrange([...moving], dropArrangement(controller.allElements(), moving, spot));
      },
    });
  };

  const rowFor = (row: LayerRow, layer: Layer, member = false): React.ReactNode => {
    const ids = rowIds(row);
    const key = row.kind === "element" ? row.element.id : `group:${row.group}`;
    const members = row.kind === "group" ? row.members : [row.element];
    const groupOpen = row.kind === "group" && openGroups.has(row.group);
    spots.set(key, groupOpen ? { layer, over: row.members[0]!.id } : { layer, under: ids });
    const locked = members.every((element) => element.locked);
    const hidden = members.every((element) => element.hidden);
    if (row.kind === "element" && renaming === row.element.id)
      return (
        <li key={key} className="list-row" data-drop={key}>
          <CommitInput
            ref={(input) => {
              input?.focus();
            }}
            aria-label="Name"
            value={row.element.name ?? ""}
            placeholder={elementLabel({ ...row.element, name: "" })}
            onCommit={(name) => {
              controller.setProps([row.element.id], { name: name || undefined });
            }}
            onBlur={() => {
              setRenaming(null);
            }}
          />
        </li>
      );
    return [
      <ListRow
        key={key}
        name={row.kind === "group" ? "Group" : elementLabel(row.element)}
        lead={<RowIcon row={row} />}
        selected={ids.every((id) => selection.has(id))}
        dim={hidden}
        {...(row.kind === "group" ? { meta: String(row.members.length) } : {})}
        before={
          row.kind === "group" ? (
            <ListExpand
              open={groupOpen}
              label={groupOpen ? "Hide Members" : "Show Members"}
              onToggle={() => {
                setOpenGroups(toggle(openGroups, row.group));
              }}
            />
          ) : undefined
        }
        onPick={(e) => {
          pick(row, e, member);
        }}
        row={{
          "data-drop": key,
          className: "list-row layers-row",
          onPointerDown: (e: React.PointerEvent<HTMLLIElement>) => {
            if (renaming === null) drag(e, row);
          },
        }}
        pick={{
          ...(row.kind === "element"
            ? {
                onDoubleClick: () => {
                  setRenaming(row.element.id);
                },
                title: "Double-click to rename",
              }
            : {}),
        }}
      >
        {gm && (
          <Button
            variant="icon"
            icon={hidden ? IconHidden : IconVisible}
            label={hidden ? "Show to Players" : "Hide from Players"}
            pressed={hidden}
            onClick={() => {
              controller.setHidden(ids, !hidden);
            }}
          />
        )}
        <Button
          variant="icon"
          icon={locked ? IconLock : IconUnlock}
          label={locked ? "Unlock" : "Lock"}
          pressed={locked}
          onClick={() => {
            controller.setLocked(ids, !locked);
          }}
        />
      </ListRow>,
      groupOpen && (
        <li key={`${key}:members`} className="layers-members">
          <List label="Members">
            {row.members.map((m) => rowFor({ kind: "element", element: m }, layer, true))}
          </List>
        </li>
      ),
    ];
  };

  return (
    <div className="panel-scroll layers-panel" ref={listRef}>
      {sections.map(({ layer, rows }) => {
        spots.set(`layer:${layer}`, { layer });
        return (
          <ListGroup
            key={layer}
            label={LAYER_LABELS[layer]}
            count={rows.length}
            open={!closedLayers.has(layer)}
            onToggle={() => {
              setClosedLayers(toggle(closedLayers, layer));
            }}
            head={{ "data-drop": `layer:${layer}` }}
          >
            <List label={LAYER_LABELS[layer]}>{rows.map((row) => rowFor(row, layer))}</List>
          </ListGroup>
        );
      })}
    </div>
  );
}

/** A row's icon: the tool that makes its element, or a group's. */
function RowIcon({ row }: { row: LayerRow }) {
  if (row.kind === "group") return <IconGroup size={18} />;
  const { Icon } = SELECT_KINDS.find((k) => k.id === kindOf(row.element))!;
  return <Icon size={18} />;
}

export default LayersPanel;
