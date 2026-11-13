import { batch, derived, store, type ReadonlyStore } from "../lib/store";
import { useSyncExternalStore } from "react";
import type { LocalDoc, LocalValue } from "../data/localDoc";
import { dropLine, indexAmong } from "../ui/reorder";
import { withTransition } from "../ui/transition";
import { nextZ, noteZ } from "../ui/windows";
import { trackPointer } from "../ui/pointer";
import { RESIZE_CURSORS, resizeRect, type Rect, type ResizeDir } from "../ui/resizeRect";
import {
  PANEL_ORDER,
  SIDEBAR_MIN_W,
  SIDES,
  close,
  resizeSide,
  detach,
  dock,
  locate,
  normalise,
  oneSideIfCramped,
  reorder,
  otherSide,
  setOpen,
  showTab,
  type FloatingWindow,
  type DockItemId,
  type Layout,
  type PanelId,
  type Side,
  withoutPanels,
  isPanelId,
} from "./layoutModel";
import { useQuery } from "../ui/useQuery";
import {
  IconCharacters,
  IconChat,
  IconCombat,
  IconItems,
  IconLibraries,
  IconMap,
  IconMembers,
  IconNotes,
  IconPlayerCharacter,
  IconReference,
  type Icon,
} from "../ui/icons";

export { PANEL_ORDER, SIDEBAR_MIN_W, otherSide, isPanelId, locate };
export type { DockItemId, FloatingWindow, PanelId, Side };

export const PANELS: Record<PanelId, { label: string; Icon: Icon }> = {
  scene: { label: "Scenes", Icon: IconMap },
  chat: { label: "Chat", Icon: IconChat },
  pc: { label: "My Character", Icon: IconPlayerCharacter },
  characters: { label: "Characters", Icon: IconCharacters },
  combat: { label: "Combat", Icon: IconCombat },
  libraries: { label: "Libraries", Icon: IconLibraries },
  reference: { label: "Reference", Icon: IconReference },
  items: { label: "Items", Icon: IconItems },
  notes: { label: "Notes", Icon: IconNotes },
  members: { label: "Members", Icon: IconMembers },
};

/*
 * Where each panel lives: docked on the left or right, or floating in its own
 * window (the rules are in layoutModel.ts). Kept per campaign in this
 * device's local document.
 */

export const sidebarMaxWidth = () => Math.max(SIDEBAR_MIN_W, Math.min(720, innerWidth - 160));

const narrow = () => matchMedia("(max-width: 600px)").matches;

/**
 * Window geometry is always stored as whole pixels. Pointer coordinates can be
 * fractional (zoom, high-DPI), and fractional boxes render with blurry edges.
 */
function whole<T extends Record<string, number | undefined>>(geometry: T): T {
  const out = { ...geometry };
  for (const k in out) if (typeof out[k] === "number") out[k] = Math.round(out[k]) as T[typeof k];
  return out;
}

function read(stored: unknown): Layout {
  const l = normalise(stored ?? null, narrow());
  return {
    ...l,
    floating: l.floating.map((w) => ({ ...w, ...whole({ x: w.x, y: w.y, w: w.w, h: w.h }) })),
  };
}

/** Whether a panel can be seen right now: floating, or the open tab of an open sidebar. */
function visibleIn(l: Layout, id: DockItemId) {
  const side = locate(l, id);
  if (side === "floating") return true;
  if (side === "closed") return false;
  const s = l[side];
  return s.open && s.active === id;
}

