import { unreadCount } from '../chat/unread'
import { useSignal } from '@preact/signals'
import { IconClose, IconDrag } from '../ui/icons'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { menuTrigger } from '../ui/menuTrigger'
import { trackPointer } from '../ui/pointer'
import { startReorder } from '../ui/reorder'
import { withTransition } from '../ui/transition'
import { ContextMenu, type MenuItem } from './ContextMenu'
import {
  detachPanel,
  dockPanel,
  dockTarget,
  layout,
  shownLayout,
  otherSide,
  selectPanel,
  reorderPanel,
  setPanelClosed,
  setSideWidth,
  SIDEBAR_MIN_W,
  sidebarMaxWidth,
  spawnedFromTab,
  startWindowDrag,
  windowDragging,
  type PanelId,
  type Side,
} from './panelLayout'
import { PanelContent, PANELS, PaneToggle } from './panels'

const DRAG_THRESHOLD = 10

/**
 * A sidebar: a vertical tab strip attached to a full-height body that slides
 * in from beyond its edge, pushing the strip ahead of it. The left one is the
 * right one mirrored. A side with no panels disappears, unless a window is
 * being dragged, when it shows as a place to drop it.
 */
export function Sidebar({ side, campaign }: { side: Side; campaign: Campaign }) {
  const s = shownLayout.value[side]
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const empty = s.panels.length === 0
  if (empty && !windowDragging.value) return null
  const { open, active } = s
  const outer = side === 'left' ? 'dock-left' : 'dock-right'

  return (
    <aside
      class="sidebar"
      style={{ '--sidebar-user-w': `${s.width}px` }}
      data-side={side}
      data-open={open}
      data-empty={empty}
      data-drop={dockTarget.value === side}
      aria-label={side === 'left' ? 'Left sidebar' : 'Right sidebar'}
    >
      <div class={`sidebar-rail panel bevel strip ${outer}`} role="tablist" aria-orientation="vertical">
        {s.panels.map((id) => (
          <RailTab key={id} campaign={campaign} id={id} side={side} selected={open && active === id} onMenu={(x, y) => (menu.value = { x, y, items: tabMenu(id, side) })} />
        ))}
      </div>

      <section class={`sidebar-body panel dock-${side === 'left' ? 'left' : 'right'} dock-top dock-bottom`} role="tabpanel" inert={!open}>
        <SidebarResizeHandle side={side} />
        {active && (
          <div class="sidebar-panel" style={{ viewTransitionName: `panel-${active}` }}>
            <header class="panel-header docked-header" {...withPull((e) => pullOut(active, e), (x, y) => (menu.value = { x, y, items: tabMenu(active, side) }))}
            >
              <PaneToggle id={active} />
              <h2 class="panel-title" tabIndex={-1}>
                {PANELS[active].label}
              </h2>
              <IconDrag size={16} class="drag-hint" aria-hidden="true" />
            </header>
            <PanelContent id={active} campaign={campaign} />
          </div>
        )}
      </section>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </aside>
  )
}

/** A right-click menu trigger that also keeps a primary-button press handler. */
function withPull(onPress: (e: PointerEvent) => void, open: (x: number, y: number) => void) {
  const trigger = menuTrigger(open)
  return {
    onContextMenu: trigger.onContextMenu,
    onPointerDown(e: PointerEvent) {
      trigger.onPointerDown(e)
      onPress(e)
    },
  }
}

/** Right-click menu for a tab: the keyboard-friendly way to rearrange panels. */
function tabMenu(id: PanelId, side: Side): MenuItem[] {
  const other = otherSide(side)
  return [
    { label: `Move to ${other} sidebar`, onSelect: () => withTransition(() => dockPanel(id, other)) },
    {
      label: 'Float in a window',
      onSelect: () => detachPanel(id, Math.max(innerWidth / 2 - 170, 0), 120),
    },
    'divider',
    // Back from the campaign menu, where each panel can be ticked again.
    { label: 'Close', Icon: IconClose, onSelect: () => withTransition(() => setPanelClosed(id, true)) },
  ]
}

