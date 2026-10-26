import { IconDock } from '../ui/icons'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { trackPointer } from '../ui/pointer'
import { withTransition } from '../ui/transition'
import { windowLayer } from '../ui/windows'
import { createPortal } from 'preact/compat'
import { useRef } from 'preact/hooks'
import { dockPanel, dockTarget, floatingWindows, windowPointer, spawnedFromTab, raiseWindow, startWindowDrag, updateWindow, type FloatingWindow } from './panelLayout'
import { PanelContent, PANELS, PaneToggle } from './panels'
import { RESIZE_CURSORS, RESIZE_DIRS, resizeRect, type ResizeDir } from './resizeRect'

/** Dock a window from its button, then put keyboard focus on the docked panel. */
function dockAndFocus(id: FloatingWindow['id']) {
  withTransition(() => dockPanel(id)).then(() =>
    document.querySelector<HTMLElement>('.sidebar-panel .panel-title')?.focus(),
  )
}

/** Size of the tab a window morphs into. */
const TAB = 44


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
    const stop = trackPointer(RESIZE_CURSORS[dir], (ev) => {
      updateWindow(win.id, resizeRect(start, dir, ev.clientX - e.clientX, ev.clientY - e.clientY))
    })
    window.addEventListener('pointerup', stop, { once: true })
  }

  function onHeaderPointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    startWindowDrag(win.id, e, e.clientX - win.x, e.clientY - win.y)
  }

  // Over a sidebar the window morphs into the tab it would become, and back out again.
  const pointer = windowPointer.value
  const asTab = dockTarget.value !== null && pointer?.id === win.id ? pointer : null
  // The phase sticks until the next change, so re-rendering on pointer moves doesn't cut an animation short.
  // A window pulled out of a tab starts as the tab ('hidden') and grows from it when it leaves the sidebar.
  const phase = useRef<'in' | 'out' | 'hidden' | undefined>(spawnedFromTab.delete(win.id) ? 'hidden' : undefined)
  if (pointer?.id !== win.id) {
    if (phase.current !== 'hidden') phase.current = undefined
  } else if (asTab) phase.current = phase.current === 'hidden' ? 'hidden' : 'in'
  else if (phase.current) phase.current = 'out'
  const morph = phase.current
  const { Icon } = PANELS[win.id]
  const to = pointer ?? { x: win.x, y: win.y }
  const toTab = `translate(${to.x - TAB / 2 - win.x}px, ${to.y - TAB / 2 - win.y}px) scale(${TAB / win.w}, ${TAB / win.h})`

  return (
    <>
    {asTab && (
      <div class="drag-tab panel bevel" style={{ left: asTab.x - TAB / 2, top: asTab.y - TAB / 2 }} aria-hidden="true">
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
        '--to-tab': toTab,
      }}
      data-morph={morph}
      aria-label={label}
      onPointerDown={() => raiseWindow(win.id)}
    >
      <header class="panel-header window-header" onPointerDown={onHeaderPointerDown}>
        <PaneToggle id={win.id} />
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