function sideAt(x: number, y: number): Side | null {
  for (const side of SIDES) {
    const el = document.querySelector(`.sidebar[data-side="${side}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return side;
  }
  return null;
}

/** The tabs of a side as elements, and where among them a pointer at this height would drop. */
function tabsOf(side: Side) {
  return [...document.querySelectorAll<HTMLElement>(`.sidebar[data-side="${side}"] .rail-tab`)];
}

export class PanelLayout {
  readonly layout: LocalValue<Layout>;
  /** Panels the open campaign doesn't have, such as Combat for a system without initiative. */
  readonly unavailablePanels = store<PanelId[]>([]);
  /** The layout as it shows, without the unavailable panels. */
  readonly shownLayout: ReadonlyStore<Layout>;
  readonly floatingWindows: ReadonlyStore<(FloatingWindow & { id: PanelId })[]>;
  /** Pixels each side takes: its body when open, and its tab strip. */
  readonly dockInsets: ReadonlyStore<Record<Side, { body: number; total: number }>>;

  /** The side a dragged window is over, which it would dock on if dropped. */
  readonly dockTarget = store<Side | null>(null);
  /** True while a window is being dragged, so empty sides can show as drop zones. */
  readonly windowDragging = store(false);
  /** Panels just pulled out of a tab, whose window should grow out of the tab icon. */
  readonly spawnedFromTab = new Set<DockItemId>();
  /*
   * A window being moved or resized shows its live geometry from `liveWindow`,
   * which only that window reads. The layout takes the result once, on
   * release, so the rest of the table doesn't re-render (and the local
   * document isn't written) on every pointer move.
   */
  readonly liveWindow = store<FloatingWindow | null>(null);
  /** The window being dragged and where its pointer is, so it can shrink to a tab over a sidebar. */
  readonly windowPointer = store<{ id: DockItemId; x: number; y: number } | null>(null);

  constructor(local: LocalDoc) {
    this.layout = local.value("layout", read);
    // Saved windows keep their order; anything opened later goes above them.
    for (const w of this.layout.value.floating) noteZ(w.z);
    this.shownLayout = derived([this.layout, this.unavailablePanels], () =>
      withoutPanels(this.layout.value, this.unavailablePanels.value),
    );
    this.floatingWindows = derived([this.shownLayout], () =>
      this.shownLayout.value.floating.filter((w): w is FloatingWindow & { id: PanelId } =>
        isPanelId(w.id),
      ),
    );
    this.dockInsets = derived([this.shownLayout], () => {
      const l = this.shownLayout.value;
      const of = (side: Side) => {
        const s = l[side];
        const body = s.open && s.panels.length ? s.width : 0;
        return { body, total: body + (s.panels.length ? 48 : 0) };
      };
      return { left: of("left"), right: of("right") };
    });
  }

  /** Every change to the layout goes through here, so narrow windows show one sidebar at a time. */
  #commit(next: Layout) {
    this.layout.value = oneSideIfCramped(this.layout.value, next, innerWidth);
  }

  /** Resize a side; pulling it very narrow snaps it shut, and widening it again reopens it. */
  setSideWidth(side: Side, width: number) {
    this.#commit(resizeSide(this.layout.value, side, width, sidebarMaxWidth()));
  }

  reorderPanel(id: DockItemId, index: number) {
    this.#commit(reorder(this.layout.value, id, index));
  }

  /** Whether a panel is in a window of its own; components pass the layout they read. */
  isFloating(id: DockItemId, l: Layout = this.layout.value) {
    return locate(l, id) === "floating";
  }

  panelVisible(id: DockItemId) {
    return visibleIn(this.layout.value, id);
  }

  setSideOpen(side: Side, open: boolean) {
    this.#commit(setOpen(this.layout.value, side, open));
  }

  /** Bring a panel into view without ever hiding it, unlike clicking its tab. */
  showPanel(id: DockItemId) {
    if (this.isFloating(id)) this.raiseWindow(id);
    else this.#commit(showTab(this.layout.value, id));
  }

  detachPanel(id: DockItemId, x: number, y: number, w = 340, h = 440) {
    // Windows share one stacking order with pop-ups (ui/windows.ts).
    this.#commit(detach(this.layout.value, id, { ...whole({ x, y, w, h }), z: nextZ() }));
  }

  /** Dock a panel on a side, or back where it came from. Works from a window or the other side. */
  dockPanel(id: DockItemId, side?: Side, index?: number, reveal = true) {
    this.#commit(dock(this.layout.value, id, side, index, reveal));
  }

  /** Close a panel, or open a closed one again where it was. */
  setPanelClosed(id: DockItemId, closed: boolean) {
    if (closed) this.#commit(close(this.layout.value, id));
    else if (this.isClosed(id)) this.#commit(dock(this.layout.value, id));
  }

  closeEntityTab(id: DockItemId) {
    this.#commit(close(this.layout.value, id));
  }

  isClosed(id: DockItemId) {
    return this.layout.value.closed.includes(id);
  }

  raiseWindow(id: DockItemId) {
    this.updateWindow(id, { z: nextZ() });
  }

  updateWindow(id: DockItemId, patch: Partial<Omit<FloatingWindow, "id">>) {
    const l = this.layout.value;
    const clean = whole(patch);
    this.#commit({ ...l, floating: l.floating.map((w) => (w.id === id ? { ...w, ...clean } : w)) });
  }

  #setLiveRect(id: DockItemId, rect: Partial<Rect>) {
    const live = this.liveWindow.value;
    const from = live?.id === id ? live : this.layout.value.floating.find((w) => w.id === id);
    if (from) this.liveWindow.value = { ...from, ...whole(rect) };
  }

  /** Hand the live geometry to the layout. */
  #commitLiveRect() {
    const live = this.liveWindow.value;
    if (!live) return;
    batch(() => {
      this.updateWindow(live.id, { x: live.x, y: live.y, w: live.w, h: live.h });
      this.liveWindow.value = null;
    });
  }

  /** Resize a floating window from an edge or corner; call from a resize zone's pointerdown. */
  startWindowResize(id: DockItemId, e: PointerEvent, dir: ResizeDir) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.raiseWindow(id);
    const start = this.layout.value.floating.find((w) => w.id === id);
    if (!start) return;
    trackPointer(
      RESIZE_CURSORS[dir],
      (ev) =>
        this.#setLiveRect(
          id,
          resizeRect(start, dir, ev.clientX - e.clientX, ev.clientY - e.clientY),
        ),
      () => this.#commitLiveRect(),
    );
  }

  /** Drag a floating window, including one just pulled out of a sidebar. */
  startWindowDrag(id: DockItemId, e: PointerEvent, grabX: number, grabY: number) {
    this.raiseWindow(id);
    this.windowDragging.value = true;
    const marker = dropLine("y");
    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(ev.clientX - grabX, -200), innerWidth - 80);
      const y = Math.min(Math.max(ev.clientY - grabY, 0), innerHeight - 40);
      this.#setLiveRect(id, { x, y });
      const side = sideAt(ev.clientX, ev.clientY);
      this.dockTarget.value = side;
      this.windowPointer.value = { id, x: ev.clientX, y: ev.clientY };
      if (side) marker.show(tabsOf(side), indexAmong(tabsOf(side), "y", ev));
      else marker.hide();
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const side = sideAt(ev.clientX, ev.clientY);
      marker.hide();
      this.#commitLiveRect();
      if (side) {
        const index = indexAmong(tabsOf(side), "y", ev);
        // Dropped on a closed sidebar, it joins the tabs without opening it.
        void withTransition(() => this.dockPanel(id, side, index, false));
      }
      this.dockTarget.value = null;
      this.windowDragging.value = false;
      this.windowPointer.value = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    move(e);
  }
}

/** Whether a panel shows, re-rendering when that changes. */
export function usePanelVisible(panels: PanelLayout, id: DockItemId) {
  return visibleIn(useQuery(panels.layout), id);
}

/** Read a store that holds one window's state, re-rendering only the window it's for. */
function useFor<T extends { id: DockItemId }>(
  s: ReadonlyStore<T | null>,
  id: DockItemId | undefined,
) {
  return useSyncExternalStore(s.subscribe, () => (id && s.value?.id === id ? s.value : null));
}

/** A floating window as it shows: its live geometry while it's being moved or resized. */
export function useWindowRect<W extends FloatingWindow | undefined>(
  panels: PanelLayout,
  win: W,
): W {
  return (useFor(panels.liveWindow, win?.id) as W | null) ?? win;
}

/** Where the pointer is while it drags window `id`, or null when it isn't. */
export function useWindowPointer(panels: PanelLayout, id: DockItemId) {
  return useFor(panels.windowPointer, id);
}
