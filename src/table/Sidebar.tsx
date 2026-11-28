import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";
import { useUnreadCount } from "../features/chat/unread";
import { IconClose, IconOpenWindow, PROMINENT_ICON_SIZE } from "../ui/icons";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import Button from "../ui/Button";
import menuTrigger from "../ui/menuTrigger";
import { trackPointer } from "../ui/pointer";
import { startReorder } from "../ui/reorder";
import { withTransition } from "../ui/transition";
import { ContextMenu } from "../ui/ContextMenu";
import type { MenuItem } from "../ui/ContextMenu";
import { isPanelId, otherSide, sidebarMaxWidth } from "../workspace/panelLayout";
import type { DockItemId, Side, PanelId } from "../workspace/panelLayout";
import { EntityWindowContent } from "../workspace/entityWindows";
import { isEntityTab } from "../workspace/entityWindowState";
import type { EntityWindowRecord } from "../workspace/entityWindowState";
import CampaignEntityGraphic from "../workspace/EntityGraphic";
import { keyedSideWidth, SIDEBAR_DEFAULT_W } from "../workspace/layoutModel";
import { useCampaign } from "../workspace/campaignContext";
import type { CampaignContext } from "../workspace/campaignContext";
import { PanelActionsProvider, PanelActionsSlot } from "./PanelActions";
import { usePanelLabel } from "./panelLabels";
import { PanelContent, PanelIcon, PaneToggle } from "./panels";

const DRAG_THRESHOLD = 10;

/**
 * A sidebar: a vertical tab strip attached to a full-height body that slides
 * in from beyond its edge, pushing the strip ahead of it. The left one is the
 * right one mirrored. A side with no panels disappears, unless a window is
 * being dragged, when it shows as a place to drop it.
 */
