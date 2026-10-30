/*
 * The panel layout as plain data and pure functions, so the rules (which
 * panel is where, what tab is showing) can be tested without a browser.
 * panelLayout.ts keeps the live copy and the DOM-facing parts.
 *
 * Every panel is in exactly one place: docked on the left or the right,
 * floating in its own window, or closed (hidden until it's opened again).
 * `home` remembers the side a floating or closed panel came from, so
 * "dock" puts it back.
 */

export type PanelId = 'scene' | 'chat' | 'characters' | 'combat' | 'libraries' | 'items' | 'notes' | 'members'
export type DockItemId = PanelId | `entity:${string}`
export type Side = 'left' | 'right'

export const PANEL_ORDER: PanelId[] = ['scene', 'chat', 'characters', 'combat', 'libraries', 'items', 'notes', 'members']

export interface FloatingWindow {
  id: DockItemId
  x: number
  y: number
  w: number
  h: number
  z: number
}

export interface SideState {
  /** The tab showing, or null when nothing is docked here. */
  active: DockItemId | null
  open: boolean
  /** Width of the sidebar body in CSS pixels. */
  width: number
  /** Docked panels, in tab order. */
  panels: DockItemId[]
}

export interface Layout {
  left: SideState
  right: SideState
  floating: FloatingWindow[]
  /** Panels closed from the campaign menu or their tab, shown nowhere. */
  closed: DockItemId[]
  home: Partial<Record<DockItemId, Side>>
}

export const SIDEBAR_DEFAULT_W = 340

const DEFAULT_SIDE: Record<PanelId, Side> = {
  scene: 'left',
  chat: 'right',
  notes: 'right',
  members: 'right',
  characters: 'left',
  combat: 'left',
  libraries: 'right',
  items: 'right',
}

const PANEL_IDS = new Set<string>(PANEL_ORDER)

function isDockItemId(id: unknown): id is DockItemId {
  return typeof id === 'string' && (PANEL_IDS.has(id) || id.startsWith('entity:') && id.length > 7)
}

export function isPanelId(id: DockItemId): id is PanelId {
  return PANEL_IDS.has(id)
}

function defaultSide(id: DockItemId): Side {
  return PANEL_IDS.has(id) ? DEFAULT_SIDE[id as PanelId] : 'right'
}

export function defaultLayout(narrow: boolean): Layout {
  return {
    left: { active: 'characters', open: !narrow, width: SIDEBAR_DEFAULT_W, panels: ['scene', 'characters', 'combat'] },
    right: { active: 'chat', open: !narrow, width: SIDEBAR_DEFAULT_W, panels: ['chat', 'libraries', 'items', 'notes', 'members'] },
    floating: [],
    closed: [],
    home: {},
  }
}

export function locate(l: Layout, id: DockItemId): Side | 'floating' | 'closed' {
  if (l.floating.some((w) => w.id === id)) return 'floating'
  if (l.closed.includes(id)) return 'closed'
  if (l.left.panels.includes(id)) return 'left'
  if (l.right.panels.includes(id)) return 'right'
  return 'closed'
}

/** The sides, left first. */
export const SIDES: Side[] = ['left', 'right']

/** Keep a side consistent: the active tab is one of its panels, and an empty side is closed. */
function tidy(s: SideState): SideState {
  const active = s.active && s.panels.includes(s.active) ? s.active : (s.panels[0] ?? null)
  return { ...s, active, open: active ? s.open : false }
}

/**
 * Make saved data safe to use: unknown panels dropped, duplicates removed,
 * and any panel that went missing put back where it starts.
 */
