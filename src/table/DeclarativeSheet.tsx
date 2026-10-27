import {
  bumpData,
  bumpResource,
  canEdit,
  setData,
  setField,
  setLearned,
  setModifier,
  setNpcField,
  setScore,
  startMove,
  toggleCondition,
} from '../characters/api'
import { actionsFor, derive, statBonus, type CharacterView } from '../characters/store'
import { postRoll } from '../chat/send'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import type { Derived, GameSystem, SheetCounter, SheetSection } from '../systems/types'
import { Button } from '../ui/Button'
import { CharacterText } from './CharacterText'
import { Inventory } from './Inventory'
import { Counter, MoveList, signedStr, TokenChip } from './sheetParts'

/*
 * A character sheet drawn from the system's layout (design: core change
 * 13): a list of sections, each a kind the core knows how to draw, so a
 * system describes its sheet as data. Dungeon World's sheets are layouts.
 */

type Props = { campaign: Campaign; system: GameSystem; c: CharacterView; layout: SheetSection[] }

const num = (v: unknown) => Number(v ?? 0)

export function DeclarativeSheet({ campaign, system, c, layout }: Props) {
  const d = derive(c, system)
  const editable = canEdit(campaign, c)
  return (
    <div class="sheet">
      {layout.map((section, i) => (
        <Section key={i} campaign={campaign} system={system} c={c} d={d} editable={editable} section={section} />
      ))}
      {c.kind === 'pc' && (
        <p class="muted sheet-owner">{c.owner === device.value.id ? 'Yours' : editable ? 'Editing as GM' : 'View only'}</p>
      )}
    </div>
  )
}

type SectionProps = { campaign: Campaign; system: GameSystem; c: CharacterView; d: Derived; editable: boolean; section: SheetSection }

function Section({ campaign, system, c, d, editable, section }: SectionProps) {
  const v = d.values
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
  switch (section.kind) {
    case 'header': {
      const cls = system.classes.find((k) => k.id === c.classId) ?? system.classes[0]
      return (
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
            <span class="muted">{c.kind === 'npc' ? 'NPC' : `${cls?.name}, level ${c.level}`}</span>
          </div>
        </header>
      )
    }
    case 'counters':
      return (
        <section class="sheet-section" aria-label="Vitals">
          <div class="sheet-vitals">
            {section.items.map((item) => (
              <SheetNumber key={item.label} campaign={campaign} c={c} d={d} editable={editable} item={item} />
            ))}
          </div>
        </section>
      )
    case 'levelUp': {
      const xp = num(c.data[section.xp])
      const needed = v[section.needed]
      if (!editable || xp < needed) return null
      return (
        <div class="sheet-levelup">
          <span>Ready to level up.</span>
          <Button
            size="sm"
            onClick={() =>
              campaign.doc.transact(() => {
                set('level', c.level + 1)
                setData(campaign, c.id, section.xp, xp - needed)
              })
            }
          >
            Level up
          </Button>
        </div>
      )
    }
    case 'derived':
      return (
        <dl class="sheet-derived" aria-label="Combat">
          {section.items.map((item) => (
            <div key={item.label} title={d.resolved.why[item.value]?.join('\n')} data-over={item.max ? v[item.value] > v[item.max] : undefined}>
              <dt>{item.label}</dt>
              <dd>
                {item.format === 'die' ? `d${v[item.value]}` : v[item.value]}
                {item.plus && v[item.plus] ? signedStr(v[item.plus]) : ''}
                {item.max && `/${v[item.max]}`}
              </dd>
            </div>
          ))}
        </dl>
      )
    case 'stats':
      return <Stats campaign={campaign} system={system} c={c} d={d} editable={editable} label={section.label} hint={section.hint} />
    case 'modifiers':
      return (
        <section class="sheet-section" aria-label={section.label}>
          <h3 class="sheet-heading">{section.label}</h3>
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
      )
    case 'actions':
      return (
        <section class="sheet-section" aria-label={section.label} data-move-drop={editable ? c.id : undefined}>
          <h3 class="sheet-heading">{section.label}</h3>
          <MoveList
            campaign={campaign}
            system={system}
            moves={actionsFor(c, system, d)}
            onMake={(m) => startMove(campaign, c.id, m)}
            learned={c.learned}
            onForget={editable ? (m) => setLearned(campaign, c.id, m.id, false) : undefined}
          />
        </section>
      )
    case 'inventory':
      return <Inventory campaign={campaign} c={c} d={c.kind === 'pc' ? d : undefined} editable={editable} />
    case 'npcFields':
      return (
        <>
          {system.npcFields.map((f) =>
            f.type === 'longtext' ? (
              <CharacterText key={f.id} campaign={campaign} c={c} field={`field:${f.id}`} label={f.label} editable={editable} />
            ) : (
              <label key={f.id} class="field">
                {f.label}
                <input
                  class="input bevel"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={c.fields[f.id]}
                  disabled={!editable}
                  onChange={(e) => setNpcField(campaign, c.id, f.id, f.type === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)}
                />
              </label>
            ),
          )}
        </>
      )
    case 'text': {
      const fields = section.fields.map((f) => (
        <CharacterText key={f.field} campaign={campaign} c={c} field={f.field} label={f.label} editable={editable} placeholder={f.placeholder} />
      ))
      if (!section.label) return <>{fields}</>
      return (
        <section class="sheet-section" aria-label={section.label}>
          <h3 class="sheet-heading">{section.label}</h3>
          {fields}
        </section>
      )
    }
  }
}

