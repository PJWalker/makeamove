import {
  bumpData,
  bumpResource,
  canEdit,
  setData,
  setField,
  setModifier,
  setNpcField,
  setScore,
  startMove,
  toggleCondition,
} from '../../characters/api'
import { actionsFor, derive, statBonus, type CharacterView } from '../../characters/store'
import { postRoll } from '../../chat/send'
import type { Campaign } from '../../store/campaign'
import { device } from '../../store/device'
import { Inventory } from '../../table/Inventory'
import { Counter, MoveList, signedStr, TokenChip } from '../../table/sheetParts'
import { Button } from '../../ui/Button'
import type { ActionDef, GameSystem } from '../types'

/*
 * Dungeon World's character sheets. Until sheets are declarative (M5), a
 * system draws its own from the shared parts in table/sheetParts.tsx.
 */

const num = (v: unknown) => Number(v ?? 0)

/** A player character's sheet. */
export function DungeonWorldSheet({ campaign, system, c }: { campaign: Campaign; system: GameSystem; c: CharacterView }) {
  const d = derive(c, system)
  const v = d.values
  const cls = system.classes.find((k) => k.id === c.classId) ?? system.classes[0]
  const editable = canEdit(campaign, c)
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
  const xp = num(c.data.xp)
  const moves = actionsFor(c, system, d)
  const make = (m: ActionDef) => startMove(campaign, c.id, m)
  const rollStat = (statId: string, abbr: string) => {
    const mod = statBonus(d, statId)
    postRoll(campaign, `${system.baseRoll}${mod ? `${mod < 0 ? '-' : '+'}${Math.abs(mod)}` : ''}[${abbr}]`, 'public', abbr)
  }

  return (
    <div class="sheet">
      <header class="sheet-head">
        <TokenChip campaign={campaign} c={c} editable={editable} />
        <div class="sheet-title">
          <input
            class="input bevel sheet-name"
            aria-label="Name"
            value={c.name}
            disabled={!editable}
            onChange={(e) => e.currentTarget.value.trim() && set('name', e.currentTarget.value.trim())}
          />
          <span class="muted">
            {cls.name}, level {c.level}
          </span>
        </div>
      </header>

      <section class="sheet-section" aria-label="Vitals">
        <div class="sheet-vitals">
          <Counter
            label="HP"
            value={c.resources.hp ?? 0}
            max={v.maxHp}
            disabled={!editable}
            onChange={(by) => bumpResource(campaign, c.id, 'hp', by, v.maxHp)}
          />
          <Counter label="XP" value={xp} max={v.xpNeeded} disabled={!editable} onChange={(by) => bumpData(campaign, c.id, 'xp', by)} />
          <Counter label="Level" value={c.level} disabled={!editable} onChange={(by) => set('level', Math.max(0, c.level + by))} />
          <Counter label="Coin" value={num(c.data.coin)} disabled={!editable} onChange={(by) => bumpData(campaign, c.id, 'coin', by)} />
        </div>
      </section>

      {editable && xp >= v.xpNeeded && (
        <div class="sheet-levelup">
          <span>Ready to level up.</span>
          <Button
            size="sm"
            onClick={() => {
              set('level', c.level + 1)
              setData(campaign, c.id, 'xp', xp - v.xpNeeded)
            }}
          >
            Level up
          </Button>
        </div>
      )}

      <dl class="sheet-derived" aria-label="Combat">
        <div title={d.resolved.why.armor?.join('\n')}>
          <dt>Armor</dt>
          <dd>{v.armor}</dd>
        </div>
        <div title={d.resolved.why.damage?.join('\n')}>
          <dt>Damage</dt>
          <dd>
            d{v.damage}
            {v.damageBonus ? signedStr(v.damageBonus) : ''}
          </dd>
        </div>
        <div data-over={v.load > v.maxLoad}>
          <dt>Load</dt>
          <dd>
            {v.load}/{v.maxLoad}
          </dd>
        </div>
      </dl>

      <section class="sheet-section" aria-label="Stats">
        <h3 class="sheet-heading">
          Stats <span class="muted">· click a modifier to roll</span>
        </h3>
        <ul class="sheet-stats">
          {system.stats.map((s) => {
            const deb = system.conditions.find((x) => x.stat === s.id)
            const hit = !!deb && c.conditions.includes(deb.id)
            return (
              <li key={s.id} data-debilitated={hit}>
                <span class="stat-abbr" title={s.name}>
                  {s.abbr}
                </span>
                <button
                  type="button"
                  class="stat-mod bevel"
                  title={`Roll +${s.name}`}
                  aria-label={`Roll +${s.name}`}
                  onClick={() => rollStat(s.id, s.abbr)}
                >
                  {signedStr(statBonus(d, s.id))}
                </button>
                <label class="stat-score-label">
                  <span class="muted">Score</span>
                  <input
                    class="input bevel stat-score"
                    type="number"
                    min={1}
                    max={20}
                    aria-label={`${s.name} score`}
                    value={c.scores[s.id]}
                    disabled={!editable}
                    onChange={(e) => {
                      const n = Number(e.currentTarget.value)
                      if (n >= 1 && n <= 20) setScore(campaign, c.id, s.id, n)
                    }}
                  />
                </label>
                {deb && (
                  <label class="stat-deb">
                    <input type="checkbox" checked={hit} disabled={!editable} onChange={() => toggleCondition(campaign, c.id, deb.id)} />
                    {deb.name}
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section class="sheet-section" aria-label="Situation">
        <h3 class="sheet-heading">Situation</h3>
        <div class="sheet-vitals">
          {system.modifiers.map((m) => (
            <Counter
              key={m.id}
              label={m.label}
              value={c.modifiers[m.id] ?? 0}
              disabled={!editable}
              onChange={(by) => setModifier(campaign, c.id, m.id, (c.modifiers[m.id] ?? 0) + by)}
            />
          ))}
        </div>
      </section>

      <section class="sheet-section" aria-label="Moves">
        <h3 class="sheet-heading">Moves</h3>
        <MoveList system={system} moves={moves} onMake={make} />
      </section>

      <Inventory campaign={campaign} c={c} d={d} editable={editable} />

      <section class="sheet-section" aria-label="Bonds and notes">
        <h3 class="sheet-heading">Bonds &amp; notes</h3>
        <label class="field">
          Bonds
          <textarea
            class="input bevel"
            rows={3}
            value={String(c.data.bonds ?? '')}
            disabled={!editable}
            onChange={(e) => setData(campaign, c.id, 'bonds', e.currentTarget.value)}
          />
        </label>
        <label class="field">
          Notes
          <textarea class="input bevel" rows={3} value={c.notes} disabled={!editable} onChange={(e) => set('notes', e.currentTarget.value)} />
        </label>
      </section>
      <p class="muted sheet-owner">{c.owner === device.value.id ? 'Yours' : editable ? 'Editing as GM' : 'View only'}</p>
    </div>
  )
}

/** A non-player character: HP and the fields Dungeon World lists for NPCs. */
export function DungeonWorldNpcSheet({ campaign, system, c }: { campaign: Campaign; system: GameSystem; c: CharacterView }) {
  const editable = canEdit(campaign, c)
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
  const maxHp = num(c.data.maxHp)
  return (
    <div class="sheet">
      <header class="sheet-head">
        <TokenChip campaign={campaign} c={c} editable={editable} />
        <div class="sheet-title">
          <input
            class="input bevel sheet-name"
            aria-label="Name"
            value={c.name}
            disabled={!editable}
            onChange={(e) => e.currentTarget.value.trim() && set('name', e.currentTarget.value.trim())}
          />
          <span class="muted">NPC</span>
        </div>
      </header>
      <div class="sheet-vitals">
        <Counter
          label="HP"
          value={c.resources.hp ?? 0}
          max={maxHp}
          disabled={!editable}
          onChange={(by) => bumpResource(campaign, c.id, 'hp', by, maxHp)}
        />
        <label class="counter">
          <span class="eyebrow">Max HP</span>
          <input
            class="input bevel stat-score"
            type="number"
            min={1}
            value={maxHp}
            disabled={!editable}
            onChange={(e) => {
              const n = Math.floor(Number(e.currentTarget.value))
              if (n >= 1) setData(campaign, c.id, 'maxHp', n)
            }}
          />
        </label>
      </div>
      {system.npcFields.map((f) => (
        <label key={f.id} class="field">
          {f.label}
          {f.type === 'longtext' ? (
            <textarea
              class="input bevel"
              rows={4}
              value={String(c.fields[f.id])}
              disabled={!editable}
              onChange={(e) => setNpcField(campaign, c.id, f.id, e.currentTarget.value)}
            />
          ) : (
            <input
              class="input bevel"
              type={f.type === 'number' ? 'number' : 'text'}
              value={c.fields[f.id]}
              disabled={!editable}
              onChange={(e) =>
                setNpcField(campaign, c.id, f.id, f.type === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)
              }
            />
          )}
        </label>
      ))}
      <Inventory campaign={campaign} c={c} editable={editable} />
      <label class="field">
        Notes
        <textarea class="input bevel" rows={4} value={c.notes} disabled={!editable} onChange={(e) => set('notes', e.currentTarget.value)} />
      </label>
    </div>
  )
}