export function normalise(saved: unknown, narrow: boolean): Layout {
  const base = defaultLayout(narrow)
  if (!saved || typeof saved !== 'object') return base
  const s = saved as Partial<Layout>
  const seen = new Set<DockItemId>()
  const take = (ids: unknown): DockItemId[] =>
    (Array.isArray(ids) ? ids : []).filter((id): id is DockItemId => {
      if (!isDockItemId(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
  const closed = take(s.closed)
  const floating = (Array.isArray(s.floating) ? s.floating : []).filter((w): w is FloatingWindow => {
    if (!w || !isDockItemId(w.id) || seen.has(w.id)) return false
    seen.add(w.id)
    return true
  })
  const side = (name: Side): SideState => {
    const v = s[name]
    return {
      active: isDockItemId(v?.active) ? v.active : null,
      open: narrow ? false : (v?.open ?? true),
      width: typeof v?.width === 'number' ? v.width : SIDEBAR_DEFAULT_W,
      panels: take(v?.panels),
    }
  }
  const left = side('left')
  const right = side('right')
  for (const id of PANEL_ORDER) {
    if (!seen.has(id)) (DEFAULT_SIDE[id] === 'left' ? left : right).panels.push(id)
  }
  return { left: tidy(left), right: tidy(right), floating, closed, home: s.home ?? {} }
}

/** The layout as shown, leaving out panels this campaign doesn't have (Combat without initiative). */
export function withoutPanels(l: Layout, ids: PanelId[]): Layout {
  if (!ids.length) return l
  const keep = (id: DockItemId) => !isPanelId(id) || !ids.includes(id)
  return {
    ...l,
    left: tidy({ ...l.left, panels: l.left.panels.filter(keep) }),
    right: tidy({ ...l.right, panels: l.right.panels.filter(keep) }),
    floating: l.floating.filter((w) => keep(w.id)),
  }
}

/** Click a tab: show it, or tuck its sidebar away if it is already the open tab. */
export function selectTab(l: Layout, id: DockItemId): Layout {
  const side = locate(l, id)
  if (side === 'floating' || side === 'closed') return l
  const s = l[side]
  return { ...l, [side]: { ...s, active: id, open: !(s.open && s.active === id) } }
}

/** Bring a panel into view without ever hiding it. */
export function showTab(l: Layout, id: DockItemId): Layout {
  const side = locate(l, id)
  if (side === 'closed') return dock(l, id)
  if (side === 'floating') return l
  return { ...l, [side]: { ...l[side], active: id, open: true } }
}

export function setOpen(l: Layout, side: Side, open: boolean): Layout {
  return { ...l, [side]: tidy({ ...l[side], open }) }
}

function without(l: Layout, id: DockItemId): Layout {
  return {
    ...l,
    left: tidy({ ...l.left, panels: l.left.panels.filter((p) => p !== id) }),
    right: tidy({ ...l.right, panels: l.right.panels.filter((p) => p !== id) }),
    floating: l.floating.filter((w) => w.id !== id),
    closed: l.closed.filter((p) => p !== id),
  }
}

/** Close a panel: it leaves its sidebar or window until it's opened again (on the side it was on). */
export function close(l: Layout, id: DockItemId): Layout {
  const where = locate(l, id)
  if (where === 'closed') return l
  const next = without(l, id)
  return { ...next, closed: [...next.closed, id], home: where === 'floating' ? l.home : { ...l.home, [id]: where } }
}

/** Pull a docked panel out into a window. */
export function detach(l: Layout, id: DockItemId, win: Omit<FloatingWindow, 'id'>): Layout {
  const where = locate(l, id)
  if (where === 'floating') return l
  const next = without(l, id)
  return { ...next, floating: [...next.floating, { id, ...win }], home: where === 'closed' ? l.home : { ...l.home, [id]: where } }
}

/**
 * Dock a panel on a side (its home side if none is given), from wherever it
 * is now, and show it. `index` places the tab; the default is the end. With
 * `reveal` false a closed sidebar stays closed, its new tab showing when it
 * next opens.
 */
export function dock(l: Layout, id: DockItemId, side: Side = l.home[id] ?? defaultSide(id), index?: number, reveal = true): Layout {
  const next = without(l, id)
  const panels = [...next[side].panels]
  panels.splice(index ?? panels.length, 0, id)
  const open = reveal || next[side].open
  return {
    ...next,
    [side]: { ...next[side], panels, active: id, open },
    home: { ...l.home, [id]: side },
  }
}

/** Where a panel is, for the "Move to…" menu. */
export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/** Move a docked tab to a place in its own sidebar, without changing what is showing. */
export function reorder(l: Layout, id: DockItemId, index: number): Layout {
  const side = locate(l, id)
  if (side === 'floating' || side === 'closed') return l
  const panels = l[side].panels.filter((p) => p !== id)
  panels.splice(Math.min(Math.max(index, 0), panels.length), 0, id)
  return { ...l, [side]: { ...l[side], panels } }
}
