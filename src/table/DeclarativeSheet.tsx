import type { ReactNode } from 'react'
import { useSignal } from '@preact/signals-react'
import {
  bumpData,
  bumpResource,
  canEdit,
  setData,
  setField,
  setLearned,
  setLoadout,
  setModifier,
  setNpcField,
  setScore,
  setConditionState,
  startMove,
  toggleCondition,
} from '../characters/api'
import { actionsFor, derive, statBonus, type CharacterView } from '../characters/store'
import { conditionPipColour } from '../combat/pipColours'
import { postRoll } from '../chat/send'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import type { Derived, GameSystem, SheetCounter, SheetSection } from '../systems/types'
import { choicesAt } from "../characters/creation";
import { parseCommaList } from '../lib/list'
import { Button } from '../ui/Button'
import { OptionPicker } from '../ui/OptionPicker'
import { IconLock } from '../ui/icons'
import { menuTrigger } from '../ui/menuTrigger'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { CharacterText } from './CharacterText'
import { AdvancementDialog } from './CreationParts'
import { Inventory } from './Inventory'
import { Counter, MoveList, signedStr, TokenChip } from './sheetParts'

/*
 * Shared sections for system-owned sheet components, and a declarative
 * fallback for systems that supply layout data instead of components.
 */

export type SheetProps = { campaign: Campaign; system: GameSystem; c: CharacterView }
type Props = SheetProps & { layout: SheetSection[] }

const num = (v: unknown) => Number(v ?? 0)

export function useSheet(props: SheetProps) {
  return { ...props, d: derive(props.c, props.system), editable: canEdit(props.campaign, props.c) }
}

export function SheetFrame({ c, editable, children }: SheetProps & { editable: boolean; children: ReactNode }) {
  return (
    <div
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      {children}
      {c.kind === "pc" && (
        <p className="muted sheet-owner">
          {c.owner === device.value.id
            ? "Yours"
            : editable
              ? "Editing as GM"
              : "View only"}
        </p>
      )}
    </div>
  );
}

export function DeclarativeSheet({ layout, ...props }: Props) {
  const sheet = useSheet(props)
  return (
    <SheetFrame {...sheet}>
      {layout.map((section, index) => <SheetSectionView key={index} {...sheet} section={section} />)}
    </SheetFrame>
  )
}

type SectionProps = { campaign: Campaign; system: GameSystem; c: CharacterView; d: Derived; editable: boolean; section: SheetSection }

function Advancement({ campaign, c, d, editable, section }: Omit<SectionProps, 'system' | 'section'> & { section: Extract<SheetSection, { kind: 'advancement' }> }) {
  const open = useSignal(false)
  const needed = d.values[section.needed]
  if (!editable || needed === undefined || !Number.isFinite(needed) || num(c.data[section.xp]) < needed) return null
  return <div className="sheet-advancement">
    <span>{section.label}</span>
    <Button size="sm" onClick={() => (open.value = true)}>{section.button}</Button>
    {open.value && <AdvancementDialog campaign={campaign} characterId={c.id} onClose={() => (open.value = false)} />}
  </div>
}

