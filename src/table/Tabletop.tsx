import { useSignal } from '@preact/signals'
import { lazy, Suspense } from 'preact/compat'
import { useEffect } from 'preact/hooks'
import { sceneHueFromHex } from '../lib/colour'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { FloatingWindows } from './FloatingWindows'
import { SceneBar } from './SceneBar'
import { Sidebar } from './Sidebar'
import { activeMapColour, canvasColour } from './canvasState'
import { Toolbar } from './Toolbar'

// PixiJS is big; load it only once someone opens a table.
const SceneCanvas = lazy(() => import('./SceneCanvas'))

export function Tabletop({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews())
  const activeId = useY(campaign.members, () => campaign.activeSceneId())
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0]
  const chromeHidden = useSignal(false)

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
    <div class="table" data-chrome={chromeHidden.value ? 'hidden' : 'shown'}>
      <div class="canvas" style={{ '--scene-colour': colour }} aria-label={scene ? `Scene: ${scene.name}` : 'No scene'}>
        <Suspense fallback={null}>
          <SceneCanvas campaign={campaign} sceneId={scene?.id ?? null} />
        </Suspense>
      </div>

      <SceneBar campaign={campaign} scenes={scenes} activeId={scene?.id ?? null} activeColour={colour} />
      <Toolbar isGm={campaign.isGm()} />
      <Sidebar campaign={campaign} />
      <FloatingWindows campaign={campaign} />
    </div>
  )
}
