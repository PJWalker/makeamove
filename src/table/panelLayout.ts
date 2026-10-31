import { computed, effect, signal } from '@preact/signals'
import { dropLine, indexAmong } from '../ui/reorder'
import { withTransition } from '../ui/transition'
import { nextZ, noteZ } from '../ui/windows'
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
  reorder,
  otherSide,
  selectTab,
  showTab,
  type FloatingWindow,
  type DockItemId,
  type Layout,
  type PanelId,
  type Side,
  withoutPanels,
  isPanelId,
} from './layoutModel'

export { PANEL_ORDER, SIDEBAR_MIN_W, otherSide, isPanelId, locate }
export type { DockItemId, FloatingWindow, PanelId, Side }

/*
 * Where each panel lives: docked on the left or right, or floating in its own
 * window (the rules are in layoutModel.ts). This is a per-device preference,
 * so it is kept in localStorage.
 */

export const sidebarMaxWidth = () => Math.max(SIDEBAR_MIN_W, Math.min(720, innerWidth - 160))

const KEY = 'mam:panel-layout-2'
const narrow = matchMedia('(max-width: 600px)').matches

function load(): Layout {
  let saved: unknown
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    // Fall back to the default layout.
  }
  const l = normalise(saved, narrow)
  return { ...l, floating: l.floating.map((w) => ({ ...w, ...whole({ x: w.x, y: w.y, w: w.w, h: w.h }) })) }
}

export const layout = signal<Layout>(load())

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout.value))
  } catch {
    // Layout just won't persist.
  }
})

// Saved windows keep their order; anything opened later goes above them.
for (const w of layout.value.floating) noteZ(w.z)

/** Panels the open campaign doesn't have, such as Combat for a system without initiative. */
export const unavailablePanels = signal<PanelId[]>([])

/** The layout as it shows, without the unavailable panels. */
export const shownLayout = computed(() => withoutPanels(layout.value, unavailablePanels.value))

export const floatingWindows = computed(() =>
  shownLayout.value.floating.filter(
    (w): w is FloatingWindow & { id: PanelId } => isPanelId(w.id),
  ),
);

/** Pixels each side takes: its body when open, and its tab strip. */
export const dockInsets = computed(() => {
  const l = shownLayout.value
  const of = (side: Side) => {
    const s = l[side]
    const body = s.open && s.panels.length ? s.width : 0
    return { body, total: body + (s.panels.length ? 48 : 0) }
  }
  return { left: of('left'), right: of('right') }
})

/** Resize a side; pulling it very narrow snaps it shut, and widening it again reopens it. */
export function setSideWidth(side: Side, width: number) {
  layout.value = resizeSide(layout.value, side, width, sidebarMaxWidth())
}

export function reorderPanel(id: DockItemId, index: number) {
  layout.value = reorder(layout.value, id, index)
}

export function isFloating(id: DockItemId) {
  return locate(layout.value, id) === 'floating'
}

/** Whether a panel can be seen right now: floating, or the open tab of an open sidebar. */
export function panelVisible(id: DockItemId) {
  const side = locate(layout.value, id)
  if (side === 'floating') return true
  if (side === 'closed') return false
  const s = layout.value[side]
  return s.open && s.active === id
}

/** Windows share one stacking order with pop-ups (ui/windows.ts). */
function topZ() {
  return nextZ()
}

export function selectPanel(id: DockItemId) {
  if (isFloating(id)) {
    raiseWindow(id)
    return
  }
  layout.value = selectTab(layout.value, id)
}

/** Bring a panel into view without ever hiding it, unlike clicking its tab. */
export function showPanel(id: DockItemId) {
  if (isFloating(id)) raiseWindow(id)
  else layout.value = showTab(layout.value, id)
}

export function detachPanel(id: DockItemId, x: number, y: number, w = 340, h = 440) {
  layout.value = detach(layout.value, id, { ...whole({ x, y, w, h }), z: topZ() })
}

/** Dock a panel on a side, or back where it came from. Works from a window or the other side. */
export function dockPanel(id: DockItemId, side?: Side, index?: number, reveal = true) {
  layout.value = dock(layout.value, id, side, index, reveal)
}

/** Close a panel, or open a closed one again where it was. */
export function setPanelClosed(id: DockItemId, closed: boolean) {
  if (closed) layout.value = close(layout.value, id)
  else if (isClosed(id)) layout.value = dock(layout.value, id)
}

export function closeEntityTab(id: DockItemId) {
  layout.value = close(layout.value, id)
}

export const isClosed = (id: DockItemId) => layout.value.closed.includes(id)

export function raiseWindow(id: DockItemId) {
  const z = topZ()
  updateWindow(id, { z })
}

export function updateWindow(id: DockItemId, patch: Partial<Omit<FloatingWindow, 'id'>>) {
  const l = layout.value
  const clean = whole(patch)
  layout.value = { ...l, floating: l.floating.map((w) => (w.id === id ? { ...w, ...clean } : w)) }
}

/**
 * Window geometry is always stored as whole pixels. Pointer coordinates can be
 * fractional (zoom, high-DPI), and fractional boxes render with blurry edges.
 */
function whole<T extends Record<string, number | undefined>>(geometry: T): T {
  const out = { ...geometry }
  for (const k in out) if (typeof out[k] === 'number') out[k] = Math.round(out[k] as number) as T[typeof k]
  return out
}

/* Dragging a floating window, including one just pulled out of a sidebar. */

/** The side a dragged window is over, which it would dock on if dropped. */
export const dockTarget = signal<Side | null>(null)
/** True while a window is being dragged, so empty sides can show as drop zones. */
export const windowDragging = signal(false)
/** Panels just pulled out of a tab, whose window should grow out of the tab icon. */
export const spawnedFromTab = new Set<DockItemId>()
/** The window being dragged and where its pointer is, so it can shrink to a tab over a sidebar. */
export const windowPointer = signal<{ id: DockItemId; x: number; y: number } | null>(null)

function sideAt(x: number, y: number): Side | null {
  for (const side of SIDES) {
    const el = document.querySelector(`.sidebar[data-side="${side}"]`)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return side
  }
  return null
}

/** The tabs of a side as elements, and where among them a pointer at this height would drop. */
function tabsOf(side: Side) {
  return [...document.querySelectorAll<HTMLElement>(`.sidebar[data-side="${side}"] .rail-tab`)]
}

export function startWindowDrag(id: DockItemId, e: PointerEvent, grabX: number, grabY: number) {
  raiseWindow(id)
  windowDragging.value = true
  const marker = dropLine('y')
  const move = (ev: PointerEvent) => {
    const x = Math.min(Math.max(ev.clientX - grabX, -200), innerWidth - 80)
    const y = Math.min(Math.max(ev.clientY - grabY, 0), innerHeight - 40)
    updateWindow(id, { x, y })
    const side = sideAt(ev.clientX, ev.clientY)
    dockTarget.value = side
    windowPointer.value = { id, x: ev.clientX, y: ev.clientY }
    if (side) marker.show(tabsOf(side), indexAmong(tabsOf(side), 'y', ev))
    else marker.hide()
  }
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const side = sideAt(ev.clientX, ev.clientY)
    marker.hide()
    if (side) {
      const index = indexAmong(tabsOf(side), 'y', ev)
      // Dropped on a closed sidebar, it joins the tabs without opening it.
      withTransition(() => dockPanel(id, side, index, false))
    }
    dockTarget.value = null
    windowDragging.value = false
    windowPointer.value = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  move(e)
}
