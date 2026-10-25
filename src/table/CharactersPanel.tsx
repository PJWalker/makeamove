import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import {
  bump,
  canEdit,
  listCharacters,
  newCharacter,
  selectCharacter,
  selectedCharacterId,
  setField,
  setPortrait,
  startMove,
  systemOf,
} from '../characters/api'
import { derive, movesFor, type CharacterView } from '../characters/store'
import { postRoll } from '../chat/send'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import type { GameSystem, MoveDef } from '../systems/types'
import { Button } from '../ui/Button'
import { BlobImage } from '../ui/BlobImage'
import { colourOf } from '../scene/presence'
import { TOKEN_STYLES } from '../scene/types'
import { menuTrigger } from '../ui/menuTrigger'
import { openPopup } from '../ui/popup'
import { IconImage, IconRename, IconDelete } from '../ui/icons'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { dragToken } from './tokenDrag'

export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign)
  const characters = useY(campaign.characters, () => listCharacters(campaign))
  const selectedId = useY(campaign.members, () => selectedCharacterId(campaign))
  const creating = useSignal(false)
  const selected = characters.find((c) => c.id === selectedId)

  return (
    <div class="panel-scroll sheet-panel">
      <div class="sheet-picker">
        <select
          class="input bevel"
          aria-label="Character"
          value={selectedId ?? ''}
          onChange={(e) => selectCharacter(campaign, e.currentTarget.value || undefined)}
        >
          <option value="">{characters.length ? 'Choose a character…' : 'No characters yet'}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({system.classes.find((k) => k.id === c.classId)?.name ?? c.classId})
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => (creating.value = !creating.value)}>
          New
        </Button>
      </div>
      {creating.value && <NewCharacter campaign={campaign} system={system} onDone={() => (creating.value = false)} />}
      {selected ? (
        <Sheet campaign={campaign} system={system} c={selected} />
      ) : (
        !creating.value && <p class="empty">Create a character, or pick one to see its sheet.</p>
      )}
    </div>
  )
}

