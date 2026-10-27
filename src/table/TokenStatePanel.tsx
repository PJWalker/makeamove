import { canEdit } from '../characters/api'
import { derive, type CharacterView } from '../characters/store'
import { asToken, freshState, type TokenState } from '../characters/templates'
import type { TokenElement } from '../scene/types'
import type { Campaign } from '../store/campaign'
import type { GameSystem } from '../systems/types'
import { Counter } from './sheetParts'

/**
 * One token of a template: the HP, conditions and modifiers it keeps for
 * itself. Changes go to the token, not the template.
 */
export function TokenStatePanel({
  campaign,
  system,
  template,
  token,
  onChange,
}: {
  campaign: Campaign
  system: GameSystem
  template: CharacterView
  token: TokenElement
  onChange: (state: TokenState) => void
}) {
  const state = token.state ?? freshState(template, system)
  const c = asToken(template, system, state, token.name)
  const d = derive(c, system)
  const editable = canEdit(campaign, template)
  const set = (patch: Partial<TokenState>) => onChange({ ...state, ...patch })

  return (
    <section class="sheet-section token-state" aria-label="This token">
      <h3 class="sheet-heading">
        {token.name || template.name} <span class="muted">· this token</span>
      </h3>
      <div class="sheet-vitals">
        {system.resources.map((r) => {
          const max = d.values[r.max] ?? 0
          const value = state.resources[r.id] ?? max
          return (
            <Counter
              key={r.id}
              label={r.name}
              value={value}
              max={max}
              disabled={!editable}
              onChange={(by) => set({ resources: { ...state.resources, [r.id]: Math.max(0, Math.min(max, value + by)) } })}
            />
          )
        })}
        {system.modifiers.map((m) => (
          <Counter
            key={m.id}
            label={m.label}
            value={state.modifiers[m.id] ?? 0}
            disabled={!editable}
            onChange={(by) => set({ modifiers: { ...state.modifiers, [m.id]: (state.modifiers[m.id] ?? 0) + by } })}
          />
        ))}
      </div>
      {system.conditions.length > 0 && (
        <div class="token-conditions">
          {system.conditions.map((k) => (
            <label key={k.id} class="check" title={k.text}>
              <input
                type="checkbox"
                checked={state.conditions.includes(k.id)}
                disabled={!editable}
                onChange={() =>
                  set({
                    conditions: state.conditions.includes(k.id) ? state.conditions.filter((x) => x !== k.id) : [...state.conditions, k.id],
                  })
                }
              />
              {k.name}
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
