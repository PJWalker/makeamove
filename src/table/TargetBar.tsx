import { useSignalEffect } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { getCharacter, startMove, systemOf, targetRequest } from '../characters/api'
import { inRange } from '../scene/measure'
import { activeTool } from '../scene/tools'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { IconTarget } from '../ui/icons'
import { chosenTargets, sceneDistance, targetPick } from './canvasState'

/*
 * The bar that rises above the hotbar while a move waits for its targets:
 * what the move is, what to target, the targets picked on the map so far,
 * and the button that makes the move.
 */

const cancel = () => (targetRequest.value = null)

export function TargetBar({ campaign }: { campaign: Campaign }) {
  const req = targetRequest.value
  const move = req ? systemOf(campaign).actions.find((m) => m.id === req.moveId) : undefined
  const c = req ? getCharacter(campaign, req.characterId) : undefined
  const spec = move?.target

  // Hand the request to the scene, so clicks on tokens target them.
  useSignalEffect(() => {
    const r = targetRequest.value
    const s = r && systemOf(campaign).actions.find((m) => m.id === r.moveId)?.target
    targetPick.value = r && s ? { max: s.max, actor: r.characterId } : null
    if (r) activeTool.value = 'select'
  })
  useEffect(() => () => void (targetRequest.value = null), [])

  // Escape backs out, before the canvas uses it to clear the selection.
  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [req])

  if (!req || !move || !spec || !c) return null
  const targets = chosenTargets.value
  const ready = targets.length >= spec.min
  const fmt = sceneDistance.value
  const wanted = spec.max === 1 ? 'one target' : spec.max ? `up to ${spec.max} targets` : 'any number of targets'

  const make = () => {
    if (!ready) return
    const picked = targets.map((t) => ({ id: t.id, name: t.name, ...(t.distance !== null ? { distance: fmt(t.distance) } : {}) }))
    targetRequest.value = null
    startMove(campaign, c.id, move, picked)
  }

  return (
    <div class="target-bar-wrap">
      <div class="target-bar panel bevel chrome" role="status" aria-live="polite">
        <IconTarget size={22} class="target-bar-icon" />
        <div class="target-bar-text">
          <span class="eyebrow">
            {move.name} · {c.name}
          </span>
          <span class="target-bar-prompt">{spec.prompt}</span>
          {targets.length ? (
            <span class="target-bar-chosen">
              {targets.map((t) => {
                const out = spec.range && t.distance !== null && inRange(t.distance, spec.range) === 'out'
                return (
                  <span key={t.id} class="target-chip" data-out={out || undefined} title={out ? 'Out of range' : undefined}>
                    {t.name}
                    {t.distance !== null && <span class="muted"> {fmt(t.distance)}</span>}
                  </span>
                )
              })}
            </span>
          ) : (
            <span class="muted">Click a token on the map: {wanted}.</span>
          )}
        </div>
        <div class="target-bar-actions">
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={make}>
            {move.name}
          </Button>
        </div>
      </div>
    </div>
  )
}
