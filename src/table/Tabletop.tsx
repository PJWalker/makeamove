import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { sceneHueFromHex } from '../lib/colour'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { FloatingWindows } from './FloatingWindows'
import { SceneBar } from './SceneBar'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'

export function Tabletop({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews())
  const activeId = useY(campaign.members, () => campaign.activeSceneId())
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0]
  const chromeHidden = useSignal(false)

  // Tint the whole UI with the active scene's colour.
  useEffect(() => {
    if (!scene) return
    document.documentElement.style.setProperty('--scene-hue', String(sceneHueFromHex(scene.colour)))
  }, [scene?.colour])
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
      <div
        class="canvas"
        style={{ '--scene-colour': scene?.colour }}
        role="img"
        aria-label={scene ? `Scene: ${scene.name}` : 'No scene'}
      >
        {scene && <span class="canvas-hint">The canvas for “{scene.name}” arrives in M1</span>}
      </div>

      <SceneBar campaign={campaign} scenes={scenes} activeId={scene?.id ?? null} />
      <Toolbar isGm={campaign.isGm()} />
      <Sidebar campaign={campaign} />
      <FloatingWindows campaign={campaign} />
    </div>
  )
}