function Sidebar({ side, campaign }: { side: Side; campaign: Campaign }) {
  const context = useCampaign();
  const s = useQuery(context.panels.shownLayout)[side];
  const dragging = useQuery(context.panels.windowDragging);
  const target = useQuery(context.panels.dockTarget);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const empty = s.panels.length === 0;
  if (empty && !dragging) return null;
  const { open, active } = s;

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
        <div
          className={`sidebar-rail strip dock-${side}`}
          role="tablist"
          aria-orientation="vertical"
        >
          {s.panels.map((id) => (
            <RailTab
              key={id}
              campaign={campaign}
              id={id}
              side={side}
              selected={open && active === id}
              onMenu={(x, y) => {
                setMenu({ x, y, items: tabMenu(context, id, side) });
              }}
            />
          ))}
        </div>
        {!empty && <SidebarResizeHandle side={side} />}
      </div>

      <section
        className={`sidebar-body panel dock-${side} dock-top dock-bottom`}
        role="tabpanel"
        inert={!open}
      >
        {/* The body's edge drags too, for a taller target; the rail's separator is the one for keyboards. */}
        <div
          className="sidebar-body-resize"
          aria-hidden="true"
          onPointerDown={(e) => {
            dragSideWidth(context, side, e);
          }}
        />
        {active && (
          <ActiveTab
            campaign={campaign}
            id={active}
            onMenu={(x, y) => {
              setMenu({ x, y, items: tabMenu(context, active, side) });
            }}
          />
        )}
      </section>
      {menu && (
        <ContextMenu
          {...menu}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
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
function tabMenu(context: CampaignContext, id: DockItemId, side: Side): MenuItem[] {
  const other = otherSide(side);
  return [
    {
      label: "Open",
      onSelect: () => {
        context.panels.showPanel(id);
      },
    },
    "divider",
    {
      label: other === "left" ? "Move to Left Sidebar" : "Move to Right Sidebar",
      onSelect: () =>
        void withTransition(() => {
          context.panels.dockPanel(id, other);
        }),
    },
    {
      label: "Float in a Window",
      onSelect: () => {
        floatTab(context, id);
      },
    },
    "divider",
    {
      label: "Close",
      Icon: IconClose,
      onSelect: () => {
        closeTab(context, id);
      },
    },
  ];
}

/** Floats a tab in a window near the top middle; an entity's window has its own size. */
function floatTab(context: CampaignContext, id: DockItemId) {
  if (isEntityTab(id))
    context.panels.detachPanel(id, Math.max(innerWidth / 2 - 190, 0), 96, 380, 440);
  else context.panels.detachPanel(id, Math.max(innerWidth / 2 - 170, 0), 120);
}

/** Closes a tab. A closed panel comes back from the campaign menu, where each panel can be ticked again. */
function closeTab(context: CampaignContext, id: DockItemId) {
  if (isEntityTab(id)) closeDockedEntity(context, id);
  else
    void withTransition(() => {
      context.panels.setPanelClosed(id, true);
    });
}

/**
 * Start watching a press on a docked panel's title. Once the pointer travels
 * past a small threshold, the panel pops out into a floating window that
 * follows the pointer; a release before that is an ordinary click.
 */
function pullOut(context: CampaignContext, id: DockItemId, e: ReactPointerEvent) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  // Keep the grab point where it was in the docked title.
  const header = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const grabX = Math.min(startX - header.left, 300);
  const grabY = startY - header.top;
  const move = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return;
    cleanup();
    context.panels.detachPanel(id, event.clientX - grabX, event.clientY - grabY);
    context.panels.startWindowDrag(id, event, grabX, grabY);
  };
  const cleanup = () => {
    globalThis.removeEventListener("pointermove", move);
    globalThis.removeEventListener("pointerup", cleanup);
    globalThis.removeEventListener("pointercancel", cleanup);
  };
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", cleanup);
  globalThis.addEventListener("pointercancel", cleanup);
}

/**
 * A tab is picked up at once: dragging along the strip reorders it, and
 * dragging away from the strip floats the panel in a window.
 */
function dragTab(context: CampaignContext, id: DockItemId, e: ReactPointerEvent) {
  const tab = e.currentTarget as HTMLElement;
  const rail = tab.closest<HTMLElement>(".sidebar-rail")!;
  startReorder({
    event: e,
    axis: "y",
    container: rail,
    items: () => [...rail.querySelectorAll<HTMLElement>(".rail-tab")],
    onDrop: (index) => {
      context.panels.reorderPanel(id, index);
    },
    outside: {
      when: "move",
      run: (event) => {
        context.panels.spawnedFromTab.add(id);
        context.panels.detachPanel(id, event.clientX - 120, event.clientY - 18);
        context.panels.startWindowDrag(id, event, 120, 18);
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
function dragSideWidth(context: CampaignContext, side: Side, e: ReactPointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const s = context.panels.layout.value[side];
  const start = s.open ? s.width : 0;
  const grow = growDirection(side);
  const handle = e.currentTarget as HTMLElement;
  handle.dataset["dragging"] = "true";
  trackPointer(
    "ew-resize",
    (event) => {
      context.panels.setSideWidth(side, start + grow * (event.clientX - e.clientX));
    },
    () => delete handle.dataset["dragging"],
  );
}

/**
 * The separator on the tab strip's outer edge: drag it, or focus it and use
 * the arrow keys (Shift for bigger steps), Home to shut the sidebar, End to
 * widen it fully, and Enter (or a double-click) for the default width.
 */
function SidebarResizeHandle({ side }: { side: Side }) {
  const context = useCampaign();
  const s = useQuery(context.panels.layout)[side];
  const max = sidebarMaxWidth();

  function onKeyDown(e: ReactKeyboardEvent) {
    const width = keyedSideWidth(
      context.panels.layout.value[side],
      e.key,
      e.shiftKey,
      growDirection(side),
      sidebarMaxWidth(),
    );
    if (width === null) return;
    e.preventDefault();
    context.panels.setSideWidth(side, width);
  }

  return (
    // A focusable separator is an interactive widget (ARIA window splitter).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="sidebar-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} sidebar`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={s.open ? s.width : 0}
      aria-valuetext={s.open ? `${s.width} pixels wide` : "Collapsed"}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={(e) => {
        dragSideWidth(context, side, e);
      }}
      onDoubleClick={() => {
        context.panels.setSideWidth(side, SIDEBAR_DEFAULT_W);
      }}
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
function switchTo(context: CampaignContext, id: DockItemId, side: Side) {
  const s = context.panels.shownLayout.value[side];
  const from = s.active;
  if (s.open && from === id) {
    context.panels.setSideOpen(side, false);
    return;
  }
  // Opening slides the sidebar by CSS transition, which keeps it clickable throughout.
  if (!s.open || from === null) {
    context.panels.showPanel(id);
    return;
  }
  const direction = s.panels.indexOf(id) > s.panels.indexOf(from) ? "vt-tab-next" : "vt-tab-prev";
  void withTransition(
    () => {
      context.panels.showPanel(id);
    },
    { rootClass: direction },
  );
}

/** How many members are online, counting this device. */
function useOnlineCount(campaign: Campaign) {
  const me = useQuery(device).id;
  const online = useQuery(campaign.online);
  return useQuery(campaign.members, () => campaign.memberViews()).filter(
    (m) => m.id === me || online.has(m.id),
  ).length;
}

/** The unread and online counts a tab carries: the chat's unread messages, the members' online players. */
function useTabBadge(campaign: Campaign, id: DockItemId) {
  const online = useOnlineCount(campaign);
  const unread = useUnreadCount(campaign);
  if (id === "chat")
    return {
      description: unread ? `, ${unread} unread` : "",
      unread: unread > 0 ? Math.min(unread, 99) : undefined,
      online: undefined,
    };
  if (id === "members") return { description: `, ${online} online`, unread: undefined, online };
  return { description: "", unread: undefined, online: undefined };
}

/** The icon of a window docked in the sidebar: its entity's graphic, or its own icon. */
function EntityTabIcon({
  campaign,
  record,
  className,
  size = 22,
}: {
  campaign: Campaign;
  record: EntityWindowRecord | undefined;
  className?: string;
  size?: number;
}) {
  if (record?.graphicRef)
    return (
      <CampaignEntityGraphic
        campaign={campaign}
        kind={record.graphicRef.kind}
        id={record.graphicRef.id}
        defaultIcon={record.graphicDefaultIcon}
        size={size}
        {...(className ? { className } : {})}
      />
    );
  const Icon = record?.icon ?? IconOpenWindow;
  return <Icon size={size} {...(className ? { className } : {})} />;
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
  const context = useCampaign();
  const panel = isPanelId(id) ? id : undefined;
  const records = useQuery(context.windows.records);
  const record = isEntityTab(id) ? context.windows.record(id, records) : undefined;
  const label = usePanelLabel(id, campaign) ?? entityTitle(id, record);
  const badge = useTabBadge(campaign, id);

  return (
    <Button
      variant="icon"
      role="tab"
      className="rail-tab"
      data-panel={panel ? id : undefined}
      data-entity-window={record ? id : undefined}
      label={label + badge.description}
      aria-selected={selected}
      pressed={selected}
      data-unread={badge.unread}
      data-online={badge.online}
      onClick={() => {
        switchTo(context, id, side);
      }}
      {...withPull((e) => {
        dragTab(context, id, e);
      }, onMenu)}
    >
      {panel ? (
        <PanelIcon id={panel} campaign={campaign} size={PROMINENT_ICON_SIZE} />
      ) : (
        <EntityTabIcon campaign={campaign} record={record} size={PROMINENT_ICON_SIZE} />
      )}
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
  const context = useCampaign();
  const records = useQuery(context.windows.records);
  if (isPanelId(id)) {
    return (
      <PanelActionsProvider key={id}>
        <div className="sidebar-panel" style={{ viewTransitionName: `panel-${id}` }}>
          <header
            className="panel-header docked-header"
            {...withPull((e) => {
              pullOut(context, id, e);
            }, onMenu)}
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

  const record = context.windows.record(id, records);
  return (
    <div
      className="sidebar-panel entity-sidebar-panel"
      style={{ viewTransitionName: `panel-${id}` }}
    >
      <header
        className="panel-header docked-header"
        {...withPull((e) => {
          pullOut(context, id, e);
        }, onMenu)}
      >
        <EntityTabIcon campaign={campaign} record={record} className="window-icon" />
        <h2 className="panel-title" tabIndex={-1}>
          {entityTitle(id, record)}
        </h2>
        <Button
          variant="icon"
          label="Close Window"
          onClick={() => {
            closeDockedEntity(context, id);
          }}
        >
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

/** A docked entity window's title, or its id when its record is gone. */
function entityTitle(id: DockItemId, record: EntityWindowRecord | undefined) {
  return record?.title ?? id.slice("entity:".length);
}

function closeDockedEntity(context: CampaignContext, id: DockItemId) {
  const record = context.windows.record(id);
  record?.close?.();
  context.windows.close(id);
}

export default Sidebar;
