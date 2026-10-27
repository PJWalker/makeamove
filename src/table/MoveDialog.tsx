import { useSignal, useSignalEffect } from '@preact/signals'
import { useRef } from 'preact/hooks'
import { getCharacter, makeMove, moveRequest, systemOf } from '../characters/api'
import { derive, type CharacterView } from '../characters/store'
import { planMove, needsChoice } from '../characters/moves'
import type { Campaign } from '../store/campaign'
import { openPopup } from '../ui/popup'
import { Button } from '../ui/Button'
import { Dialog } from './CampaignDialogs'

/** Asks for the stat (or bond) a move needs, shows the formula, then rolls. */
export function MoveDialog({ campaign }: { campaign: Campaign }) {
  const ref = useRef<HTMLDialogElement>(null)
  const req = moveRequest.value
  const stat = useSignal('')
  const bond = useSignal(1)
  const extra = useSignal(0)

  useSignalEffect(() => {
    if (moveRequest.value) {
      stat.value = ''
      bond.value = 1
      extra.value = 0
      openPopup(ref.current)
    } else ref.current?.close()
  })

  const system = systemOf(campaign)
  const move = req && system.actions.find((m) => m.id === req.moveId)
  const c: CharacterView | undefined = req ? getCharacter(campaign, req.characterId) : undefined
  const ask = move ? needsChoice(move) : null
  const choice = { stat: stat.value || undefined, ask: bond.value, extra: extra.value }
  const ready = !!move && !!c && (ask?.kind !== 'stat' || !!stat.value)
  const formula = ready ? planMove(system, move, c, derive(c, system), choice).formula : ''

  const go = () => {
    if (!ready) return
    void makeMove(campaign, c.id, move, choice, req?.targets)
    moveRequest.value = null
  }

  return (
    <Dialog dialogRef={ref} title={move ? `${move.name} (${c?.name ?? ''})` : 'Move'} onClose={() => (moveRequest.value = null)}>
      {move && c && (
        <form
          class="move-form"
          onSubmit={(e) => {
            e.preventDefault()
            go()
          }}
        >
          <p class="muted">{move.trigger}</p>
          {ask?.kind === 'stat' && (
            <div class="field" role="radiogroup" aria-label="Stat to roll">
              Roll which stat?
              <div class="move-stats">
                {system.stats.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    pressed={stat.value === s.id}
                    onClick={() => (stat.value = s.id)}
                  >
                    {s.abbr}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {ask?.kind === 'number' && (
            <label class="field">
              {ask.prompt}
              <input
                class="input bevel"
                type="number"
                min={ask.min}
                max={ask.max}
                value={bond.value}
                onInput={(e) => (bond.value = Number(e.currentTarget.value) || 0)}
              />
            </label>
          )}
          <label class="field">
            Extra bonus
            <input
              class="input bevel"
              type="number"
              min={-5}
              max={5}
              value={extra.value}
              onInput={(e) => (extra.value = Number(e.currentTarget.value) || 0)}
            />
          </label>
          <p class="move-formula">{ready ? formula : 'Pick a stat.'}</p>
          <Button variant="primary" type="submit" disabled={!ready}>
            Roll
          </Button>
        </form>
      )}
    </Dialog>
  )
}
