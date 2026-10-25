import { IconDock } from '../ui/icons'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { trackPointer } from '../ui/pointer'
import { withTransition } from '../ui/transition'
import { windowLayer } from '../ui/windows'
import { createPortal } from 'preact/compat'
import { dockPanel, dockTarget, floatingWindows, windowPointer, raiseWindow, startWindowDrag, updateWindow, type FloatingWindow } from './panelLayout'
import { PanelContent, PANELS } from './panels'
import { RESIZE_DIRS, resizeRect, type ResizeDir } from './resizeRect'

/** Dock a window from its button, then put keyboard focus on the docked panel. */
function dockAndFocus(id: FloatingWindow['id']) {
  withTransition(() => dockPanel(id)).then(() =>
    document.querySelector<HTMLElement>('.sidebar-panel .panel-title')?.focus(),
  )
}

const CURSORS: Record<ResizeDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

export function FloatingWindows({ campaign }: { campaign: Campaign }) {
  return createPortal(
    <>
      {floatingWindows.value.map((w) => (
        <Window key={w.id} win={w} campaign={campaign} />
      ))}
    </>,
    windowLayer,
  )
}

function Window({ win, campaign }: { win: FloatingWindow; campaign: Campaign }) {
  const { label } = PANELS[win.id]

  function onResizePointerDown(e: PointerEvent, dir: ResizeDir) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    raiseWindow(win.id)
    const start = { x: win.x, y: win.y, w: win.w, h: win.h }
    const stop = trackPointer(CURSORS[dir], (ev) => {
      updateWindow(win.id, resizeRect(start, dir, ev.clientX - e.clientX, ev.clientY - e.clientY))
    })
    window.addEventListener('pointerup', stop, { once: true })
  }

  function onHeaderPointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    startWindowDrag(win.id, e, e.clientX - win.x, e.clientY - win.y)
  }

  // Over a sidebar, the window turns into the tab it would become.
  const pointer = windowPointer.value
  const asTab = dockTarget.value !== null && pointer?.id === win.id ? pointer : null
  const { Icon } = PANELS[win.id]

  return (
    <>
    {asTab && (
      <div class="drag-tab panel bevel" style={{ left: asTab.x - 22, top: asTab.y - 22 }} aria-hidden="true">
        <Icon size={22} />
      </div>
    )}
    <section
      class="floating-window window panel bevel chrome"
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
        viewTransitionName: `panel-${win.id}`,
        visibility: asTab ? 'hidden' : undefined,
      }}
      aria-label={label}
      onPointerDown={() => raiseWindow(win.id)}
    >
      <header class="panel-header window-header" onPointerDown={onHeaderPointerDown}>
        <h2 class="panel-title">{label}</h2>
        <Button variant="icon" label="Dock in the sidebar" onClick={() => dockAndFocus(win.id)}>
          <IconDock size={16} />
        </Button>
      </header>
      <PanelContent id={win.id} campaign={campaign} />
      <span class="resize-grip" aria-hidden="true" />
      {RESIZE_DIRS.map((dir) => (
        <span key={dir} class="win-resize" data-dir={dir} aria-hidden="true" onPointerDown={(e) => onResizePointerDown(e, dir)} />
      ))}
    </section>
    </>
  )
}
