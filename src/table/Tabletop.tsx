import { lazy, Suspense } from 'preact/compat'
import { useEffect } from 'preact/hooks'
import { sceneHueFromHex } from '../lib/colour'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { FloatingWindows } from './FloatingWindows'
import { windowLayer } from '../ui/windows'
import { CampaignDialogHost } from './ScenePanel'
import { Sidebar } from './Sidebar'
import { dockInsets } from './panelLayout'
import { activeMapColour, canvasColour, chromeHidden } from './canvasState'
import { Hotbar } from './Hotbar'
import { MoveDialog } from './MoveDialog'
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

  // Ctrl/Cmd + \ hides all chrome, as in most canvas tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        chromeHidden.value = !chromeHidden.value
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      class="table"
      data-chrome={chromeHidden.value ? 'hidden' : 'shown'}
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
      <MoveDialog campaign={campaign} />
    </div>
  )
}