function NewCharacter({ campaign, system, onDone }: { campaign: Campaign; system: GameSystem; onDone: () => void }) {
  const name = useSignal('')
  const classId = useSignal(system.classes[0].id)
  const submit = () => {
    newCharacter(campaign, name.value, classId.value)
    onDone()
  }
  const cls = system.classes.find((k) => k.id === classId.value)
  return (
    <form
      class="sheet-new"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label class="field">
        Name
        <input class="input bevel" value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} autofocus />
      </label>
      <label class="field">
        Class
        <select class="input bevel" value={classId.value} onChange={(e) => (classId.value = e.currentTarget.value)}>
          {system.classes.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      {cls && <p class="muted">{cls.blurb}</p>}
      <div class="sheet-row">
        <Button variant="primary" size="sm" type="submit">
          Create
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Counter({
  label,
  value,
  max,
  onChange,
  disabled,
}: {
  label: string
  value: number
  max?: number
  onChange: (by: number) => void
  disabled: boolean
}) {
  return (
    <div class="counter" role="group" aria-label={label}>
      <span class="eyebrow">{label}</span>
      <div class="counter-row">
        <Button variant="icon" size="sm" label={`Decrease ${label}`} disabled={disabled} onClick={() => onChange(-1)}>
          −
        </Button>
        <output class="counter-value">
          {value}
          {max !== undefined && <span class="muted">/{max}</span>}
        </output>
        <Button variant="icon" size="sm" label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(1)}>
          +
        </Button>
      </div>
    </div>
  )
}

const signedStr = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

function Sheet({ campaign, system, c }: { campaign: Campaign; system: GameSystem; c: CharacterView }) {
  const d = derive(c, system)
  const editable = canEdit(campaign, c)
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
  const toggleDebility = (id: string) =>
    set('debilities', c.debilities.includes(id) ? c.debilities.filter((x) => x !== id) : [...c.debilities, id])
  const moves = movesFor(c, system, d)
  const make = (m: MoveDef) => startMove(campaign, c.id, m)
  const rollStat = (statId: string, abbr: string) => {
    const deb = system.debilities.find((x) => x.stat === statId && c.debilities.includes(x.id))
    const mod = d.mods[statId] + (deb ? -1 : 0)
    postRoll(campaign, `${system.baseRoll}${mod ? `${mod < 0 ? '-' : '+'}${Math.abs(mod)}` : ''}[${abbr}]`, 'public', abbr)
  }

  return (
    <div class="sheet">
      <TokenChip campaign={campaign} c={c} editable={editable} />

      <header class="sheet-head">
        <input
          class="input bevel sheet-name"
          aria-label="Name"
          value={c.name}
          disabled={!editable}
          onChange={(e) => e.currentTarget.value.trim() && set('name', e.currentTarget.value.trim())}
        />
        <span class="muted">
          {d.cls.name}, level {c.level}
        </span>
      </header>

      <div class="sheet-vitals">
        <Counter label="HP" value={c.hp} max={d.maxHp} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'hp', by, d.maxHp)} />
        <Counter label="XP" value={c.xp} max={d.xpNeeded} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'xp', by)} />
        <Counter label="Level" value={c.level} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'level', by)} />
        <Counter label="Coin" value={c.coin} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'coin', by)} />
      </div>

      {editable && c.xp >= d.xpNeeded && (
        <div class="sheet-levelup">
          <span>Ready to level up.</span>
          <Button
            size="sm"
            onClick={() => {
              set('level', c.level + 1)
              set('xp', c.xp - d.xpNeeded)
            }}
          >
            Level up
          </Button>
        </div>
      )}

      <dl class="sheet-derived">
        <div title={d.resolved.why.armor?.join('\n')}>
          <dt>Armor</dt>
          <dd>{d.armor}</dd>
        </div>
        <div title={d.resolved.why.damage?.join('\n')}>
          <dt>Damage</dt>
          <dd>
            d{d.damage}
            {d.damageBonus ? signedStr(d.damageBonus) : ''}
          </dd>
        </div>
        <div data-over={d.load > d.maxLoad}>
          <dt>Load</dt>
          <dd>
            {d.load}/{d.maxLoad}
          </dd>
        </div>
      </dl>

      <section aria-label="Stats">
        <h3 class="eyebrow">Stats</h3>
        <ul class="sheet-stats">
          {system.stats.map((s) => {
            const deb = system.debilities.find((x) => x.stat === s.id)
            const hit = deb && c.debilities.includes(deb.id)
            return (
              <li key={s.id} data-debilitated={!!hit}>
                <span class="stat-abbr">{s.abbr}</span>
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
                    if (n >= 1 && n <= 20) set(`score:${s.id}`, n)
                  }}
                />
                <button
                  type="button"
                  class="stat-mod bevel"
                  title={`Roll +${s.name}`}
                  onClick={() => rollStat(s.id, s.abbr)}
                >
                  {signedStr(d.mods[s.id] + (hit ? -1 : 0))}
                </button>
                {deb && (
                  <label class="stat-deb">
                    <input
                      type="checkbox"
                      checked={!!hit}
                      disabled={!editable}
                      onChange={() => toggleDebility(deb.id)}
                    />
                    {deb.name}
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <div class="sheet-vitals">
        <Counter label="Forward" value={c.forward} disabled={!editable} onChange={(by) => set('forward', c.forward + by)} />
        <Counter label="Ongoing" value={c.ongoing} disabled={!editable} onChange={(by) => set('ongoing', c.ongoing + by)} />
      </div>

      <section aria-label="Moves">
        <h3 class="eyebrow">Moves</h3>
        <ul class="move-list">
          {moves.map((m) => (
            <MoveRow key={m.id} move={m} onMake={() => make(m)} />
          ))}
        </ul>
      </section>

      <label class="field">
        Bonds
        <textarea
          class="input bevel"
          rows={3}
          value={c.bonds}
          disabled={!editable}
          onChange={(e) => set('bonds', e.currentTarget.value)}
        />
      </label>
      <label class="field">
        Notes
        <textarea
          class="input bevel"
          rows={3}
          value={c.notes}
          disabled={!editable}
          onChange={(e) => set('notes', e.currentTarget.value)}
        />
      </label>
      <p class="muted sheet-owner">{c.owner === device.value.id ? 'Yours' : editable ? 'Editing as GM' : 'View only'}</p>
    </div>
  )
}

function MoveRow({ move, onMake }: { move: MoveDef; onMake: () => void }) {
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <li class="move-row">
      <details ref={ref}>
        <summary>
          <span class="move-name">{move.name}</span>
          <span class="muted move-cat">{move.category === 'class' ? '' : move.category}</span>
        </summary>
        <p class="move-text">{move.text}</p>
      </details>
      <Button size="sm" onClick={onMake}>
        {move.roll ? 'Roll' : 'Post'}
      </Button>
    </li>
  )
}

/** The character's stand-in token: drag it onto the map, click it to change its image. */
function TokenChip({ campaign, c, editable }: { campaign: Campaign; c: CharacterView; editable: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const menu = useSignal<{ x: number; y: number } | null>(null)
  const settings = useSignal(false)
  const initial = (c.name.trim()[0] ?? '?').toUpperCase()
  const pick = () => fileRef.current?.click()
  const trigger = menuTrigger((x, y) => (menu.value = { x, y }))
  const items: MenuItem[] = [
    ...(editable
      ? [
          { label: c.portrait ? 'Change image…' : 'Choose image…', Icon: IconImage, onSelect: pick },
          ...(c.portrait ? [{ label: 'Remove image', Icon: IconDelete, onSelect: () => setField(campaign, c.id, 'portrait', undefined) }] : []),
          'divider' as const,
          { label: 'Token settings…', Icon: IconRename, onSelect: () => (settings.value = true) },
        ]
      : []),
  ]
  return (
    <div class="sheet-portrait">
      <div
        class="token-chip"
        role="button"
        tabIndex={0}
        title={editable ? 'Click to change the image; drag onto the map to place a token' : 'Drag onto the map to place a token'}
        data-style={c.tokenStyle ?? 'disc'}
        style={{ '--token-colour': c.tokenColour ?? '' }}
        onPointerDown={(e) => {
          trigger.onPointerDown(e)
          dragToken(e, { characterId: c.id, name: c.name, image: c.portrait, style: c.tokenStyle, colour: c.tokenColour })
        }}
        onContextMenu={trigger.onContextMenu}
        onClick={() => editable && pick()}
        onKeyDown={(e) => editable && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
      >
        <BlobImage image={c.portrait} fallback={<span class="portrait-initial">{initial}</span>} />
      </div>
      <span class="muted">Drag onto the map</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file) void setPortrait(campaign, c.id, file)
        }}
      />
      {menu.value && items.length > 0 && <ContextMenu {...menu.value} items={items} onClose={() => (menu.value = null)} />}
      {settings.value && <TokenSettings campaign={campaign} c={c} onClose={() => (settings.value = false)} />}
    </div>
  )
}