function Loadout({ campaign, system, c, d, editable, id }: Omit<SectionProps, 'section'> & { id: string }) {
  const free = useSignal(false)
  const query = useSignal('')
  const definition = system.loadouts?.find((entry) => entry.id === id)
  if (!definition) return null
  const max = typeof definition.max === 'number' ? definition.max : d.values[definition.max] ?? 0
  const owned = definition.available?.(c, d) ?? parseCommaList(String(c.data[definition.ownedField] ?? '')).filter(Boolean)
  const active = parseCommaList(String(c.data[definition.activeField] ?? '')).filter(Boolean).slice(0, max)
  const options = definition.options.filter((option) => owned.includes(option.id))
  if (!options.length || max <= 0) return null
  return (
    <section className="form-section sheet-section" aria-label={definition.label}>
      <h3 className="sheet-heading">{definition.label} ({active.length}/{max})</h3>
      {definition.freeSwapLabel && <label className="check-option"><input type="checkbox" checked={free.value} disabled={!editable} onChange={(event) => (free.value = event.currentTarget.checked)} />{definition.freeSwapLabel}</label>}
      {options.length > 12 && <input type="search" aria-label={`Search ${definition.label}`} value={query.value} onInput={(event) => (query.value = event.currentTarget.value)} />}
      {options.filter((option) => option.name.toLowerCase().includes(query.value.trim().toLowerCase())).map((option) => {
        const selected = active.includes(option.id)
        const cost = definition.costs?.[option.id]
        const resource = cost && system.resources.find((entry) => entry.id === cost.resource)
        const affordable = !cost || free.value || !!resource && (c.resources[cost.resource] ?? 0) + cost.by <= (d.values[resource.max] ?? 0) && (c.resources[cost.resource] ?? 0) + cost.by >= 0
        return <label key={option.id} className="check-option" title={option.text}>
          <input type="checkbox" checked={selected} disabled={!editable || !selected && (active.length >= max || !affordable)} onChange={() => setLoadout(campaign, c.id, id, selected ? active.filter((entry) => entry !== option.id) : [...active, option.id], free.value)} />
          {option.name}
        </label>
      })}
    </section>
  )
}

