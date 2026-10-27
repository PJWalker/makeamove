import { useSignal } from '@preact/signals'
import { getCharacter, systemOf, toggleCondition } from '../characters/api'
import { derive } from '../characters/store'
import { roundOf, removeCombatant, turnOf, turnOrder, updateCombatant, previousTurn, type CombatantView } from '../combat/combat'
import {
  advanceTurn,
  beginCombat,
  combatMaps,
  endConcentration,
  finishCombat,
  rollAllInitiative,
  rollInitiative,
  setDuration,
} from '../combat/api'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconClose, IconDice, IconReveal, IconSecret } from '../ui/icons'

/*
 * The turn tracker: who's in the fight, in initiative order, whose turn it
 * is and the round. The GM runs it; players roll their own initiative and
 * see everyone the GM hasn't hidden. Each row shows the combatant's
 * conditions, with rounds left for timed ones, and any concentration.
 */

export function CombatPanel({ campaign }: { campaign: Campaign }) {
  const gm = useY(campaign.members, () => campaign.isGm())
  const state = useY(campaign.combat, () => `${roundOf(combatMaps(campaign))}|${turnOf(combatMaps(campaign)) ?? ''}`)
  const [roundText, turn] = state.split('|')
  const round = Number(roundText)
  const order = useY(campaign.combatants, () => JSON.stringify(turnOrder(campaign.combatants)))
  const all: CombatantView[] = JSON.parse(order)
  const shown = gm ? all : all.filter((c) => !c.hidden)
  const open = useSignal<string | null>(null)

  return (
    <div class="combat-panel">
      <div class="combat-bar">
        <span class="combat-round">{round ? `Round ${round}` : 'Not started'}</span>
        {gm && (
          <span class="combat-controls">
            {round > 0 ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => previousTurn(combatMaps(campaign))}>
                  Back
                </Button>
                <Button size="sm" variant="primary" disabled={!all.length} onClick={() => advanceTurn(campaign)}>
                  Next turn
                </Button>
                <Button size="sm" variant="ghost" onClick={() => finishCombat(campaign)}>
                  End
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" disabled={!all.some((c) => c.init === null)} onClick={() => void rollAllInitiative(campaign, { npcsOnly: true })}>
                  Roll for NPCs
                </Button>
                <Button size="sm" variant="primary" disabled={!all.length} onClick={() => beginCombat(campaign)}>
                  Start
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      {shown.length ? (
        <ol class="combat-list">
          {shown.map((c) => (
            <CombatRow
              key={c.id}
              campaign={campaign}
              c={c}
              current={c.id === turn}
              gm={gm}
              open={open.value === c.id}
              onToggle={() => (open.value = open.value === c.id ? null : c.id)}
              turn={turn || null}
              everyone={all}
            />
          ))}
        </ol>
      ) : (
        <p class="combat-empty muted">{gm ? 'Select tokens, then right-click: Add to combat.' : 'No fight yet.'}</p>
      )}
    </div>
  )
}

function CombatRow({
  campaign,
  c,
  current,
  gm,
  open,
  onToggle,
  turn,
  everyone,
}: {
  campaign: Campaign
  c: CombatantView
  current: boolean
  gm: boolean
  open: boolean
  onToggle: () => void
  turn: string | null
  everyone: CombatantView[]
}) {
  const system = systemOf(campaign)
  // Re-render when the character changes (HP, conditions).
  useY(campaign.characters, () => JSON.stringify(getCharacter(campaign, c.characterId) ?? null))
  const ch = getCharacter(campaign, c.characterId)
  const mine = !!ch && (gm || ch.owner === device.value.id)
  const hp = ch ? (ch.resources.hp ?? 0) : null
  const maxHp = ch ? derive(ch, system).values.maxHp : null
  const concentration = ch?.concentration ? system.actions.find((a) => a.id === ch.concentration)?.name : undefined
  const setInit = (v: string) => updateCombatant(combatMaps(campaign), c.id, { init: v === '' ? null : Number(v) })

  return (
    <li class="combat-row" data-current={current || undefined} data-hidden={c.hidden || undefined}>
      <div class="combat-main">
        {mine || gm ? (
          <input
            class="input bevel combat-init"
            type="number"
            aria-label={`${c.name} initiative`}
            value={c.init ?? ''}
            onChange={(e) => setInit(e.currentTarget.value)}
          />
        ) : (
          <span class="combat-init">{c.init ?? '–'}</span>
        )}
        <button type="button" class="combat-name" onClick={onToggle} aria-expanded={open}>
          {c.name}
          {hp !== null && gm && <span class="muted"> {hp}/{maxHp}</span>}
        </button>
        {c.init === null && (mine || gm) && (
          <Button variant="icon" size="sm" label="Roll initiative" onClick={() => void rollInitiative(campaign, c.id)}>
            <IconDice />
          </Button>
        )}
        {gm && (
          <>
            <Button
              variant="icon"
              size="sm"
              label={c.hidden ? 'Show to players' : 'Hide from players'}
              onClick={() => updateCombatant(combatMaps(campaign), c.id, { hidden: !c.hidden })}
            >
              {c.hidden ? <IconSecret /> : <IconReveal />}
            </Button>
            <Button variant="icon" size="sm" label="Remove from combat" onClick={() => removeCombatant(combatMaps(campaign), c.id)}>
              <IconClose />
            </Button>
          </>
        )}
      </div>
      {ch && (ch.conditions.length > 0 || concentration) && (
        <div class="combat-conditions">
          {ch.conditions.map((id) => {
            const def = system.conditions.find((k) => k.id === id)
            const d = ch.durations[id]
            return (
              <span key={id} class="list-tag bevel" title={def?.text}>
                {def?.name ?? id}
                {d && ` ${d.rounds}`}
              </span>
            )
          })}
          {concentration && (
            <span class="list-tag bevel combat-concentration">
              {concentration}
              {mine && (
                <button type="button" class="combat-chip-x" aria-label="End concentration" onClick={() => endConcentration(campaign, ch.id)}>
                  ×
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {open && ch && mine && <ConditionForm campaign={campaign} characterId={ch.id} turn={turn} everyone={everyone} />}
    </li>
  )
}

/** Give a condition for so many rounds, counted down at the end of a combatant's turn (by default whoever's turn it is). */
function ConditionForm({ campaign, characterId, turn, everyone }: { campaign: Campaign; characterId: string; turn: string | null; everyone: CombatantView[] }) {
  const system = systemOf(campaign)
  const condition = useSignal(system.conditions[0]?.id ?? '')
  const rounds = useSignal(1)
  const of = useSignal(turn ?? everyone[0]?.id ?? '')
  const tick = useSignal<'start' | 'end'>('end')
  const ch = getCharacter(campaign, characterId)!
  const has = ch.conditions.includes(condition.value)
  const add = () => {
    if (!condition.value) return
    campaign.doc.transact(() => {
      if (!has) toggleCondition(campaign, characterId, condition.value)
      setDuration(campaign, characterId, condition.value, rounds.value > 0 && of.value ? { rounds: rounds.value, tick: tick.value, of: of.value } : null)
    })
  }
  return (
    <form
      class="combat-form"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <select class="input bevel" aria-label="Condition" value={condition.value} onChange={(e) => (condition.value = e.currentTarget.value)}>
        {system.conditions.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>
      <label class="combat-form-rounds">
        <input class="input bevel" type="number" min={0} max={100} value={rounds.value} onInput={(e) => (rounds.value = Number(e.currentTarget.value) || 0)} />
        rounds, to the
      </label>
      <select class="input bevel" aria-label="Counted at" value={tick.value} onChange={(e) => (tick.value = e.currentTarget.value as 'start' | 'end')}>
        <option value="end">end</option>
        <option value="start">start</option>
      </select>
      <select class="input bevel" aria-label="Of whose turn" value={of.value} onChange={(e) => (of.value = e.currentTarget.value)}>
        {everyone.map((x) => (
          <option key={x.id} value={x.id}>
            of {x.name}’s turn
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" variant="primary">
        {has ? 'Set duration' : 'Add'}
      </Button>
      {has && (
        <Button size="sm" variant="ghost" onClick={() => campaign.doc.transact(() => {
          toggleCondition(campaign, characterId, condition.value)
          setDuration(campaign, characterId, condition.value, null)
        })}>
          Remove
        </Button>
      )}
    </form>
  )
}

