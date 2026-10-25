import { computed, effect, signal } from '@preact/signals'
import { withTransition } from '../ui/transition'

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
  floating: FloatingWindow[]
}

const KEY = 'mam:panel-layout'
const narrow = matchMedia('(max-width: 600px)').matches

function load(): Layout {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return { ...JSON.parse(saved), open: narrow ? false : JSON.parse(saved).open }
  } catch {
    // Fall back to the default layout.
  }
  return { active: 'chat', open: !narrow, floating: [] }
}

export const layout = signal<Layout>(load())

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout.value))
  } catch {
    // Layout just won't persist.
  }
})

export const sidebarOpen = computed(() => layout.value.open)
export const activePanel = computed(() => layout.value.active)
export const floatingWindows = computed(() => layout.value.floating)

export function isFloating(id: PanelId) {
  return layout.value.floating.some((w) => w.id === id)
}

function topZ() {
  return Math.max(0, ...layout.value.floating.map((w) => w.z)) + 1
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

export function detachPanel(id: PanelId, x: number, y: number, w = 340, h = 440) {
  const l = layout.value
  if (isFloating(id)) return
  const floating = [...l.floating, { id, x, y, w, h, z: topZ() }]
  let { active, open } = l
  if (active === id) {
    const docked = PANEL_ORDER.find((p) => p !== id && !floating.some((f) => f.id === p))
    if (docked) active = docked
    else open = false
  }
  layout.value = { active, open, floating }
}

export function dockPanel(id: PanelId) {
  const l = layout.value
  layout.value = { active: id, open: true, floating: l.floating.filter((w) => w.id !== id) }
}

export function raiseWindow(id: PanelId) {
  const z = topZ()
  updateWindow(id, { z })
}

export function updateWindow(id: PanelId, patch: Partial<Omit<FloatingWindow, 'id'>>) {
  const l = layout.value
  layout.value = { ...l, floating: l.floating.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
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