export function SheetSectionView({ campaign, system, c, d, editable, section }: SectionProps) {
  const v = d.values
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
  switch (section.kind) {
    case "header": {
      return (
        <header className="sheet-head">
          <TokenChip campaign={campaign} c={c} editable={editable} />
          <div className="sheet-title">
            <input
              className="sheet-name"
              aria-label="Name"
              value={c.name}
              disabled={!editable}
              onChange={(e) =>
                e.currentTarget.value.trim() &&
                set("name", e.currentTarget.value.trim())
              }
            />
            <span className="muted">
              {c.kind === "npc" ? "NPC" : "Player character"}
            </span>
          </div>
        </header>
      );
    }
    case "choices": {
      const field = system.creation?.advancementField;
      const rank = Number(field ? c.data[field] : 0);
      const choices = [
        ...choicesAt(system.creation, "create", c.data),
        ...Array.from({ length: rank }, (_, i) =>
          choicesAt(system.creation, i + 1, c.data),
        ).flat(),
      ].filter(
        (choice) => !section.choices || section.choices.includes(choice.id),
      );
      return (
        <section className="form-section sheet-section" aria-label="Character choices">
          <h3 className="sheet-heading">Character choices</h3>
          {choices.map((choice) => (
            <OptionPicker
              key={choice.id}
              label={choice.label}
              options={choice.options}
              value={String(c.data[choice.field] ?? "")}
              disabled={!editable}
              onChange={(id) => setData(campaign, c.id, choice.field, id)}
            />
          ))}
        </section>
      );
    }
    case "fields":
      return (
        <section className="form-section sheet-section" aria-label={section.label ?? 'Character details'}>
          <h3 className="sheet-heading">{section.label ?? "Details"}</h3>
          {section.items.map((item) => (
            <label key={item.field} className="field">
              {item.label}
              <input
                type={item.type}
                min={item.type === 'number' ? item.min : undefined}
                max={item.type === 'number' ? item.max : undefined}
                value={String(c.data[item.field] ?? (item.type === 'number' ? 0 : ''))}
                disabled={!editable}
                onChange={(event) => {
                  if (item.type === 'number') {
                    const value = Number(event.currentTarget.value)
                    if (!Number.isFinite(value) || (item.min !== undefined && value < item.min) || (item.max !== undefined && value > item.max)) return
                    setData(campaign, c.id, item.field, value)
                  } else setData(campaign, c.id, item.field, event.currentTarget.value)
                }}
              />
            </label>
          ))}
        </section>
      )
    case 'loadout':
      return <Loadout campaign={campaign} system={system} c={c} d={d} editable={editable} id={section.loadout} />
    case "counters":
      return (
        <section className="form-section sheet-section" aria-label="Vitals">
          <h3 className="sheet-heading">Vitals</h3>
          <div className="sheet-vitals">
            {section.items.map((item) => (
              <SheetNumber
                key={item.label}
                campaign={campaign}
                c={c}
                d={d}
                editable={editable}
                item={item}
              />
            ))}
          </div>
        </section>
      );
    case "advancement": {
      return <Advancement campaign={campaign} c={c} d={d} editable={editable} section={section} />
    }
    case "derived":
      const derivedValue = (id: string) => v[id] ?? 0;
      return (
        <section className="form-section sheet-derived-group" aria-label="Combat">
          <h3 className="sheet-heading">Combat</h3>
          <dl className="sheet-derived">
            {section.items.map((item) => (
              <div
                key={item.label}
                title={d.resolved.why[item.value]?.join("\n")}
                data-over={item.max ? derivedValue(item.value) > derivedValue(item.max) : undefined}
              >
                <dt>{item.label}</dt>
                <dd>
                  {item.format === "die" ? `d${derivedValue(item.value)}` : derivedValue(item.value)}
                  {item.plus && derivedValue(item.plus) ? signedStr(derivedValue(item.plus)) : ""}
                  {item.max && `/${derivedValue(item.max)}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "stats":
      return (
        <Stats
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          label={section.label}
          hint={section.hint}
          showScore={section.showScore !== false}
        />
      );
    case "modifiers":
      return (
        <section className="form-section sheet-section" aria-label={section.label}>
          <h3 className="sheet-heading">{section.label}</h3>
          <div className="sheet-vitals">
            {system.modifiers.map((m) => (
              <Counter
                key={m.id}
                label={m.label}
                value={c.modifiers[m.id] ?? 0}
                disabled={!editable}
                onChange={(by) =>
                  setModifier(
                    campaign,
                    c.id,
                    m.id,
                    (c.modifiers[m.id] ?? 0) + by,
                  )
                }
              />
            ))}
          </div>
        </section>
      );
    case "actions":
      return (
        <section
          className="form-section sheet-section"
          aria-label={section.label}
          data-move-drop={editable ? c.id : undefined}
        >
          <h3 className="sheet-heading">{section.label}</h3>
          <MoveList
            campaign={campaign}
            system={system}
            moves={actionsFor(c, system, d)}
            ownerId={c.id}
            onMake={(m) => startMove(campaign, c.id, m)}
            learned={c.learned}
            onForget={
              editable
                ? (m) => setLearned(campaign, c.id, m.id, false)
                : undefined
            }
          />
        </section>
      );
    case "inventory":
      return (
        <Inventory
          campaign={campaign}
          c={c}
          {...(c.kind === "pc" ? { d } : {})}
          editable={editable}
        />
      );
    case "npcFields":
      return (
        <section className="form-section sheet-section" aria-label="Details">
          <h3 className="sheet-heading">Details</h3>
          {system.npcFields.filter((field) => !section.fields || section.fields.includes(field.id)).map((f) =>
            f.type === "longtext" ? (
              <CharacterText
                key={f.id}
                campaign={campaign}
                c={c}
                field={`field:${f.id}`}
                label={f.label}
                editable={editable}
              />
            ) : (
              <label key={f.id} className="field">
                {f.label}
                <input

                  type={f.type === "number" ? "number" : "text"}
                  value={c.fields[f.id]}
                  disabled={!editable}
                  onChange={(e) =>
                    setNpcField(
                      campaign,
                      c.id,
                      f.id,
                      f.type === "number"
                        ? Number(e.currentTarget.value) || 0
                        : e.currentTarget.value,
                    )
                  }
                />
              </label>
            ),
          )}
        </section>
      );
    case "text": {
      const fields = section.fields.map((f) => (
        <CharacterText
          key={f.field}
          campaign={campaign}
          c={c}
          field={f.field}
          label={f.label}
          editable={editable}
          {...(f.placeholder ? { placeholder: f.placeholder } : {})}
        />
      ));
      if (!section.label) return <>{fields}</>;
      return (
        <section className="form-section sheet-section" aria-label={section.label}>
          <h3 className="sheet-heading">{section.label}</h3>
          {fields}
        </section>
      );
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
    );
  }
  const value = num(c.data[item.data])
  if (item.input) {
    return (
      <label className="counter">
        <span className="eyebrow">{item.label}</span>
        <input
          className="stat-score"
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
function Stats({ campaign, system, c, d, editable, label, hint, showScore }: Omit<SectionProps, 'section'> & { label: string; hint?: string | undefined; showScore: boolean }) {
  const menu = useSignal<{ x: number; y: number; label: string; items: MenuItem[] } | null>(null)
  const rollStat = (statId: string, abbr: string) => {
    const mod = statBonus(d, statId)
    const formula = `${system.baseRoll}${mod ? `${mod < 0 ? '-' : '+'}${Math.abs(mod)}` : ''}[${abbr}]`
    postRoll(campaign, system.checkRoll?.(formula, statId, c) ?? formula, 'public', abbr)
  }
  return (
    <section className="form-section sheet-section" aria-label={label}>
      <h3 className="sheet-heading">
        {label} {hint && <span className="muted">· {hint}</span>}
      </h3>
      <ul className="sheet-stats" data-lockable={system.conditions.some((condition) => condition.lockable)}>
        {system.stats.map((s) => {
          const tied = system.conditions.find((x) => x.stat === s.id)
          const has = !!tied && c.conditions.includes(tied.id)
          const state = tied && c.lockedConditions?.includes(tied.id) ? 'locked' : has ? 'marked' : 'clear'
          const nextState = state === 'clear' ? 'marked' : state === 'marked' ? 'locked' : 'clear'
          const trigger = menuTrigger((x, y) => {
            if (!editable) return
            const min = s.min ?? 1
            const max = s.max ?? 20
            menu.value = { x, y, label: `Edit ${s.name}`, items: Array.from({ length: max - min + 1 }, (_, index) => {
              const value = min + index
              return { label: `Set ${s.name} to ${showScore ? value : signedStr(value)}`, checked: c.scores[s.id] === value, onSelect: () => setScore(campaign, c.id, s.id, value) }
            }) }
          })
          return (
            <li key={s.id} data-debilitated={has}>
              <span className="stat-abbr" title={s.name}>
                {s.abbr}
              </span>
              <button type="button" className="stat-mod" title={`Roll +${s.name}`} aria-label={`Roll +${s.name}`} onClick={() => rollStat(s.id, s.abbr)} onPointerDown={editable ? trigger.onPointerDown : undefined} onContextMenu={editable ? trigger.onContextMenu : undefined}>
                {signedStr(statBonus(d, s.id))}
              </button>
              {showScore && <label className="stat-score-label">
                <span className="muted">Score</span>
                <input
                  className="stat-score"
                  type="number"
                  min={s.min ?? 1}
                  max={s.max ?? 20}
                  aria-label={`${s.name} score`}
                  value={c.scores[s.id]}
                  disabled={!editable}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value)
                    if (Number.isInteger(n) && n >= (s.min ?? 1) && n <= (s.max ?? 20)) setScore(campaign, c.id, s.id, n)
                  }}
                />
              </label>}
              {tied?.lockable ? (
                  <button
                    type="button"
                    className="stat-deb condition-status"
                    data-state={state}
                    style={{ '--condition-colour': conditionPipColour(system.conditions.findIndex((condition) => condition.id === tied.id)) }}
                    aria-label={`${tied.name}: ${state}. ${nextState === 'clear' ? 'Clear' : nextState === 'marked' ? 'Mark' : 'Lock'} condition`}
                    title={`${tied.name}: ${state}`}
                    disabled={!editable}
                    onClick={() => setConditionState(campaign, c.id, tied.id, nextState)}
                  >
                    <span className="condition-symbol" aria-hidden="true">
                      {state === 'locked' ? <IconLock size={16} /> : <span className="condition-dot" />}
                    </span>
                    <span className="condition-name">{tied.name}</span>
                  </button>
              ) : tied && (
                <label className="stat-deb">
                  <input type="checkbox" checked={has} disabled={!editable} onChange={() => toggleCondition(campaign, c.id, tied.id)} />
                  {tied.name}
                </label>
              )}
            </li>
          )
        })}
      </ul>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </section>
  )
}
