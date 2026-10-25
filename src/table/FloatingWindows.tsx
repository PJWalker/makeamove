import { IconDock } from '../ui/icons'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { withTransition } from '../ui/transition'
import { dockPanel, floatingWindows, raiseWindow, startWindowDrag, updateWindow, type FloatingWindow } from './panelLayout'
import { PanelContent, PANELS } from './panels'

/** Dock a window from its button, then put keyboard focus on the docked panel. */
function dockAndFocus(id: FloatingWindow['id']) {
  withTransition(() => dockPanel(id)).then(() =>
    document.querySelector<HTMLElement>('.sidebar-panel .panel-title')?.focus(),
  )
}

const MIN_W = 260
const MIN_H = 200

export function FloatingWindows({ campaign }: { campaign: Campaign }) {
  return (
    <>
      {floatingWindows.value.map((w) => (
        <Window key={w.id} win={w} campaign={campaign} />
      ))}
    </>
  )
}

function Window({ win, campaign }: { win: FloatingWindow; campaign: Campaign }) {
  const { label } = PANELS[win.id]

  function onGripPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const { w, h } = win
    const startX = e.clientX
    const startY = e.clientY
    const move = (ev: PointerEvent) =>
      updateWindow(win.id, {
        w: Math.max(MIN_W, Math.round(w + ev.clientX - startX)),
        h: Math.max(MIN_H, Math.round(h + ev.clientY - startY)),
      })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onHeaderPointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    startWindowDrag(win.id, e, e.clientX - win.x, e.clientY - win.y)
  }

  return (
    <section
      class="floating-window panel bevel chrome"
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: 10 + win.z,
        viewTransitionName: `panel-${win.id}`,
      }}
      aria-label={label}
      onPointerDown={() => raiseWindow(win.id)}
    >
      <header class="panel-header floating-header" onPointerDown={onHeaderPointerDown}>
        <h2 class="panel-title">{label}</h2>
        <Button variant="icon" label="Dock in the sidebar" onClick={() => dockAndFocus(win.id)}>
          <IconDock size={16} />
        </Button>
      </header>
      <PanelContent id={win.id} campaign={campaign} />
      <span class="resize-grip" aria-hidden="true" onPointerDown={onGripPointerDown} />
    </section>
  )
}
