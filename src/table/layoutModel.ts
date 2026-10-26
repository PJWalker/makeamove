/*
 * The panel layout as plain data and pure functions, so the rules (which
 * panel is where, what tab is showing) can be tested without a browser.
 * panelLayout.ts keeps the live copy and the DOM-facing parts.
 *
 * Every panel is in exactly one place: docked on the left or the right, or
 * floating in its own window. `home` remembers the side a floating panel
 * came from, so "dock" puts it back.
 */

export type PanelId = 'scene' | 'chat' | 'characters' | 'libraries' | 'notes' | 'members'
export type Side = 'left' | 'right'

export const PANEL_ORDER: PanelId[] = ['scene', 'chat', 'characters', 'libraries', 'notes', 'members']

export interface FloatingWindow {
  id: PanelId
  x: number
  y: number
  w: number
  h: number
  z: number
}

export interface SideState {
  /** The tab showing, or null when nothing is docked here. */
  active: PanelId | null
  open: boolean
  /** Width of the sidebar body in CSS pixels. */
  width: number
  /** Docked panels, in tab order. */
  panels: PanelId[]
}

export interface Layout {
  left: SideState
  right: SideState
  floating: FloatingWindow[]
  home: Partial<Record<PanelId, Side>>
}

export const SIDEBAR_DEFAULT_W = 340

const DEFAULT_SIDE: Record<PanelId, Side> = {
  scene: 'left',
  chat: 'right',
  notes: 'right',
  members: 'right',
  characters: 'left',
  libraries: 'right',
}

export const sideOfDefault = (id: PanelId): Side => DEFAULT_SIDE[id]

export function defaultLayout(narrow: boolean): Layout {
  return {
    left: { active: 'characters', open: !narrow, width: SIDEBAR_DEFAULT_W, panels: ['scene', 'characters'] },
    right: { active: 'chat', open: !narrow, width: SIDEBAR_DEFAULT_W, panels: ['chat', 'libraries', 'notes', 'members'] },
    floating: [],
    home: {},
  }
}

export function locate(l: Layout, id: PanelId): Side | 'floating' {
  if (l.floating.some((w) => w.id === id)) return 'floating'
  return l.left.panels.includes(id) ? 'left' : 'right'
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
  const known = new Set<PanelId>(PANEL_ORDER)
  const seen = new Set<PanelId>()
  const take = (ids: unknown): PanelId[] =>
    (Array.isArray(ids) ? ids : []).filter((id): id is PanelId => {
      if (!known.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
  const floating = (Array.isArray(s.floating) ? s.floating : []).filter((w): w is FloatingWindow => {
    if (!w || !known.has(w.id) || seen.has(w.id)) return false
    seen.add(w.id)
    return true
  })
  const side = (name: Side): SideState => {
    const v = s[name]
    return {
      active: (v?.active as PanelId | null) ?? null,
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
  return { left: tidy(left), right: tidy(right), floating, home: s.home ?? {} }
}

/** Click a tab: show it, or tuck its sidebar away if it is already the open tab. */
export function selectTab(l: Layout, id: PanelId): Layout {
  const side = locate(l, id)
  if (side === 'floating') return l
  const s = l[side]
  return { ...l, [side]: { ...s, active: id, open: !(s.open && s.active === id) } }
}

/** Bring a panel into view without ever hiding it. */
export function showTab(l: Layout, id: PanelId): Layout {
  const side = locate(l, id)
  if (side === 'floating') return l
  return { ...l, [side]: { ...l[side], active: id, open: true } }
}

export function setOpen(l: Layout, side: Side, open: boolean): Layout {
  return { ...l, [side]: tidy({ ...l[side], open }) }
}

function without(l: Layout, id: PanelId): Layout {
  return {
    ...l,
    left: tidy({ ...l.left, panels: l.left.panels.filter((p) => p !== id) }),
    right: tidy({ ...l.right, panels: l.right.panels.filter((p) => p !== id) }),
    floating: l.floating.filter((w) => w.id !== id),
  }
}

/** Pull a docked panel out into a window. */
export function detach(l: Layout, id: PanelId, win: Omit<FloatingWindow, 'id'>): Layout {
  const where = locate(l, id)
  if (where === 'floating') return l
  const next = without(l, id)
  return { ...next, floating: [...next.floating, { id, ...win }], home: { ...l.home, [id]: where } }
}

/**
 * Dock a panel on a side (its home side if none is given), from wherever it
 * is now, and show it. `index` places the tab; the default is the end.
 */
export function dock(l: Layout, id: PanelId, side: Side = l.home[id] ?? DEFAULT_SIDE[id], index?: number): Layout {
  const next = without(l, id)
  const panels = [...next[side].panels]
  panels.splice(index ?? panels.length, 0, id)
  return {
    ...next,
    [side]: { ...next[side], panels, active: id, open: true },
    home: { ...l.home, [id]: side },
  }
}

/** Where a panel is, for the "Move to…" menu. */
export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/** Move a docked tab to a place in its own sidebar, without changing what is showing. */
export function reorder(l: Layout, id: PanelId, index: number): Layout {
  const side = locate(l, id)
  if (side === 'floating') return l
  const panels = l[side].panels.filter((p) => p !== id)
  panels.splice(Math.min(Math.max(index, 0), panels.length), 0, id)
  return { ...l, [side]: { ...l[side], panels } }
}
