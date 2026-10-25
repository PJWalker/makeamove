import { useSignal } from '@preact/signals'
import { IconDrag, IconSidebarHide, IconSidebarShow } from '../ui/icons'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { trackPointer } from '../ui/pointer'
import { withTransition } from '../ui/transition'
import {
  activePanel,
  detachPanel,
  dockTargetActive,
  floatingWindows,
  isFloating,
  setSidebarWidth,
  SIDEBAR_MIN_W,
  sidebarMaxWidth,
  sidebarWidth,
  PANEL_ORDER,
  selectPanel,
  setSidebarOpen,
  sidebarOpen,
  startWindowDrag,
  type PanelId,
} from './panelLayout'
import { PanelContent, PANELS } from './panels'

const DRAG_THRESHOLD = 10

/**
 * The right-hand sidebar: a vertical tab strip attached to a full-height body
 * that slides in from beyond the right edge, pushing the strip ahead of it.
 */
export function Sidebar({ campaign }: { campaign: Campaign }) {
  const open = sidebarOpen.value
  const active = activePanel.value
  const floating = floatingWindows.value
  const dockedActive = !floating.some((w) => w.id === active)

  return (
    <aside
      class="sidebar chrome"
      style={{ '--sidebar-user-w': `${sidebarWidth.value}px` }}
      data-open={open}
      data-drop={dockTargetActive.value}
      aria-label="Sidebar"
    >
      <div class="sidebar-rail panel bevel strip dock-right" role="tablist" aria-orientation="vertical">
        {PANEL_ORDER.map((id) => (
          <RailTab key={id} id={id} selected={open && dockedActive && active === id} floating={floating.some((w) => w.id === id)} />
        ))}
        <span class="rail-divider" aria-hidden="true" />
        <Button
          variant="icon"
          label={open ? 'Hide sidebar' : 'Show sidebar'}
          onClick={() => withTransition(() => setSidebarOpen(!open))}
        >
          {open ? <IconSidebarHide size={18} /> : <IconSidebarShow size={18} />}
        </Button>
      </div>

      <section class="sidebar-body panel dock-right dock-top dock-bottom" role="tabpanel" inert={!open}>
        <SidebarResizeHandle />
        {dockedActive && (
          <div class="sidebar-panel" style={{ viewTransitionName: `panel-${active}` }}>
            <header
              class="panel-header docked-header"
              title="Drag out to open in a floating window"
              onPointerDown={(e) => pullOut(active, e, true)}
            >
              <h2 class="panel-title" tabIndex={-1}>
                {PANELS[active].label}
              </h2>
              <IconDrag size={16} class="drag-hint" aria-hidden="true" />
            </header>
            <PanelContent id={active} campaign={campaign} />
          </div>
        )}
      </section>
    </aside>
  )
}

/**
 * Start watching a press on a tab or docked panel title. Once the pointer
 * travels past a small threshold, the panel pops out into a floating window
 * that follows the pointer; a release before that is an ordinary click.
 */
function pullOut(id: PanelId, e: PointerEvent, fromHeader: boolean, onPulled?: () => void) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  // Keep the grab point where it was in the docked title, if that's what was grabbed.
  const header = fromHeader ? (e.currentTarget as HTMLElement).getBoundingClientRect() : null
  const grabX = header ? Math.min(startX - header.left, 300) : 120
  const grabY = header ? startY - header.top : 18
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
    cleanup()
    onPulled?.()
    detachPanel(id, ev.clientX - grabX, ev.clientY - grabY)
    startWindowDrag(id, ev, grabX, grabY)
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', cleanup)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', cleanup)
}

/** Drag (or arrow-key) the sidebar's inner edge to change its width. */
function SidebarResizeHandle() {
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const stop = trackPointer('ew-resize', (ev) => setSidebarWidth(innerWidth - ev.clientX))
    window.addEventListener('pointerup', stop, { once: true })
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') setSidebarWidth(sidebarWidth.value + step)
    else if (e.key === 'ArrowRight') setSidebarWidth(sidebarWidth.value - step)
    else return
    e.preventDefault()
  }

  return (
    <div
      class="sidebar-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN_W}
      aria-valuemax={sidebarMaxWidth()}
      aria-valuenow={sidebarWidth.value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}

/**
 * Select a tab. When one docked panel replaces another, the content slides
 * the way the tabs are stacked: down the strip slides up, up the strip slides down.
 */
function switchTo(id: PanelId) {
  const from = activePanel.value
  const replacing = sidebarOpen.value && from !== id && !isFloating(from) && !isFloating(id)
  const direction = PANEL_ORDER.indexOf(id) > PANEL_ORDER.indexOf(from) ? 'vt-tab-next' : 'vt-tab-prev'
  withTransition(() => selectPanel(id), { rootClass: replacing ? direction : undefined })
}

/** A tab that selects its panel on click, or pulls it out into a window when dragged. */
function RailTab({ id, selected, floating }: { id: PanelId; selected: boolean; floating: boolean }) {
  const { label, Icon } = PANELS[id]
  const dragged = useSignal(false)

  function onPointerDown(e: PointerEvent) {
    if (floating) return
    dragged.value = false
    pullOut(id, e, false, () => (dragged.value = true))
  }

  return (
    <Button
      variant="icon"
      role="tab"
      class="rail-tab"
      label={floating ? `${label} (floating — click to bring forward)` : `${label} — drag out to float`}
      aria-selected={selected}
      pressed={selected}
      data-floating={floating}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (!dragged.value) switchTo(id)
      }}
    >
      <Icon size={18} />
    </Button>
  )
}
