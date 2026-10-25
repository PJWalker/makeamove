import { signal, useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { withTransition } from '../ui/transition'
import {
  bump,
  canEdit,
  createFolder,
  deleteFolder,
  listCharacters,
  listFolders,
  moveToFolder,
  newCharacter,
  newNpc,
  renameFolder,
  type FolderView,
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
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { BlobImage } from '../ui/BlobImage'
import { colourOf } from '../scene/presence'
import { TOKEN_STYLES } from '../scene/types'
import { menuTrigger } from '../ui/menuTrigger'
import { openPopup } from '../ui/popup'
import { IconAdd, IconBack, IconDelete, IconFolder, IconListHide, IconListShow, IconRemove, IconImage, IconRename } from '../ui/icons'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { dragToFolder } from './folderDrag'
import { tokenDrop } from './canvasState'
import { dragToken } from './tokenDrag'

// The list pane's width and whether it is tucked away (wide layout only).
const LIST_KEY = 'makeamove.charsList'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '{}') as { w?: number; hidden?: boolean }
  } catch {
    return {}
  }
})()
const listWidth = signal(saved.w ?? 200)
const listHidden = signal(saved.hidden ?? false)
export function CharacterListToggle() {
  const hidden = listHidden.value
  const label = hidden ? 'Show character list' : 'Hide character list'
  return (
    <button
      type="button"
      class="chars-toggle"
      aria-label={label}
      title={label}
      aria-pressed={!hidden}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        listHidden.value = !hidden
        saveList()
      }}
    >
      {hidden ? <IconListShow size={16} /> : <IconListHide size={16} />}
    </button>
  )
}

const saveList = () => localStorage.setItem(LIST_KEY, JSON.stringify({ w: listWidth.value, hidden: listHidden.value }))

function dragSplit(e: PointerEvent) {
  if (e.button !== 0) return
  const split = e.currentTarget as HTMLElement
  const grid = split.parentElement!
  split.setPointerCapture(e.pointerId)
  const left = grid.getBoundingClientRect().left
  const max = () => grid.clientWidth - 160
  const move = (ev: PointerEvent) => (listWidth.value = Math.round(Math.max(100, Math.min(max(), ev.clientX - left))))
  const up = () => {
    split.removeEventListener('pointermove', move)
    split.removeEventListener('pointerup', up)
    saveList()
  }
  split.addEventListener('pointermove', move)
  split.addEventListener('pointerup', up)
}