/** How this character's token looks when placed on a map. */
function TokenSettings({ campaign, c, onClose }: { campaign: Campaign; c: CharacterView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const style = c.tokenStyle ?? 'disc'
  const colour = c.tokenColour ?? colourOf(device.value)
  useEffect(() => openPopup(ref.current), [])
  return (
    <Dialog dialogRef={ref} title="Token settings" onClose={onClose}>
      <div class="field">
        Style
        <Segmented
          label="Token style"
          value={style}
          options={TOKEN_STYLES.map((s) => ({
            ...s,
            disabled: s.id === 'plain' && !c.portrait,
            title: s.id === 'plain' && !c.portrait ? 'Needs an image' : undefined,
          }))}
          onChange={(v) => setField(campaign, c.id, 'tokenStyle', v)}
        />
      </div>
      <label class="field colour-field" data-disabled={style === 'plain'}>
        Background and border
        <span class="colour-row">
          <input
            type="color"
            class="colour-input bevel"
            value={colour}
            disabled={style === 'plain'}
            onInput={(e) => setField(campaign, c.id, 'tokenColour', e.currentTarget.value)}
          />
          <span class="colour-hex">{colour}</span>
        </span>
      </label>
      <p class="muted">Applies to tokens placed from now on. Change a token already on the map from its own options.</p>
    </Dialog>
  )
}
