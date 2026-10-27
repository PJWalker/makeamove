import { systemOf } from '../characters/api'
import { answerSave, applyDamage, canAnswer } from '../characters/resolution'
import { appliedField, saveField, type SaveAnswer } from '../chat/messageState'
import { useMessageState } from './ChatExtras'
import type { MoveMessage, MoveTarget, RollMessage } from '../chat/types'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'

/*
 * The parts of move and roll cards that resolve against targets: a roll per
 * target against its AC, roll requests that a target's owner answers, and
 * damage the GM applies. What changes after posting (answers, damage done)
 * comes from the campaign's message state.
 */


/** One row per target of a check against targets: the roll, what it had to reach, and hit or miss. */
export function TargetRolls({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  const results = systemOf(campaign).results
  return (
    <ul class="card-targets">
      {m.targets!.map((t) => {
        const label = results.find((r) => r.id === t.result)?.label
        const verdict = t.hit === undefined ? null : t.hit ? 'Hit' : 'Miss'
        return (
          <li key={t.id} class="card-target" data-hit={t.hit}>
            <span class="card-target-name">
              {t.name}
              {t.distance && <span class="muted"> {t.distance}</span>}
              {t.long && <span class="muted"> long range</span>}
            </span>
            <span class="card-target-roll" title={t.roll?.formula}>
              {t.roll?.total}
              {t.against !== undefined && <span class="muted"> vs {t.against}</span>}
            </span>
            <span class="card-target-verdict">{[label, verdict].filter(Boolean).join(' · ')}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** A roll request per target: a button for whoever may answer, then the answer against the DC. */
export function SaveRequests({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  const save = m.save!
  const state = useMessageState(campaign, m.id, (m.targets ?? []).map((t) => saveField(t.id)))
  const modes = systemOf(campaign).rollModes ?? []
  const gm = useY(campaign.members, () => campaign.isGm())
  return (
    <div class="card-save">
      <p class="card-save-head">
        {save.name} · DC {save.dc}
      </p>
      <ul class="card-targets">
        {(m.targets ?? []).map((t) => {
          const answer: SaveAnswer | undefined = state[saveField(t.id)]
          return (
            <li key={t.id} class="card-target" data-hit={answer ? !answer.success : undefined}>
              <span class="card-target-name">{t.name}</span>
              {answer ? (
                <>
                  <span class="card-target-roll" title={answer.detail}>
                    {answer.total}
                  </span>
                  <span class="card-target-verdict">{answer.success ? 'Saved' : 'Failed'}</span>
                </>
              ) : (gm || canAnswer(campaign, t)) ? (
                <span class="card-target-actions">
                  <Button size="sm" variant="ghost" onClick={() => answerSave(campaign, m.id, t, save, undefined, m.concentration)}>
                    Roll
                  </Button>
                  {modes.map((mode) => (
                    <Button key={mode.id} size="sm" variant="ghost" onClick={() => answerSave(campaign, m.id, t, save, mode.id, m.concentration)}>
                      {mode.label}
                    </Button>
                  ))}
                </span>
              ) : (
                <span class="muted">Waiting</span>
              )}
            </li>
          )
        })}
      </ul>
      <p class="card-save-outcomes">
        <strong>Success:</strong> {save.success} <strong>Failure:</strong> {save.failure}
      </p>
    </div>
  )
}

/** Damage or healing on a roll card: for the GM, buttons per target to apply it whole, halved or doubled. */
export function DamageTargets({ campaign, m }: { campaign: Campaign; m: RollMessage }) {
  const damage = m.damage!
  const state = useMessageState(campaign, m.id, damage.targets.map((t) => appliedField(t.id)))
  const gm = useY(campaign.members, () => campaign.isGm())
  const healing = damage.type === 'healing'
  const typeName = systemOf(campaign).damageTypes?.find((d) => d.id === damage.type)?.name ?? damage.type
  const total = m.roll.total
  const apply = (t: MoveTarget, n: number) => applyDamage(campaign, m.id, t, n, healing)
  return (
    <div class="card-damage">
      <p class="card-save-head">{typeName}</p>
      <ul class="card-targets">
        {damage.targets.map((t) => {
          const applied: number | undefined = state[appliedField(t.id)]
          return (
            <li key={t.id} class="card-target">
              <span class="card-target-name">{t.name}</span>
              {applied !== undefined && (
                <span class="card-target-verdict">
                  {applied > 0 ? '+' : ''}
                  {applied} HP
                </span>
              )}
              {gm && t.characterId && (
                <span class="card-target-actions">
                  {healing ? (
                    <Button size="sm" variant="ghost" onClick={() => apply(t, total)}>
                      Heal {total}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" title="Apply" onClick={() => apply(t, total)}>
                        {total}
                      </Button>
                      <Button size="sm" variant="ghost" title="Resistance: half" onClick={() => apply(t, Math.floor(total / 2))}>
                        ½
                      </Button>
                      <Button size="sm" variant="ghost" title="Vulnerability: double" onClick={() => apply(t, total * 2)}>
                        ×2
                      </Button>
                    </>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
