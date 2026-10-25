import { computed, effect, signal } from '@preact/signals'
import { withTransition } from '../ui/transition'
import { nextZ, noteZ } from '../ui/windows'

/*
 * Where each sidebar panel lives: docked in the sidebar or floating in its own
 * window. This is a per-device preference, so it is kept in localStorage.
 */

export type PanelId = 'chat' | 'characters' | 'items' | 'notes' | 'members'

export interface FloatingWindow {
  id: PanelId
  x: number
  y: number
  w: number
  h: number
  z: number
}

interface Layout {
  active: PanelId
  open: boolean
  /** Width of the sidebar body in CSS pixels. */
  width: number
  floating: FloatingWindow[]
}

export const SIDEBAR_MIN_W = 280
export const SIDEBAR_DEFAULT_W = 340
export const sidebarMaxWidth = () => Math.max(SIDEBAR_MIN_W, Math.min(720, innerWidth - 160))

const KEY = 'mam:panel-layout'
const narrow = matchMedia('(max-width: 600px)').matches

function load(): Layout {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const l = JSON.parse(saved) as Partial<Layout>
      return {
        active: l.active ?? 'chat',
        open: narrow ? false : (l.open ?? true),
        width: l.width ?? SIDEBAR_DEFAULT_W,
        floating: (l.floating ?? []).map((w) => ({ ...w, ...whole({ x: w.x, y: w.y, w: w.w, h: w.h }) })),
      }
    }
  } catch {
    // Fall back to the default layout.
  }
  return { active: 'chat', open: !narrow, width: SIDEBAR_DEFAULT_W, floating: [] }
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

export const sidebarOpen = computed(() => layout.value.open)
export const sidebarWidth = computed(() => layout.value.width)

export function setSidebarWidth(width: number) {
  const w = Math.round(Math.min(Math.max(width, SIDEBAR_MIN_W), sidebarMaxWidth()))
  if (w !== layout.value.width) layout.value = { ...layout.value, width: w }
}
export const activePanel = computed(() => layout.value.active)
export const floatingWindows = computed(() => layout.value.floating)

export function isFloating(id: PanelId) {
  return layout.value.floating.some((w) => w.id === id)
}

/** Windows share one stacking order with pop-ups (ui/windows.ts). */
function topZ() {
  return nextZ()
}

export function selectPanel(id: PanelId) {
  if (isFloating(id)) {
    raiseWindow(id)
    return
  }
  const l = layout.value
  // Clicking the open tab again tucks the sidebar away.
  const open = l.open && l.active === id ? false : true
  layout.value = { ...l, active: id, open }
}

export function setSidebarOpen(open: boolean) {
  layout.value = { ...layout.value, open }
}

/** Bring a panel into view without ever hiding it, unlike clicking its tab. */
export function showPanel(id: PanelId) {
  if (isFloating(id)) raiseWindow(id)
  else layout.value = { ...layout.value, active: id, open: true }
}

export function detachPanel(id: PanelId, x: number, y: number, w = 340, h = 440) {
  const l = layout.value
  if (isFloating(id)) return
  const floating = [...l.floating, { id, ...whole({ x, y, w, h }), z: topZ() }]
  let { active, open } = l
  if (active === id) {
    const docked = PANEL_ORDER.find((p) => p !== id && !floating.some((f) => f.id === p))
    if (docked) active = docked
    else open = false
  }
  layout.value = { ...l, active, open, floating }
}

export function dockPanel(id: PanelId) {
  const l = layout.value
  layout.value = { ...l, active: id, open: true, floating: l.floating.filter((w) => w.id !== id) }
}

export function raiseWindow(id: PanelId) {
  const z = topZ()
  updateWindow(id, { z })
}

export function updateWindow(id: PanelId, patch: Partial<Omit<FloatingWindow, 'id'>>) {
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

export const PANEL_ORDER: PanelId[] = ['chat', 'characters', 'items', 'notes', 'members']

/* Dragging a floating window, including one just pulled out of the sidebar. */

/** True while a dragged window is over the sidebar and would dock on drop. */
export const dockTargetActive = signal(false)

function overSidebar(x: number, y: number) {
  const el = document.querySelector('.sidebar')
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

export function startWindowDrag(id: PanelId, e: PointerEvent, grabX: number, grabY: number) {
  raiseWindow(id)
  const move = (ev: PointerEvent) => {
    const x = Math.min(Math.max(ev.clientX - grabX, -200), innerWidth - 80)
    const y = Math.min(Math.max(ev.clientY - grabY, 0), innerHeight - 40)
    updateWindow(id, { x, y })
    dockTargetActive.value = overSidebar(ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (overSidebar(ev.clientX, ev.clientY)) withTransition(() => dockPanel(id))
    dockTargetActive.value = false
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  move(e)
}