/** One number: a resource, a data field or the level. */
function SheetNumber({ campaign, c, d, editable, item }: { campaign: Campaign; c: CharacterView; d: Derived; editable: boolean; item: SheetCounter }) {
  const max = 'max' in item && item.max ? d.values[item.max] : undefined
  if ('resource' in item) {
    return (
      <Counter
        label={item.label}
        value={c.resources[item.resource] ?? 0}
        max={max}
        disabled={!editable}
        onChange={(by) => bumpResource(campaign, c.id, item.resource, by, max)}
      />
    )
  }
  if ('level' in item) {
    return <Counter label={item.label} value={c.level} disabled={!editable} onChange={(by) => setField(campaign, c.id, 'level', Math.max(0, c.level + by))} />
  }
  const value = num(c.data[item.data])
  if (item.input) {
    return (
      <label class="counter">
        <span class="eyebrow">{item.label}</span>
        <input
          class="input bevel stat-score"
          type="number"
          min={1}
          value={value}
          disabled={!editable}
          onChange={(e) => {
            const n = Math.floor(Number(e.currentTarget.value))
            if (n >= 1) setData(campaign, c.id, item.data, n)
          }}
        />
      </label>
    )
  }
  return <Counter label={item.label} value={value} max={max} disabled={!editable} onChange={(by) => bumpData(campaign, c.id, item.data, by)} />
}

/** Each stat: its modifier (click to roll), its score, and the condition tied to it, if any. */
function Stats({ campaign, system, c, d, editable, label, hint }: Omit<SectionProps, 'section'> & { label: string; hint?: string }) {
  const rollStat = (statId: string, abbr: string) => {
    const mod = statBonus(d, statId)
    postRoll(campaign, `${system.baseRoll}${mod ? `${mod < 0 ? '-' : '+'}${Math.abs(mod)}` : ''}[${abbr}]`, 'public', abbr)
  }
  return (
    <section class="sheet-section" aria-label={label}>
      <h3 class="sheet-heading">
        {label} {hint && <span class="muted">· {hint}</span>}
      </h3>
      <ul class="sheet-stats">
        {system.stats.map((s) => {
          const tied = system.conditions.find((x) => x.stat === s.id)
          const has = !!tied && c.conditions.includes(tied.id)
          return (
            <li key={s.id} data-debilitated={has}>
              <span class="stat-abbr" title={s.name}>
                {s.abbr}
              </span>
              <button type="button" class="stat-mod bevel" title={`Roll +${s.name}`} aria-label={`Roll +${s.name}`} onClick={() => rollStat(s.id, s.abbr)}>
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
              {tied && (
                <label class="stat-deb">
                  <input type="checkbox" checked={has} disabled={!editable} onChange={() => toggleCondition(campaign, c.id, tied.id)} />
                  {tied.name}
                </label>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
