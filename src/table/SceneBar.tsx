import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { goToCampaign } from '../router'
import type { Campaign, SceneView } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconAdd, IconDelete, IconExpand, IconHelp, IconLeave, IconSettings } from '../ui/icons'
import { HelpDialog, SettingsDialog } from './CampaignDialogs'

const SCENE_SWATCHES = ['#2b3a55', '#3d5a3a', '#5a3a2b', '#4a2b55', '#2b5555', '#55502b']

/**
 * The scene bar in the top-left corner. Clicking the scene name grows the bar
 * itself to show the scene list and campaign actions.
 */
export function SceneBar({
  campaign,
  scenes,
  activeId,
}: {
  campaign: Campaign
  scenes: SceneView[]
  activeId: string | null
}) {
  const active = scenes.find((s) => s.id === activeId)
  const isGm = campaign.isGm()
  const campaignName = useY(campaign.meta, () => campaign.name)
  const expanded = useSignal(false)
  const barRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLDialogElement>(null)
  const helpRef = useRef<HTMLDialogElement>(null)

  function setExpanded(next: boolean) {
    expanded.value = next
  }

  // Collapse on Escape or a press anywhere outside the bar.
  useEffect(() => {
    if (!expanded.value) return
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setExpanded(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded.value])

  function openDialog(dialog: HTMLDialogElement | null) {
    expanded.value = false
    dialog?.showModal()
  }

  function addScene() {
    const colour = SCENE_SWATCHES[scenes.length % SCENE_SWATCHES.length]
    const id = campaign.addScene(`Scene ${scenes.length + 1}`, colour)
    campaign.setActiveScene(id)
  }

  return (
    <div
      ref={barRef}
      class="scene-bar panel bevel chrome dock-top dock-left"
      data-expanded={expanded.value}
    >
      <div class="scene-bar-head">
        <span class="eyebrow">{campaignName}</span>
        <button
          ref={toggleRef}
          type="button"
          class="scene-switch"
          aria-expanded={expanded.value}
          aria-controls="scene-menu"
          onClick={() => setExpanded(!expanded.value)}
        >
          <h1 class="scene-title">{active?.name ?? 'No scenes'}</h1>
          <IconExpand size={18} class="scene-switch-chevron" />
        </button>
      </div>

      {/* Always rendered so it can animate closed; inert while closed. */}
      <div class="scene-bar-drawer">
        <div id="scene-menu" class="scene-bar-body" inert={!expanded.value}>
          <div class="scene-bar-scenes">
            <div class="eyebrow">Scenes</div>
            <ul class="scene-list">
              {scenes.map((s) => (
                <li key={s.id} class="scene-item" data-active={s.id === activeId}>
                  {isGm ? (
                    <input
                      type="color"
                      class="scene-swatch bevel"
                      value={s.colour}
                      aria-label={`Colour of ${s.name}`}
                      onInput={(e) => campaign.updateScene(s.id, { colour: e.currentTarget.value })}
                    />
                  ) : (
                    <span class="scene-swatch bevel" style={{ background: s.colour }} />
                  )}
                  {isGm ? (
                    <input
                      class="scene-name-input"
                      value={s.name}
                      aria-label="Scene name"
                      onFocus={() => campaign.setActiveScene(s.id)}
                      onChange={(e) =>
                        campaign.updateScene(s.id, { name: e.currentTarget.value || 'Untitled scene' })
                      }
                    />
                  ) : (
                    <button type="button" class="scene-name-button" onClick={() => campaign.setActiveScene(s.id)}>
                      {s.name}
                    </button>
                  )}
                  {isGm && s.id !== activeId && (
                    <Button variant="ghost" size="sm" onClick={() => campaign.setActiveScene(s.id)}>
                      View
                    </Button>
                  )}
                  {isGm && scenes.length > 1 && (
                    <Button
                      variant="icon"
                      label={`Delete ${s.name}`}
                      onClick={() => campaign.removeScene(s.id)}
                    >
                      <IconDelete size={16} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {isGm && (
              <Button variant="secondary" size="sm" onClick={addScene}>
                <IconAdd size={16} /> New scene
              </Button>
            )}
          </div>

          <div class="menu-section" role="group" aria-label={campaignName}>
            <button type="button" class="menu-item bevel" onClick={() => openDialog(settingsRef.current)}>
              <IconSettings size={16} /> Campaign settings
            </button>
            <button type="button" class="menu-item bevel" onClick={() => openDialog(helpRef.current)}>
              <IconHelp size={16} /> Help and shortcuts
            </button>
            <button type="button" class="menu-item bevel" onClick={() => goToCampaign(null)}>
              <IconLeave size={16} /> Back to campaigns
            </button>
          </div>
        </div>
      </div>

      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
    </div>
  )
}
