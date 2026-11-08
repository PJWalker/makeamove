/*
 * The panel layout as plain data and pure functions, so the rules (which
 * panel is where, what tab is showing) can be tested without a browser.
 * panelLayout.ts keeps the live copy and the DOM-facing parts.
 *
 * Every panel is in exactly one place: docked on the left or the right,
 * floating in its own window, or closed (hidden until it's opened again).
 * `home` remembers the side a floating or closed panel came from, and
 * `order` its place among that side's tabs, so "dock" puts it back where it
 * was. Order keys are fractional indices: each side's tabs are sorted by
 * them, and a panel placed between two tabs gets a key between theirs, so
 * a hidden panel's key still sorts between the same neighbours later.
 */

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export type PanelId =
  | "scene"
  | "chat"
  | "characters"
  | "combat"
  | "libraries"
  | "reference"
  | "items"
  | "notes"
  | "members";
export type DockItemId = PanelId | `entity:${string}`;
export type Side = "left" | "right";

export const PANEL_ORDER: PanelId[] = [
  "scene",
  "chat",
  "characters",
  "combat",
  "libraries",
  "reference",
  "items",
  "notes",
  "members",
];

export interface FloatingWindow {
  id: DockItemId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface SideState {
  /** The tab showing, or null when nothing is docked here. */
  active: DockItemId | null;
  open: boolean;
  /** Width of the sidebar body in CSS pixels. */
  width: number;
  /** Docked panels, in tab order. */
  panels: DockItemId[];
}

export interface Layout {
  left: SideState;
  right: SideState;
  floating: FloatingWindow[];
  /** Panels closed from the campaign menu or their tab, shown nowhere. */
  closed: DockItemId[];
  home: Partial<Record<DockItemId, Side>>;
  /** Each panel's order key on its home side, kept while it is floating or closed. */
  order: Partial<Record<DockItemId, string>>;
}

export const SIDEBAR_DEFAULT_W = 340;
export const SIDEBAR_MIN_W = 280;
/** Dragging a sidebar narrower than this shuts it. */
const SIDEBAR_SNAP_SHUT_W = 180;
const SIDEBAR_KEY_STEP = 16;
const SIDEBAR_KEY_STEP_LARGE = 64;

const DEFAULT_SIDE: Record<PanelId, Side> = {
  scene: "left",
  chat: "right",
  notes: "right",
  members: "right",
  characters: "left",
  combat: "left",
  libraries: "right",
  reference: "right",
  items: "right",
};

const PANEL_IDS = new Set<string>(PANEL_ORDER);

function isDockItemId(id: unknown): id is DockItemId {
  return (
    typeof id === "string" && (PANEL_IDS.has(id) || (id.startsWith("entity:") && id.length > 7))
  );
}

export function isPanelId(id: DockItemId): id is PanelId {
  return PANEL_IDS.has(id);
}

function defaultSide(id: DockItemId): Side {
  return PANEL_IDS.has(id) ? DEFAULT_SIDE[id as PanelId] : "right";
}

export function defaultLayout(narrow: boolean): Layout {
  const left: DockItemId[] = ["scene", "characters", "combat"];
  const right: DockItemId[] = ["chat", "libraries", "reference", "items", "notes", "members"];
  return {
    left: { active: "characters", open: !narrow, width: SIDEBAR_DEFAULT_W, panels: left },
    right: { active: "chat", open: !narrow, width: SIDEBAR_DEFAULT_W, panels: right },
    floating: [],
    closed: [],
    home: {},
    order: { ...orderKeys(left), ...orderKeys(right) },
  };
}

/** Fresh order keys for tabs in this order. */
function orderKeys(panels: DockItemId[]): Layout["order"] {
  const keys = generateNKeysBetween(null, null, panels.length);
  return Object.fromEntries(panels.map((id, i) => [id, keys[i]]));
}

function isOrderKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/** Whether a side's tabs all have keys, sorted the way the tabs are. */
function inOrder(panels: DockItemId[], order: Layout["order"]) {
  const keys = panels.map((id) => order[id]);
  return keys.every((key, i) => {
    const prev = keys[i - 1];
    return key !== undefined && (i === 0 || (prev !== undefined && prev < key));
  });
}

export function locate(l: Layout, id: DockItemId): Side | "floating" | "closed" {
  if (l.floating.some((w) => w.id === id)) return "floating";
  if (l.closed.includes(id)) return "closed";
  if (l.left.panels.includes(id)) return "left";
  if (l.right.panels.includes(id)) return "right";
  return "closed";
}

/** The sides, left first. */
export const SIDES: Side[] = ["left", "right"];

/** Keep a side consistent: the active tab is one of its panels, and an empty side is closed. */
function tidy(s: SideState): SideState {
  const active = s.active && s.panels.includes(s.active) ? s.active : (s.panels[0] ?? null);
  return { ...s, active, open: active ? s.open : false };
}

/**
 * Make saved data safe to use: unknown panels dropped, duplicates removed,
 * and any panel that went missing put back where it starts.
 */
export function normalise(saved: unknown, narrow: boolean): Layout {
  const base = defaultLayout(narrow);
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<Layout>;
  const seen = new Set<DockItemId>();
  const take = (ids: unknown): DockItemId[] =>
    (Array.isArray(ids) ? ids : []).filter((id): id is DockItemId => {
      if (!isDockItemId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const closed = take(s.closed);
  const floating = (Array.isArray(s.floating) ? s.floating : []).filter(
    (w): w is FloatingWindow => {
      if (!w || !isDockItemId(w.id) || seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    },
  );
  const side = (name: Side): SideState => {
    const v = s[name];
    return {
      active: isDockItemId(v?.active) ? v.active : null,
      open: narrow ? false : (v?.open ?? true),
      width: typeof v?.width === "number" ? v.width : SIDEBAR_DEFAULT_W,
      panels: take(v?.panels),
    };
  };
  const left = side("left");
  const right = side("right");
  for (const id of PANEL_ORDER) {
    if (!seen.has(id)) (DEFAULT_SIDE[id] === "left" ? left : right).panels.push(id);
  }
  const savedOrder: unknown = s.order;
  let order: Layout["order"] = Object.fromEntries(
    Object.entries(savedOrder && typeof savedOrder === "object" ? savedOrder : {}).filter(
      ([id, key]) => isDockItemId(id) && isOrderKey(key),
    ),
  );
  // Keys that don't match the saved tab order (or are missing) are made afresh.
  for (const { panels } of [left, right]) {
    if (!inOrder(panels, order)) order = { ...order, ...orderKeys(panels) };
  }
  return { left: tidy(left), right: tidy(right), floating, closed, home: s.home ?? {}, order };
}

/** The layout as shown, leaving out panels this campaign doesn't have (Combat without initiative). */
export function withoutPanels(l: Layout, ids: PanelId[]): Layout {
  if (!ids.length) return l;
  const keep = (id: DockItemId) => !isPanelId(id) || !ids.includes(id);
  return {
    ...l,
    left: tidy({ ...l.left, panels: l.left.panels.filter(keep) }),
    right: tidy({ ...l.right, panels: l.right.panels.filter(keep) }),
    floating: l.floating.filter((w) => keep(w.id)),
  };
}

/** Click a tab: show it, or tuck its sidebar away if it is already the open tab. */
export function selectTab(l: Layout, id: DockItemId): Layout {
  const side = locate(l, id);
  if (side === "floating" || side === "closed") return l;
  const s = l[side];
  return { ...l, [side]: { ...s, active: id, open: !(s.open && s.active === id) } };
}

/** Bring a panel into view without ever hiding it. */
export function showTab(l: Layout, id: DockItemId): Layout {
  const side = locate(l, id);
  if (side === "closed") return dock(l, id);
  if (side === "floating") return l;
  return { ...l, [side]: { ...l[side], active: id, open: true } };
}

export function setOpen(l: Layout, side: Side, open: boolean): Layout {
  return { ...l, [side]: tidy({ ...l[side], open }) };
}

/** The narrowest the map may get between two open sidebars before one of them has to give way. */
export const MIN_CANVAS_W = 320;
/** The width of a side's tab strip. */
const RAIL_W = 48;

/** Whether both sidebars open at once would leave too little of the map in a window this wide. */
export function bothSidesCramped(l: Layout, viewportWidth: number): boolean {
  return l.left.width + l.right.width + 2 * RAIL_W + MIN_CANVAS_W > viewportWidth;
}

/**
 * In a window too narrow for both sidebars and the map, opening one sidebar
 * shuts the other. A side that was already open stays as it is.
 */
export function oneSideIfCramped(prev: Layout, next: Layout, viewportWidth: number): Layout {
  if (!next.left.open || !next.right.open || !bothSidesCramped(next, viewportWidth)) return next;
  if (!prev.left.open) return { ...next, right: { ...next.right, open: false } };
  if (!prev.right.open) return { ...next, left: { ...next.left, open: false } };
  return next;
}

/** Resize a side; pulling it very narrow snaps it shut, and widening it again reopens it. */
export function resizeSide(l: Layout, side: Side, width: number, max: number): Layout {
  const s = l[side];
  if (width < SIDEBAR_SNAP_SHUT_W) return s.open ? { ...l, [side]: { ...s, open: false } } : l;
  const w = Math.round(Math.min(Math.max(width, SIDEBAR_MIN_W), Math.max(SIDEBAR_MIN_W, max)));
  return w !== s.width || !s.open ? { ...l, [side]: { ...s, width: w, open: true } } : l;
}

/**
 * The width a key asks of a side's resize separator, or null for keys it
 * doesn't handle. A shut side counts as zero wide: growing reopens it at its
 * last width, Home shuts it, End widens it fully, and Enter resets it.
 * `grow` is the direction (+1 right, -1 left) that widens the side.
 */
export function keyedSideWidth(
  s: SideState,
  key: string,
  shift: boolean,
  grow: 1 | -1,
  max: number,
): number | null {
  const step = shift ? SIDEBAR_KEY_STEP_LARGE : SIDEBAR_KEY_STEP;
  const delta = key === "ArrowRight" ? grow * step : key === "ArrowLeft" ? -grow * step : 0;
  if (delta > 0) return s.open ? s.width + delta : s.width;
  if (delta < 0) return s.open ? Math.max(SIDEBAR_MIN_W, s.width + delta) : null;
  if (key === "Home") return 0;
  if (key === "End") return max;
  if (key === "Enter") return SIDEBAR_DEFAULT_W;
  return null;
}

function without(l: Layout, id: DockItemId): Layout {
  return {
    ...l,
    left: tidy({ ...l.left, panels: l.left.panels.filter((p) => p !== id) }),
    right: tidy({ ...l.right, panels: l.right.panels.filter((p) => p !== id) }),
    floating: l.floating.filter((w) => w.id !== id),
    closed: l.closed.filter((p) => p !== id),
  };
}

/** Close a panel: it leaves its sidebar or window until it's opened again (on the side it was on). */
export function close(l: Layout, id: DockItemId): Layout {
  const where = locate(l, id);
  if (where === "closed") return l;
  const next = without(l, id);
  return {
    ...next,
    closed: [...next.closed, id],
    home: where === "floating" ? l.home : { ...l.home, [id]: where },
  };
}

/** Pull a docked panel out into a window. */
export function detach(l: Layout, id: DockItemId, win: Omit<FloatingWindow, "id">): Layout {
  const where = locate(l, id);
  if (where === "floating") return l;
  const next = without(l, id);
  return {
    ...next,
    floating: [...next.floating, { id, ...win }],
    home: where === "closed" ? l.home : { ...l.home, [id]: where },
  };
}

/**
 * Place `id` among a side's tabs (which don't include it): at `index`, or
 * where its order key sorts. Returns the tabs and the key it now has.
 */
function place(
  l: Layout,
  panels: DockItemId[],
  id: DockItemId,
  index: number | "remembered",
): { panels: DockItemId[]; key: string } {
  const keys = panels.map((p) => l.order[p] ?? null);
  const remembered = l.order[id];
  const at =
    index !== "remembered"
      ? Math.min(Math.max(index, 0), panels.length)
      : remembered === undefined
        ? panels.length
        : keys.filter((k) => k !== null && k <= remembered).length;
  const before = keys[at - 1] ?? null;
  const after = keys[at] ?? null;
  // The remembered key is kept unless a tab placed since has taken it.
  const fits =
    index === "remembered" &&
    remembered !== undefined &&
    (before === null || before < remembered) &&
    (after === null || remembered < after);
  const key = fits ? remembered : generateKeyBetween(before, after);
  return { panels: panels.toSpliced(at, 0, id), key };
}

/**
 * Dock a panel on a side (its home side if none is given), from wherever it
 * is now, and show it. `index` places the tab; without one, a panel going
 * back to its own side returns to the place it had there, and otherwise goes
 * at the end. With `reveal` false a closed sidebar stays closed, its new tab
 * showing when it next opens.
 */
export function dock(
  l: Layout,
  id: DockItemId,
  side: Side = l.home[id] ?? defaultSide(id),
  index?: number,
  reveal = true,
): Layout {
  const where = locate(l, id);
  const from = where === "floating" || where === "closed" ? l.home[id] : where;
  const next = without(l, id);
  const target = next[side].panels;
  const { panels, key } = place(
    l,
    target,
    id,
    index ?? (from === side ? "remembered" : target.length),
  );
  const open = reveal || next[side].open;
  return {
    ...next,
    [side]: { ...next[side], panels, active: id, open },
    home: { ...l.home, [id]: side },
    order: { ...l.order, [id]: key },
  };
}

/** Where a panel is, for the "Move to…" menu. */
export const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

/** Move a docked tab to a place in its own sidebar, without changing what is showing. */
export function reorder(l: Layout, id: DockItemId, index: number): Layout {
  const side = locate(l, id);
  if (side === "floating" || side === "closed") return l;
  const { panels, key } = place(
    l,
    l[side].panels.filter((p) => p !== id),
    id,
    index,
  );
  return { ...l, [side]: { ...l[side], panels }, order: { ...l.order, [id]: key } };
}
