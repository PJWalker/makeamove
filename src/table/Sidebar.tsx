/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The sidebar's interactive splitter cannot be an hr. */
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";
import { useUnreadCount } from "../features/chat/unread";
import { IconClose, IconOpenWindow } from "../ui/icons";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { trackPointer } from "../ui/pointer";
import { startReorder } from "../ui/reorder";
import { withTransition } from "../ui/transition";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import {
  isPanelId,
  otherSide,
  sidebarMaxWidth,
  type DockItemId,
  type Side,
  type PanelId,
} from "../workspace/panelLayout";
import { PanelContent, PanelIcon, PaneToggle } from "./panels";
import { usePanelLabel } from "./panelLabels";
import { PanelActionsProvider, PanelActionsSlot } from "./PanelActions";
import { EntityWindowContent } from "../workspace/entityWindows";
import { isEntityTab } from "../workspace/entityWindowState";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { keyedSideWidth, SIDEBAR_DEFAULT_W } from "../workspace/layoutModel";
import { type CampaignContext, useCampaign } from "../workspace/campaignContext";

const DRAG_THRESHOLD = 10;

/**
 * A sidebar: a vertical tab strip attached to a full-height body that slides
 * in from beyond its edge, pushing the strip ahead of it. The left one is the
 * right one mirrored. A side with no panels disappears, unless a window is
 * being dragged, when it shows as a place to drop it.
 */