export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign)
  const characters = useY(campaign.characters, () => listCharacters(campaign))
  const folders = useY(campaign.characterFolders, () => listFolders(campaign))
  const selectedId = useY(campaign.members, () => selectedCharacterId(campaign))
  const isGm = useY(campaign.members, () => campaign.isGm())
  const creating = useSignal(false)
  const selected = characters.find((c) => c.id === selectedId)
  // In a narrow panel only one level shows at a time: the list or the sheet.
  const level = useSignal<'list' | 'sheet'>(selectedId ? 'sheet' : 'list')
  const go = (to: 'list' | 'sheet') => {
    if (level.value === to) return
    void withTransition(() => {
      level.value = to
    }, { rootClass: to === 'sheet' ? 'vt-chars-fwd' : 'vt-chars-back' })
  }
  const seen = useRef(selectedId)
  useEffect(() => {
    if (seen.current !== selectedId && selectedId) go('sheet')
    seen.current = selectedId
  }, [selectedId])

  return (
    <div class="chars">
      <div
        class="chars-grid"
        data-level={level.value}
        data-hidden={listHidden.value}
        style={{ '--list-w': `${listWidth.value}px` }}
      >
      <CharacterList
        campaign={campaign}
        system={system}
        characters={characters}
        folders={folders}
        selectedId={selectedId}
        onNew={() => {
          creating.value = true
          go('sheet')
        }}
        onPick={(id) => {
          creating.value = false
          go('sheet')
          selectCharacter(campaign, id)
        }}
      />
      <div
        class="chars-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize character list"
        onPointerDown={dragSplit}
        onDblClick={() => {
          listWidth.value = 200
          saveList()
        }}
      />
      <div class="chars-detail">
      <div class="chars-back">
        <button type="button" class="chars-back-btn chars-back-only" aria-label="Characters" onClick={() => {
            go('list')
            if (listHidden.value) {
              listHidden.value = false
              saveList()
            }
          }}>
          <IconBack />
        </button>
        <span class="chars-title">{creating.value ? 'New character' : (selected?.name ?? 'Characters')}</span>
      </div>
      <div class="chars-sheet panel-scroll sheet-panel">
        {creating.value ? (
          <NewCharacter campaign={campaign} system={system} folders={folders} isGm={isGm} onDone={() => (creating.value = false)} />
        ) : selected ? (
          selected.kind === 'npc' ? (
            <NpcSheet key={selected.id} campaign={campaign} system={system} c={selected} />
          ) : (
            <Sheet key={selected.id} campaign={campaign} system={system} c={selected} />
          )
        ) : (
          <p class="empty">Create a character, or pick one to see its sheet.</p>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}

/** The left pane: characters, filed in folders. Drag a character onto a folder to file it. */
function CharacterList({
  campaign,
  system,
  characters,
  folders,
  selectedId,
  onNew,
  onPick,
}: {
  campaign: Campaign
  system: GameSystem
  characters: CharacterView[]
  folders: FolderView[]
  selectedId: string | undefined
  onNew: () => void
  onPick: (id: string) => void
}) {
  // Folders the user has folded away (this device only).
  const folded = useSignal<Set<string>>(new Set())
  // A folder being named: its id, or 'new'.
  const naming = useSignal<string | null>(null)
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const known = new Set(folders.map((f) => f.id))
  const inFolder = (id: string) => characters.filter((c) => c.folder === id)
  const loose = characters.filter((c) => !c.folder || !known.has(c.folder))

  const toggle = (id: string) => {
    const next = new Set(folded.value)
    if (!next.delete(id)) next.add(id)
    folded.value = next
  }

  const row = (c: CharacterView) => {
    const mine = canEdit(campaign, c)
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = []
      if (mine) {
        for (const f of folders) {
          if (f.id !== c.folder) items.push({ label: `Move to ${f.name}`, Icon: IconFolder, onSelect: () => moveToFolder(campaign, c.id, f.id) })
        }
        if (c.folder && known.has(c.folder)) items.push({ label: 'Remove from folder', onSelect: () => moveToFolder(campaign, c.id, undefined) })
      }
      if (items.length) menu.value = { x, y, items }
    })
    return (
      <li key={c.id}>
        <button
          type="button"
          class="chars-row"
          data-selected={c.id === selectedId}
          data-kind={c.kind}
          title={c.kind === 'npc' ? `${c.name} (NPC)` : `${c.name} (${system.classes.find((k) => k.id === c.classId)?.name ?? c.classId})`}
          onClick={() => onPick(c.id)}
          onPointerDown={(e) => {
            trigger.onPointerDown(e)
            dragToFolder(
              e,
              mine ? (folder) => moveToFolder(campaign, c.id, folder) : null,
              (x, y) =>
                tokenDrop.value?.(x, y, { characterId: c.id, name: c.name, image: c.portrait, style: c.tokenStyle, colour: c.tokenColour }),
            )
          }}
          onContextMenu={trigger.onContextMenu}
        >
          <Avatar id={c.id} name={c.name} />
          <span class="chars-name">{c.name}</span>
          {c.kind === 'npc' && <span class="chars-tag">NPC</span>}
        </button>
      </li>
    )
  }

  const folderMenu = (f: FolderView) =>
    menuTrigger((x, y) => {
      menu.value = {
        x,
        y,
        items: [
          { label: 'Rename folder', Icon: IconRename, onSelect: () => (naming.value = f.id) },
          { label: 'Delete folder', Icon: IconDelete, danger: true, onSelect: () => deleteFolder(campaign, f.id) },
        ],
      }
    })

  return (
    <nav class="chars-list" aria-label="Characters">
      <div class="chars-actions">
        <Button size="sm" onClick={onNew}>
          New
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (naming.value = 'new')}>
          New folder
        </Button>
      </div>
      <div class="chars-tree panel-scroll" data-folder-drop="">
        {naming.value === 'new' && (
          <FolderName
            onDone={(name) => {
              if (name) createFolder(campaign, name)
              naming.value = null
            }}
          />
        )}
        {folders.map((f) => {
          const kids = inFolder(f.id)
          const open = !folded.value.has(f.id)
          const trigger = folderMenu(f)
          return (
            <section key={f.id} class="chars-folder" data-folder-drop={f.id} data-open={open}>
              {naming.value === f.id ? (
                <FolderName
                  initial={f.name}
                  onDone={(name) => {
                    if (name) renameFolder(campaign, f.id, name)
                    naming.value = null
                  }}
                />
              ) : (
                <button
                  type="button"
                  class="chars-folder-head"
                  aria-expanded={open}
                  onClick={() => toggle(f.id)}
                  onPointerDown={trigger.onPointerDown}
                  onContextMenu={trigger.onContextMenu}
                >
                  <IconFolder size={16} />
                  <span class="chars-name">{f.name}</span>
                  <span class="muted">{kids.length}</span>
                </button>
              )}
              {open && <ul class="chars-rows">{kids.map(row)}</ul>}
            </section>
          )
        })}
        <ul class="chars-rows">{loose.map(row)}</ul>
        {!characters.length && !folders.length && <p class="muted chars-empty">No characters yet.</p>}
      </div>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </nav>
  )
}

