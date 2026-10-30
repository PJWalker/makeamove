import { useSignal, type Signal } from '@preact/signals'
import { addItem, canEdit, getCharacter, selectedCharacterId, startMove, systemOf } from '../characters/api'
import { deleteHomebrew, listHomebrew, saveGear, saveMove, type HomebrewEntry } from '../homebrew/homebrew'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import type { ActionDef, CheckStep, Effect, GameSystem, ItemDef, TargetSpec } from '../systems/types'
import { Button } from '../ui/Button'
import { ENTRY_ICONS, entryIcon, type EntryIconName } from '../ui/entryIcons'
import { IconAdd, IconBack, IconDelete } from '../ui/icons'
import { List, ListGroup } from "../ui/List";
import { Segmented } from '../ui/Segmented'
import { dragEntity, entity } from './entityDrag'
import { EntryRow, rollTag } from "./EntryWindow";
import { actionMenuItems } from "./actionMenu";

/*
 * Items: the table's own gear and moves (homebrew/homebrew.ts), with forms
 * to make and change them. They're used like the system's: dragged onto a
 * character, given from here, or made from a character's sheet once learned.
 */

type Editing = { kind: 'gear' | 'move'; id: string | null } | null

export function ItemsPanel({ campaign }: { campaign: Campaign }) {
  const json = useY(campaign.homebrew, () => JSON.stringify(listHomebrew(campaign.homebrew)))
  const entries: (HomebrewEntry & { id: string })[] = JSON.parse(json)
  const system = systemOf(campaign)
  const editing = useSignal<Editing>(null)
  const folded = useSignal<Set<string>>(new Set())
  const fold = (id: string) => ({
    open: !folded.value.has(id),
    onToggle: () => {
      const next = new Set(folded.value)
      if (!next.delete(id)) next.add(id)
      folded.value = next
    },
  })
  const meId = useY(campaign.members, () => selectedCharacterId(campaign))
  const me = useY(campaign.characters, () => getCharacter(campaign, meId))
  const canAct = !!me && canEdit(campaign, me)

  if (editing.value) {
    const { kind, id } = editing.value
    const found = id ? entries.find((e) => e.id === id) : undefined
    const close = () => (editing.value = null)
    return (
      <div class="panel-scroll items-panel">
        <div class="sheet-row">
          <Button variant="ghost" size="sm" onClick={close}>
            <IconBack size={18} /> Items
          </Button>
        </div>
        {kind === 'gear' ? (
          <GearForm campaign={campaign} system={system} initial={found?.kind === 'gear' ? found.item : undefined} onDone={close} />
        ) : (
          <MoveForm campaign={campaign} system={system} initial={found?.kind === 'move' ? found.move : undefined} onDone={close} />
        )}
      </div>
    )
  }

  const gear = entries.filter((e) => e.kind === 'gear')
  const moves = entries.filter((e) => e.kind === 'move')
  return (
    <div class="panel-scroll items-panel">
      <div class="sheet-row items-new">
        <Button
          size="sm"
          onClick={() => (editing.value = { kind: "gear", id: null })}
        >
          <IconAdd size={18} /> New gear
        </Button>
        <Button
          size="sm"
          onClick={() => (editing.value = { kind: "move", id: null })}
        >
          <IconAdd size={18} /> New move
        </Button>
      </div>
      {!entries.length && <p class="empty">No gear or moves yet.</p>}
      {gear.length > 0 && (
        <ListGroup label="Gear" count={gear.length} {...fold("gear")}>
          <List>
            {gear.map((e) =>
              e.kind === "gear" ? (
                <EntryRow
                  key={e.id}
                  Icon={entryIcon("item", e.item.icon)}
                  name={e.item.name}
                  meta={
                    [
                      e.item.weight ? `${e.item.weight} wt` : "",
                      e.item.uses ? `${e.item.uses} uses` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  tip={e.item.description}
                  onOpen={() => (editing.value = { kind: "gear", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ev, entity(campaign, "item", e.id, e.item.name))
                  }
                  menuItems={actionMenuItems(campaign, [
                    { id: `library:${e.id}`, title: e.item.name },
                  ])}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() => me && addItem(campaign, me.id, e.item)}
                  >
                    Add
                  </Button>
                </EntryRow>
              ) : null,
            )}
          </List>
        </ListGroup>
      )}
      {moves.length > 0 && (
        <ListGroup label="Moves" count={moves.length} {...fold("moves")}>
          <List>
            {moves.map((e) =>
              e.kind === "move" ? (
                <EntryRow
                  key={e.id}
                  Icon={entryIcon("move")}
                  name={e.move.name}
                  tag={rollTag(system, e.move)}
                  tip={`${e.move.text}\n\nDrag onto a character to teach it to them.`}
                  onOpen={() => (editing.value = { kind: "move", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ev, entity(campaign, "move", e.id, e.move.name))
                  }
                  menuItems={actionMenuItems(campaign, [
                    { id: `move:${e.id}`, title: e.move.name },
                  ])}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() => me && startMove(campaign, me.id, e.move)}
                  >
                    Make
                  </Button>
                </EntryRow>
              ) : null,
            )}
          </List>
        </ListGroup>
      )}
    </div>
  );
}

/** A text input bound to a signal. */
function Text({ label, value, multiline, placeholder }: { label: string; value: Signal<string>; multiline?: boolean; placeholder?: string }) {
  return (
    <label class="field">
      {label}
      {multiline ? (
        <textarea class="input bevel" rows={4} value={value.value} placeholder={placeholder} onInput={(e) => (value.value = e.currentTarget.value)} />
      ) : (
        <input class="input bevel" value={value.value} placeholder={placeholder} onInput={(e) => (value.value = e.currentTarget.value)} />
      )}
    </label>
  )
}

function NumberField({ label, value, min = 0 }: { label: string; value: Signal<number>; min?: number }) {
  return (
    <label class="field">
      {label}
      <input class="input bevel" type="number" min={min} value={value.value} onInput={(e) => (value.value = Number(e.currentTarget.value) || 0)} />
    </label>
  )
}

const splitTags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

/** An effect row in the gear form: a bonus to rolls with a stat, or a change to a derived value. */
type EffectRow = { type: 'rollBonus'; stat: string; value: number } | { type: 'modify'; path: string; value: number }

function GearForm({ campaign, system, initial, onDone }: { campaign: Campaign; system: GameSystem; initial?: ItemDef; onDone: () => void }) {
  const name = useSignal(initial?.name ?? '')
  const description = useSignal(initial?.description ?? '')
  const weight = useSignal(initial?.weight ?? 0)
  const uses = useSignal(initial?.uses ?? 0)
  const tags = useSignal((initial?.tags ?? []).join(', '))
  const equippable = useSignal(initial?.equippable ?? false)
  const icon = useSignal<string>(initial?.icon ?? '')
  const effects = useSignal<EffectRow[]>(
    (initial?.effects ?? []).flatMap((e): EffectRow[] =>
      e.type === 'rollBonus' ? [{ type: 'rollBonus', stat: e.stat ?? '', value: e.value }] : e.type === 'modify' && e.op === 'add' ? [{ type: 'modify', path: e.path, value: e.value }] : [],
    ),
  )
  const ready = !!name.value.trim()
  const save = () => {
    if (!ready) return
    const out: Effect[] = effects.value.map((e) =>
      e.type === 'rollBonus' ? { type: 'rollBonus', ...(e.stat ? { stat: e.stat } : {}), value: e.value } : { type: 'modify', path: e.path, op: 'add', value: e.value },
    )
    saveGear(campaign.homebrew, {
      id: initial?.id ?? '',
      name: name.value.trim(),
      description: description.value.trim(),
      weight: weight.value,
      ...(uses.value ? { uses: uses.value } : {}),
      tags: splitTags(tags.value),
      ...(out.length ? { effects: out } : {}),
      ...(equippable.value ? { equippable: true, active: 'equipped' as const } : {}),
      ...(icon.value ? { icon: icon.value } : {}),
    })
    onDone()
  }
  const setEffect = (i: number, patch: Partial<EffectRow>) => (effects.value = effects.value.map((e, j) => (j === i ? ({ ...e, ...patch } as EffectRow) : e)))

  return (
    <form
      class="creation-form homebrew-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <h3 class="sheet-heading">{initial ? 'Edit gear' : 'New gear'}</h3>
      <Text label="Name" value={name} />
      <Text label="Description" value={description} multiline />
      <div class="sheet-row">
        <NumberField label="Weight" value={weight} />
        <NumberField label="Uses" value={uses} />
      </div>
      <Text label="Tags" value={tags} placeholder="close, +1 armor" />
      <label class="stat-deb">
        <input type="checkbox" checked={equippable.value} onChange={() => (equippable.value = !equippable.value)} />
        Equippable
      </label>
      <label class="field">
        Icon
        <select class="input bevel" value={icon.value} onChange={(e) => (icon.value = e.currentTarget.value)}>
          <option value="">Default</option>
          {(Object.keys(ENTRY_ICONS) as EntryIconName[]).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <div class="field">
        Effects
        {effects.value.map((e, i) => (
          <div key={i} class="sheet-row homebrew-effect">
            <select
              class="input bevel"
              aria-label="Effect"
              value={e.type}
              onChange={(ev) => setEffect(i, ev.currentTarget.value === 'rollBonus' ? { type: 'rollBonus', stat: '' } : ({ type: 'modify', path: '' } as never))}
            >
              <option value="rollBonus">Bonus to rolls</option>
              <option value="modify">Add to a value</option>
            </select>
            {e.type === 'rollBonus' ? (
              <select class="input bevel" aria-label="With stat" value={e.stat} onChange={(ev) => setEffect(i, { stat: ev.currentTarget.value })}>
                <option value="">Every roll</option>
                {system.stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    with {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input class="input bevel" aria-label="Value name" placeholder="armor, ac, speed" value={e.path} onInput={(ev) => setEffect(i, { path: ev.currentTarget.value.trim() })} />
            )}
            <input class="input bevel homebrew-num" type="number" aria-label="Amount" value={e.value} onInput={(ev) => setEffect(i, { value: Number(ev.currentTarget.value) || 0 })} />
            <Button variant="icon" size="sm" label="Remove effect" onClick={() => (effects.value = effects.value.filter((_, j) => j !== i))}>
              <IconDelete />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => (effects.value = [...effects.value, { type: 'rollBonus', stat: '', value: 1 }])}>
          <IconAdd size={18} /> Add effect
        </Button>
      </div>
      <FormActions campaign={campaign} id={initial?.id} ready={ready} onDone={onDone} />
    </form>
  )
}

type RollKind = 'none' | 'stat' | 'ask'

function MoveForm({ campaign, system, initial, onDone }: { campaign: Campaign; system: GameSystem; initial?: ActionDef; onDone: () => void }) {
  const check = initial?.steps.find((s): s is CheckStep => s.kind === 'check')
  const name = useSignal(initial?.name ?? '')
  const category = useSignal(initial?.category ?? system.actionCategories[0]?.id ?? '')
  const trigger = useSignal(initial?.trigger ?? '')
  const text = useSignal(initial?.text ?? '')
  const rolls = useSignal<RollKind>(!check ? 'none' : check.ask?.kind === 'stat' ? 'ask' : 'stat')
  const stat = useSignal(check?.stat ?? system.stats[0]?.id ?? '')
  const outcomes = useSignal<Record<string, string>>(check?.outcomes ?? {})
  const targets = useSignal(initial?.target ? (initial.target.max === 1 ? 'one' : 'many') : 'none')
  const range = useSignal(initial?.target?.range?.normal ?? 0)
  const ready = !!name.value.trim()

  const save = () => {
    if (!ready) return
    const steps: CheckStep[] =
      rolls.value === 'none'
        ? []
        : [
            {
              kind: 'check',
              ...(rolls.value === 'stat' ? { stat: stat.value } : { ask: { kind: 'stat' as const } }),
              outcomes: Object.fromEntries(system.results.map((r) => [r.id, outcomes.value[r.id]?.trim() ?? ''])),
            },
          ]
    const target: TargetSpec | undefined =
      targets.value === 'none'
        ? undefined
        : {
            prompt: targets.value === 'one' ? 'Choose a target' : 'Choose targets',
            min: 1,
            ...(targets.value === 'one' ? { max: 1 } : {}),
            ...(range.value ? { range: { normal: range.value } } : {}),
          }
    saveMove(campaign.homebrew, {
      id: initial?.id ?? '',
      name: name.value.trim(),
      category: category.value,
      trigger: trigger.value.trim(),
      text: text.value.trim(),
      steps,
      ...(target ? { target } : {}),
      tags: ['homebrew'],
    })
    onDone()
  }

  return (
    <form
      class="creation-form homebrew-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <h3 class="sheet-heading">{initial ? 'Edit move' : 'New move'}</h3>
      <Text label="Name" value={name} />
      <label class="field">
        Kind
        <select class="input bevel" value={category.value} onChange={(e) => (category.value = e.currentTarget.value)}>
          {system.actionCategories.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <Text label="Trigger" value={trigger} placeholder="When you…" />
      <Text label="Text" value={text} multiline />
      <div class="field">
        Roll
        <Segmented
          label="Roll"
          value={rolls.value}
          options={[
            { id: 'none', label: 'No roll' },
            { id: 'stat', label: 'With a stat' },
            { id: 'ask', label: 'Stat chosen when made' },
          ]}
          onChange={(v) => (rolls.value = v)}
        />
        {rolls.value === 'stat' && (
          <select class="input bevel" aria-label="Stat" value={stat.value} onChange={(e) => (stat.value = e.currentTarget.value)}>
            {system.stats.map((s) => (
              <option key={s.id} value={s.id}>
                {system.baseRoll} + {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {rolls.value !== 'none' &&
        system.results.map((r) => (
          <label key={r.id} class="field">
            {r.label || 'Otherwise'}
            <textarea
              class="input bevel"
              rows={2}
              value={outcomes.value[r.id] ?? ''}
              onInput={(e) => (outcomes.value = { ...outcomes.value, [r.id]: e.currentTarget.value })}
            />
          </label>
        ))}
      <div class="field">
        Targets
        <Segmented
          label="Targets"
          value={targets.value}
          options={[
            { id: 'none', label: 'None' },
            { id: 'one', label: 'One' },
            { id: 'many', label: 'Any number' },
          ]}
          onChange={(v) => (targets.value = v)}
        />
        {targets.value !== 'none' && <NumberFieldInline label={`Range (${system.scene.unitName}, 0 for any)`} value={range} />}
      </div>
      <FormActions campaign={campaign} id={initial?.id} ready={ready} onDone={onDone} />
    </form>
  )
}

function NumberFieldInline({ label, value }: { label: string; value: Signal<number> }) {
  return (
    <label class="sheet-row">
      <input class="input bevel homebrew-num" type="number" min={0} value={value.value} onInput={(e) => (value.value = Number(e.currentTarget.value) || 0)} />
      <span class="muted">{label}</span>
    </label>
  )
}

function FormActions({ campaign, id, ready, onDone }: { campaign: Campaign; id?: string; ready: boolean; onDone: () => void }) {
  return (
    <div class="form-actions">
      {id && (
        <Button
          variant="danger"
          onClick={() => {
            deleteHomebrew(campaign.homebrew, id)
            onDone()
          }}
        >
          Delete
        </Button>
      )}
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={!ready}>
        Save
      </Button>
    </div>
  )
}