export function Sidebar({ side, campaign }: { side: Side; campaign: Campaign }) {
  const ctx = useCampaign();
  const s = useQuery(ctx.panels.shownLayout)[side];
  const dragging = useQuery(ctx.panels.windowDragging);
  const target = useQuery(ctx.panels.dockTarget);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const empty = s.panels.length === 0;
  if (empty && !dragging) return null;
  const { open, active } = s;
  const outer = side === "left" ? "dock-left" : "dock-right";

  return (
    <aside
      className="sidebar"
      style={{ "--sidebar-user-w": `${s.width}px` }}
      data-side={side}
      data-open={open}
      data-empty={empty}
      data-drop={target === side}
      aria-label={side === "left" ? "Left sidebar" : "Right sidebar"}
    >
      <div className="sidebar-rail-edge">
        <div className={`sidebar-rail strip ${outer}`} role="tablist" aria-orientation="vertical">
          {s.panels.map((id) => (
            <RailTab
              key={id}
              campaign={campaign}
              id={id}
              side={side}
              selected={open && active === id}
              onMenu={(x, y) => setMenu({ x, y, items: tabMenu(ctx, id, side) })}
            />
          ))}
        </div>
        {!empty && <SidebarResizeHandle side={side} />}
      </div>

      <section
        className={`sidebar-body panel dock-${side === "left" ? "left" : "right"} dock-top dock-bottom`}
        role="tabpanel"
        inert={!open}
      >
        {/* The body's edge drags too, for a taller target; the rail's separator is the one for keyboards. */}
        <div
          className="sidebar-body-resize"
          aria-hidden="true"
          onPointerDown={(e) => dragSideWidth(ctx, side, e)}
        />
        {active && (
          <ActiveTab
            campaign={campaign}
            id={active}
            onMenu={(x, y) => setMenu({ x, y, items: tabMenu(ctx, active, side) })}
          />
        )}
      </section>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

/** A right-click menu trigger that also keeps a primary-button press handler. */
function withPull(onPress: (e: ReactPointerEvent) => void, open: (x: number, y: number) => void) {
  const trigger = menuTrigger(open);
  return {
    onContextMenu: trigger.onContextMenu,
    onPointerDown(e: ReactPointerEvent) {
      trigger.onPointerDown(e);
      onPress(e);
    },
  };
}

/** Right-click menu for a tab: the keyboard-friendly way to rearrange panels. */
function tabMenu(ctx: CampaignContext, id: DockItemId, side: Side): MenuItem[] {
  const other = otherSide(side);
  if (isEntityTab(id)) {
    return [
      { label: "Open", onSelect: () => ctx.panels.showPanel(id) },
      "divider",
      {
        label: other === "left" ? "Move to Left Sidebar" : "Move to Right Sidebar",
        onSelect: () => void withTransition(() => ctx.panels.dockPanel(id, other)),
      },
      {
        label: "Float in a Window",
        onSelect: () => ctx.panels.detachPanel(id, Math.max(innerWidth / 2 - 190, 0), 96, 380, 440),
      },
      "divider",
      {
        label: "Close",
        Icon: IconClose,
        onSelect: () => closeDockedEntity(ctx, id),
      },
    ];
  }
  return [
    { label: "Open", onSelect: () => ctx.panels.showPanel(id) },
    "divider",
    {
      label: other === "left" ? "Move to Left Sidebar" : "Move to Right Sidebar",
      onSelect: () => void withTransition(() => ctx.panels.dockPanel(id, other)),
    },
    {
      label: "Float in a Window",
      onSelect: () => ctx.panels.detachPanel(id, Math.max(innerWidth / 2 - 170, 0), 120),
    },
    "divider",
    // Back from the campaign menu, where each panel can be ticked again.
    {
      label: "Close",
      Icon: IconClose,
      onSelect: () => void withTransition(() => ctx.panels.setPanelClosed(id, true)),
    },
  ];
}

/**
 * Start watching a press on a docked panel's title. Once the pointer travels
 * past a small threshold, the panel pops out into a floating window that
 * follows the pointer; a release before that is an ordinary click.
 */
function pullOut(ctx: CampaignContext, id: DockItemId, e: ReactPointerEvent) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  // Keep the grab point where it was in the docked title.
  const header = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const grabX = Math.min(startX - header.left, 300);
  const grabY = startY - header.top;
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
    cleanup();
    ctx.panels.detachPanel(id, ev.clientX - grabX, ev.clientY - grabY);
    ctx.panels.startWindowDrag(id, ev, grabX, grabY);
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", cleanup);
    window.removeEventListener("pointercancel", cleanup);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", cleanup);
  window.addEventListener("pointercancel", cleanup);
}

/**
 * A tab is picked up at once: dragging along the strip reorders it, and
 * dragging away from the strip floats the panel in a window.
 */
function dragTab(ctx: CampaignContext, id: DockItemId, e: ReactPointerEvent) {
  const tab = e.currentTarget as HTMLElement;
  const rail = tab.closest<HTMLElement>(".sidebar-rail")!;
  startReorder({
    event: e,
    axis: "y",
    container: rail,
    items: () => [...rail.querySelectorAll<HTMLElement>(".rail-tab")],
    onDrop: (index) => ctx.panels.reorderPanel(id, index),
    outside: {
      when: "move",
      run: (ev) => {
        ctx.panels.spawnedFromTab.add(id);
        ctx.panels.detachPanel(id, ev.clientX - 120, ev.clientY - 18);
        ctx.panels.startWindowDrag(id, ev, 120, 18);
      },
    },
  });
}

/** The way along the x axis that widens a side. */
const growDirection = (side: Side) => (side === "left" ? 1 : -1);

/**
 * Drag a sidebar's edge to change its width. The width follows the pointer
 * from where it was grabbed, so any edge (the rail's or the body's) works, and
 * a shut sidebar counts as zero wide: dragging out far enough reopens it.
 */
function dragSideWidth(ctx: CampaignContext, side: Side, e: ReactPointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const s = ctx.panels.layout.value[side];
  const start = s.open ? s.width : 0;
  const grow = growDirection(side);
  const handle = e.currentTarget as HTMLElement;
  handle.dataset.dragging = "true";
  trackPointer(
    "ew-resize",
    (ev) => ctx.panels.setSideWidth(side, start + grow * (ev.clientX - e.clientX)),
    () => delete handle.dataset.dragging,
  );
}

/**
 * The separator on the tab strip's outer edge: drag it, or focus it and use
 * the arrow keys (Shift for bigger steps), Home to shut the sidebar, End to
 * widen it fully, and Enter (or a double-click) for the default width.
 */
function SidebarResizeHandle({ side }: { side: Side }) {
  const ctx = useCampaign();
  const s = useQuery(ctx.panels.layout)[side];
  const max = sidebarMaxWidth();

  function onKeyDown(e: ReactKeyboardEvent) {
    const width = keyedSideWidth(
      ctx.panels.layout.value[side],
      e.key,
      e.shiftKey,
      growDirection(side),
      sidebarMaxWidth(),
    );
    if (width === null) return;
    e.preventDefault();
    ctx.panels.setSideWidth(side, width);
  }

  return (
    // A focusable separator is an interactive widget (ARIA window splitter).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="sidebar-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} sidebar`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={s.open ? s.width : 0}
      aria-valuetext={s.open ? `${s.width} pixels wide` : "Collapsed"}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={(e) => dragSideWidth(ctx, side, e)}
      onDoubleClick={() => ctx.panels.setSideWidth(side, SIDEBAR_DEFAULT_W)}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Click a tab: the open tab closes its sidebar; any other shows its panel.
 * What a click does is decided from what was showing when it was clicked, so
 * clicks made while an earlier switch is still animating apply in order.
 * When one docked panel replaces another, the content slides the way the tabs
 * are stacked: down the strip slides up, up the strip slides down.
 */
function switchTo(ctx: CampaignContext, id: DockItemId, side: Side) {
  const s = ctx.panels.shownLayout.value[side];
  const from = s.active;
  if (s.open && from === id) {
    ctx.panels.setSideOpen(side, false);
    return;
  }
  // Opening slides the sidebar by CSS transition, which keeps it clickable throughout.
  if (!s.open || from === null) {
    ctx.panels.showPanel(id);
    return;
  }
  const direction = s.panels.indexOf(id) > s.panels.indexOf(from) ? "vt-tab-next" : "vt-tab-prev";
  void withTransition(() => ctx.panels.showPanel(id), { rootClass: direction });
}

/** How many members are online, counting this device. */
function useOnlineCount(campaign: Campaign) {
  const me = useQuery(device).id;
  const online = useQuery(campaign.online);
  return useQuery(campaign.members, () => campaign.memberViews()).filter(
    (m) => m.id === me || online.has(m.id),
  ).length;
}

/** A tab that selects its panel on click, or pulls it out into a window when dragged. */
function RailTab({
  campaign,
  id,
  side,
  selected,
  onMenu,
}: {
  campaign: Campaign;
  id: DockItemId;
  side: Side;
  selected: boolean;
  onMenu: (x: number, y: number) => void;
}) {
  const ctx = useCampaign();
  const panel = isPanelId(id) ? id : undefined;
  const records = useQuery(ctx.windows.records);
  const record = isEntityTab(id) ? ctx.windows.record(id, records) : undefined;
  const label = usePanelLabel(id, campaign) ?? record?.title ?? id.slice("entity:".length);
  const Icon = record?.icon ?? (record?.graphicRef ? undefined : IconOpenWindow);
  const onlineCount = useOnlineCount(campaign);
  const unread = useUnreadCount(campaign);

  function onPointerDown(e: ReactPointerEvent) {
    dragTab(ctx, id, e);
  }

  return (
    <Button
      variant="icon"
      role="tab"
      className="rail-tab"
      data-panel={panel ? id : undefined}
      data-entity-window={record ? id : undefined}
      label={
        label +
        (id === "chat" && unread ? `, ${unread} unread` : "") +
        (id === "members" ? `, ${onlineCount} online` : "")
      }
      aria-selected={selected}
      pressed={selected}
      data-unread={id === "chat" && unread > 0 ? Math.min(unread, 99) : undefined}
      data-online={id === "members" ? onlineCount : undefined}
      onClick={() => switchTo(ctx, id, side)}
      {...withPull(onPointerDown, onMenu)}
    >
      {panel ? (
        <PanelIcon id={panel} campaign={campaign} />
      ) : record?.graphicRef ? (
        <CampaignEntityGraphic
          campaign={campaign}
          kind={record.graphicRef.kind}
          id={record.graphicRef.id}
          defaultIcon={record.graphicDefaultIcon}
          size={22}
        />
      ) : Icon ? (
        <Icon size={22} />
      ) : null}
    </Button>
  );
}

function ActiveTab({
  campaign,
  id,
  onMenu,
}: {
  campaign: Campaign;
  id: DockItemId;
  onMenu: (x: number, y: number) => void;
}) {
  const ctx = useCampaign();
  const records = useQuery(ctx.windows.records);
  if (isPanelId(id)) {
    return (
      <PanelActionsProvider key={id}>
        <div className="sidebar-panel" style={{ viewTransitionName: `panel-${id}` }}>
          <header
            className="panel-header docked-header"
            {...withPull((e) => pullOut(ctx, id, e), onMenu)}
          >
            <PaneToggle id={id} />
            <PanelTitle id={id} campaign={campaign} />
            <PanelActionsSlot />
          </header>
          <div className="panel-body panel-content">
            <PanelContent id={id} campaign={campaign} />
          </div>
        </div>
      </PanelActionsProvider>
    );
  }

  const record = ctx.windows.record(id, records);
  const Icon = record?.icon ?? (record?.graphicRef ? undefined : IconOpenWindow);
  return (
    <div
      className="sidebar-panel entity-sidebar-panel"
      style={{ viewTransitionName: `panel-${id}` }}
    >
      <header
        className="panel-header docked-header"
        {...withPull((e) => pullOut(ctx, id, e), onMenu)}
      >
        {record?.graphicRef ? (
          <CampaignEntityGraphic
            campaign={campaign}
            kind={record.graphicRef.kind}
            id={record.graphicRef.id}
            defaultIcon={record.graphicDefaultIcon}
            size={22}
            className="window-icon"
          />
        ) : Icon ? (
          <Icon size={22} className="window-icon" />
        ) : null}
        <h2 className="panel-title" tabIndex={-1}>
          {record?.title ?? id.slice("entity:".length)}
        </h2>
        <Button variant="icon" label="Close window" onClick={() => closeDockedEntity(ctx, id)}>
          <IconClose size={22} />
        </Button>
      </header>
      <div className="panel-body entity-docked-body">
        {record ? (
          <EntityWindowContent campaign={campaign} record={record} />
        ) : (
          <p className="move-text move-window-text">This window is not available.</p>
        )}
        {record?.tags && record.tags.length > 0 && (
          <p className="muted item-tags">{record.tags.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

function PanelTitle({ id, campaign }: { id: PanelId; campaign: Campaign }) {
  return (
    <h2 className="panel-title" tabIndex={-1}>
      {usePanelLabel(id, campaign)}
    </h2>
  );
}

function closeDockedEntity(ctx: CampaignContext, id: DockItemId) {
  const record = ctx.windows.record(id);
  record?.close?.();
  ctx.windows.close(id);
}