function FolderName({ initial = '', onDone }: { initial?: string; onDone: (name: string | null) => void }) {
  return (
    <input
      class="input bevel chars-folder-input"
      aria-label="Folder name"
      placeholder="Folder name"
      value={initial}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = ''
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function NewCharacter({
  campaign,
  system,
  folders,
  isGm,
  onDone,
}: {
  campaign: Campaign
  system: GameSystem
  folders: FolderView[]
  isGm: boolean
  onDone: () => void
}) {
  const kind = useSignal<'pc' | 'npc'>('pc')
  const name = useSignal('')
  const classId = useSignal(system.classes[0].id)
  const folder = useSignal('')
  const submit = () => {
    if (kind.value === 'npc') newNpc(campaign, name.value, folder.value || undefined)
    else {
      const id = newCharacter(campaign, name.value, classId.value)
      if (folder.value) moveToFolder(campaign, id, folder.value)
    }
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
      {isGm && (
        <div class="field">
          Type
          <Segmented
            label="Character type"
            value={kind.value}
            options={[
              { id: 'pc', label: 'Player character' },
              { id: 'npc', label: 'NPC' },
            ]}
            onChange={(v) => (kind.value = v)}
          />
        </div>
      )}
      <label class="field">
        Name
        <input class="input bevel" value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} autofocus />
      </label>
      {kind.value === 'pc' && (
        <>
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
        </>
      )}
      {folders.length > 0 && (
        <label class="field">
          Folder
          <select class="input bevel" value={folder.value} onChange={(e) => (folder.value = e.currentTarget.value)}>
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
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

/** A non-player character: HP and the fields the game system lists for NPCs. */
function NpcSheet({ campaign, system, c }: { campaign: Campaign; system: GameSystem; c: CharacterView }) {
  const editable = canEdit(campaign, c)
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value)
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
        <Counter label="HP" value={c.hp} max={c.maxHp} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'hp', by, c.maxHp)} />
        <label class="counter">
          <span class="eyebrow">Max HP</span>
          <input
            class="input bevel stat-score"
            type="number"
            min={1}
            value={c.maxHp}
            disabled={!editable}
            onChange={(e) => {
              const n = Math.floor(Number(e.currentTarget.value))
              if (n >= 1) set('maxHp', n)
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
              onChange={(e) => set(`npc:${f.id}`, e.currentTarget.value)}
            />
          ) : (
            <input
              class="input bevel"
              type={f.type === 'number' ? 'number' : 'text'}
              value={c.fields[f.id]}
              disabled={!editable}
              onChange={(e) => set(`npc:${f.id}`, f.type === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)}
            />
          )}
        </label>
      ))}
      <label class="field">
        Notes
        <textarea class="input bevel" rows={4} value={c.notes} disabled={!editable} onChange={(e) => set('notes', e.currentTarget.value)} />
      </label>
    </div>
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
        <Button variant="icon" className="counter-btn" label={`Decrease ${label}`} disabled={disabled} onClick={() => onChange(-1)}>
          <IconRemove size={18} />
        </Button>
        <output class="counter-value">
          {value}
          {max !== undefined && <span class="muted">/{max}</span>}
        </output>
        <Button variant="icon" className="counter-btn" label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(1)}>
          <IconAdd size={18} />
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
          {d.cls.name}, level {c.level}
        </span>
        </div>
      </header>

      <section class="sheet-section" aria-label="Vitals">
        <div class="sheet-vitals">
          <Counter label="HP" value={c.hp} max={d.maxHp} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'hp', by, d.maxHp)} />
          <Counter label="XP" value={c.xp} max={d.xpNeeded} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'xp', by)} />
          <Counter label="Level" value={c.level} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'level', by)} />
          <Counter label="Coin" value={c.coin} disabled={!editable} onChange={(by) => bump(campaign, c.id, 'coin', by)} />
        </div>
      </section>

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

      <dl class="sheet-derived" aria-label="Combat">
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

      <section class="sheet-section" aria-label="Stats">
        <h3 class="sheet-heading">Stats <span class="muted">· click a modifier to roll</span></h3>
        <ul class="sheet-stats">
          {system.stats.map((s) => {
            const deb = system.debilities.find((x) => x.stat === s.id)
            const hit = deb && c.debilities.includes(deb.id)
            return (
              <li key={s.id} data-debilitated={!!hit}>
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
                  {signedStr(d.mods[s.id] + (hit ? -1 : 0))}
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
                      if (n >= 1 && n <= 20) set(`score:${s.id}`, n)
                    }}
                  />
                </label>
                {deb && (
                  <label class="stat-deb">
                    <input type="checkbox" checked={!!hit} disabled={!editable} onChange={() => toggleDebility(deb.id)} />
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
        <Counter label="Forward" value={c.forward} disabled={!editable} onChange={(by) => set('forward', c.forward + by)} />
        <Counter label="Ongoing" value={c.ongoing} disabled={!editable} onChange={(by) => set('ongoing', c.ongoing + by)} />
      </div>
      </section>

      <section class="sheet-section" aria-label="Moves">
        <h3 class="sheet-heading">Moves</h3>
        <ul class="move-list">
          {moves.map((m) => (
            <MoveRow key={m.id} move={m} onMake={() => make(m)} />
          ))}
        </ul>
      </section>

      <section class="sheet-section" aria-label="Bonds and notes">
        <h3 class="sheet-heading">Bonds &amp; notes</h3>
        <label class="field">
          Bonds
          <textarea class="input bevel" rows={3} value={c.bonds} disabled={!editable} onChange={(e) => set('bonds', e.currentTarget.value)} />
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
