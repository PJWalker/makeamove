import { lazy, Suspense } from 'preact/compat'
import { useEffect } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { sceneHueFromHex } from '../lib/colour'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { FloatingWindows } from './FloatingWindows'
import { windowLayer } from '../ui/windows'
import { CampaignDialogHost } from './ScenePanel'
import { Sidebar } from './Sidebar'
import { dockInsets, windowDragging } from './panelLayout'
import { activeMapColour, autohide, canvasColour, setAutohide } from './canvasState'
import { ActionDialogs } from './ActionDialogs'
import { ChatPopups } from './ChatPopups'
import { Hotbar } from './Hotbar'
import { LinkPopups } from './LinkPopups'
import { MovePrompt } from './MovePrompt'
import { Palette } from './Palette'
import { Toolbar } from './Toolbar'

// PixiJS is big; load it only once someone opens a table.
const SceneCanvas = lazy(() => import('./SceneCanvas'))

export function Tabletop({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews())
  const activeId = useY(campaign.members, () => campaign.activeSceneId())
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0]

  const mapColour = activeMapColour.value
  const colour = scene ? canvasColour(scene, mapColour) : null

  // Tint the whole UI from the map, or from the canvas when there's no map.
  const tint = mapColour ?? colour
  useEffect(() => {
    if (tint) document.documentElement.style.setProperty('--scene-hue', String(sceneHueFromHex(tint)))
  }, [tint])
  useEffect(() => () => document.documentElement.style.removeProperty('--scene-hue'), [])

  // Ctrl/Cmd + \ toggles autohide, like hiding the interface in most canvas tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setAutohide(!autohide.value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const edges = useNearEdges(autohide.value)

  return (
    <div
      class="table"
      data-autohide={autohide.value}
      // Which edges' chrome autohide is showing; a dragged window needs both sidebars to drop on.
      data-reveal={windowDragging.value ? 'left right' : edges}
      // How much each side's docked chrome covers, for the bars that sit between them.
      style={{
        '--dock-l': `${dockInsets.value.left.total}px`,
        '--dock-r': `${dockInsets.value.right.total}px`,
      }}
      // Pulled-out panels and pop-ups render into this layer (ui/windows.ts).
      ref={(el) => {
        if (el && el.lastChild !== windowLayer) el.appendChild(windowLayer)
      }}
    >
      <div class="canvas" style={{ '--scene-colour': colour }} aria-label={scene ? `Scene: ${scene.name}` : 'No scene'}>
        <Suspense fallback={null}>
          <SceneCanvas campaign={campaign} sceneId={scene?.id ?? null} />
        </Suspense>
      </div>

      <CampaignDialogHost campaign={campaign} />
      <Toolbar isGm={campaign.isGm()} />
      <Sidebar side="left" campaign={campaign} />
      <Sidebar side="right" campaign={campaign} />
      <FloatingWindows campaign={campaign} />
      <Hotbar campaign={campaign} />
      <Palette campaign={campaign} />
      <MovePrompt campaign={campaign} />
      <LinkPopups campaign={campaign} />
      <ActionDialogs campaign={campaign} />
      <ChatPopups campaign={campaign} />
    </div>
  )
}

/** How close to an edge of the window the pointer must come to show that edge's chrome. */
const EDGE_ZONE = 24

/** The chrome each edge reveals, which then stays while the pointer is over it. */
const EDGE_CHROME = {
  left: '.sidebar[data-side="left"]',
  right: '.sidebar[data-side="right"]',
  top: '.toolbar, .pen-options',
  bottom: '.hotbar',
} as const
type Edge = keyof typeof EDGE_CHROME

/**
 * The edges whose chrome autohide is showing, as a space-separated list, while
 * `on`. Tracked here rather than with :hover, which a view transition (as when
 * switching sidebar tabs) drops for its duration.
 */
function useNearEdges(on: boolean) {
  const edges = useSignal('')
  useEffect(() => {
    if (!on) return
    let shown = new Set<Edge>()
    const over = (edge: Edge, x: number, y: number) =>
      [...document.querySelectorAll(EDGE_CHROME[edge])].some((el) => {
        const r = el.getBoundingClientRect()
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      })
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const { clientX: x, clientY: y } = e
      const near: Record<Edge, boolean> = {
        left: x < EDGE_ZONE,
        right: x > innerWidth - EDGE_ZONE,
        top: y < EDGE_ZONE,
        bottom: y > innerHeight - EDGE_ZONE,
      }
      shown = new Set((Object.keys(EDGE_CHROME) as Edge[]).filter((edge) => near[edge] || (shown.has(edge) && over(edge, x, y))))
      edges.value = [...shown].join(' ')
    }
    // Leaving the window over an edge shouldn't leave its chrome showing.
    const onLeave = () => {
      shown = new Set()
      edges.value = ''
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      edges.value = ''
    }
  }, [on])
  return edges.value
}
