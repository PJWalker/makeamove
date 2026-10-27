import { useSignalEffect } from '@preact/signals'
import { useRef } from 'preact/hooks'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconAdd, IconDelete, IconGrid } from '../ui/icons'
import { morphOpen } from '../ui/morph'
import { openPopup } from '../ui/popup'
import { dialogRequest, sceneSettingsOpen } from './canvasState'
import { HelpDialog, SettingsDialog } from './CampaignDialogs'

/**
 * The campaign's dialogs, always mounted so the command palette and the Scene
 * panel can open them whether or not that panel is on screen.
 */
export function CampaignDialogHost({ campaign }: { campaign: Campaign }) {
  const settingsRef = useRef<HTMLDialogElement>(null)
  const helpRef = useRef<HTMLDialogElement>(null)

  useSignalEffect(() => {
    const want = dialogRequest.value
    if (!want) return
    dialogRequest.value = null
    const dialog = { settings: settingsRef, help: helpRef }[want].current
    openPopup(dialog)
  })

  return (
    <>
      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
    </>
  )
}

/** The scene list, and the active scene's settings. (Campaign actions are in the tool strip's menu.) */
export function ScenePanel({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews())
  const activeId = useY(campaign.members, () => campaign.activeSceneId()) ?? scenes[0]?.id ?? null
  const campaignName = useY(campaign.meta, () => campaign.name)
  const isGm = campaign.isGm()
  const active = scenes.find((s) => s.id === activeId)

  function addScene() {
    const id = campaign.addScene(`Scene ${scenes.length + 1}`)
    campaign.setActiveScene(id)
  }

  return (
    <div class="panel-scroll scene-panel">
      <div class="eyebrow">{campaignName}</div>
      <ul class="scene-list" aria-label="Scenes">
        {scenes.map((s) => (
          <li key={s.id} class="scene-item" data-active={s.id === activeId} data-scene-id={s.id}>
            {isGm ? (
              <input
                class="scene-name-input"
                value={s.name}
                aria-label="Scene name"
                onFocus={() => campaign.setActiveScene(s.id)}
                onChange={(e) => campaign.updateScene(s.id, { name: e.currentTarget.value || 'Untitled scene' })}
              />
            ) : (
              <button type="button" class="scene-name-button" onClick={() => campaign.setActiveScene(s.id)}>
                {s.name}
              </button>
            )}
            {isGm && scenes.length > 1 && (
              <Button variant="icon" label={`Delete ${s.name}`} onClick={() => campaign.removeScene(s.id)}>
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

      {isGm && active && (
        <div class="menu-section" role="group" aria-label={active.name}>
          <button
            type="button"
            class="menu-item bevel"
            onClick={(e) => morphOpen(e.currentTarget, () => (sceneSettingsOpen.value = true))}
          >
            <IconGrid size={16} /> Scene settings
          </button>
        </div>
      )}
    </div>
  )
}