/**
 * Start watching a press on a docked panel's title. Once the pointer travels
 * past a small threshold, the panel pops out into a floating window that
 * follows the pointer; a release before that is an ordinary click.
 */
function pullOut(id: PanelId, e: PointerEvent) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  // Keep the grab point where it was in the docked title.
  const header = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const grabX = Math.min(startX - header.left, 300)
  const grabY = startY - header.top
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
    cleanup()
    detachPanel(id, ev.clientX - grabX, ev.clientY - grabY)
    startWindowDrag(id, ev, grabX, grabY)
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', cleanup)
    window.removeEventListener('pointercancel', cleanup)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', cleanup)
  window.addEventListener('pointercancel', cleanup)
}

/**
 * A tab is picked up at once: dragging along the strip reorders it, and
 * dragging away from the strip floats the panel in a window.
 */
function dragTab(id: PanelId, e: PointerEvent) {
  const tab = e.currentTarget as HTMLElement
  const rail = tab.closest<HTMLElement>('.sidebar-rail')!
  startReorder({
    event: e,
    axis: 'y',
    container: rail,
    items: () => [...rail.querySelectorAll<HTMLElement>('.rail-tab')],
    onDrop: (index) => reorderPanel(id, index),
    outside: {
      when: 'move',
      run: (ev) => {
        spawnedFromTab.add(id)
        detachPanel(id, ev.clientX - 120, ev.clientY - 18)
        startWindowDrag(id, ev, 120, 18)
      },
    },
  })
}

/** Drag (or arrow-key) the sidebar's inner edge to change its width. */
function SidebarResizeHandle({ side }: { side: Side }) {
  const width = layout.value[side].width
  const grow = side === 'left' ? 1 : -1
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const stop = trackPointer('ew-resize', (ev) => setSideWidth(side, side === 'left' ? ev.clientX : innerWidth - ev.clientX))
    window.addEventListener('pointerup', stop, { once: true })
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') setSideWidth(side, width - grow * step)
    else if (e.key === 'ArrowRight') setSideWidth(side, width + grow * step)
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
      aria-valuenow={width}
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
function switchTo(id: PanelId, side: Side) {
  const s = shownLayout.value[side]
  const from = s.active
  const replacing = s.open && from !== null && from !== id
  const direction = from !== null && s.panels.indexOf(id) > s.panels.indexOf(from) ? 'vt-tab-next' : 'vt-tab-prev'
  withTransition(() => selectPanel(id), { rootClass: replacing ? direction : undefined })
}

/** How many members are online, counting this device. */
function useOnlineCount(campaign: Campaign) {
  const me = device.value.id
  const online = campaign.online.value
  return useY(campaign.members, () => campaign.memberViews()).filter((m) => m.id === me || online.has(m.id)).length
}

/** A tab that selects its panel on click, or pulls it out into a window when dragged. */
function RailTab({ campaign, id, side, selected, onMenu }: { campaign: Campaign; id: PanelId; side: Side; selected: boolean; onMenu: (x: number, y: number) => void }) {
  const { label, Icon } = PANELS[id]
  const onlineCount = useOnlineCount(campaign)

  function onPointerDown(e: PointerEvent) {
    dragTab(id, e)
  }

  return (
    <Button
      variant="icon"
      role="tab"
      class="rail-tab"
      data-panel={id}
      label={label + (id === 'chat' && unreadCount.value ? `, ${unreadCount.value} unread` : '') + (id === 'members' ? `, ${onlineCount} online` : '')}
      aria-selected={selected}
      pressed={selected}
      data-unread={id === 'chat' && unreadCount.value > 0 ? Math.min(unreadCount.value, 99) : undefined}
      data-online={id === 'members' ? onlineCount : undefined}
      onClick={() => switchTo(id, side)}
      {...withPull(onPointerDown, onMenu)}
    >
      <Icon size={22} />
    </Button>
  )
}
