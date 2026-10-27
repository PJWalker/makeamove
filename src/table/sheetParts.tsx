import { useSignal } from '@preact/signals'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { setField, setPortrait } from '../characters/api'
import { checkOf } from '../characters/moves'
import type { CharacterView } from '../characters/store'
import { colourOf } from '../scene/presence'
import { TOKEN_STYLES } from '../scene/types'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import type { ActionDef, GameSystem } from '../systems/types'
import { BlobImage } from '../ui/BlobImage'
import { Button } from '../ui/Button'
import { entryIcon } from '../ui/entryIcons'
import { IconAdd, IconDelete, IconImage, IconPost, IconRemove, IconRename, IconRoll, IconTarget } from '../ui/icons'
import { List, Tag } from '../ui/List'
import { menuTrigger } from '../ui/menuTrigger'
import { openPopup } from '../ui/popup'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { EntryRow, EntryWindow, rollTag, useEntryWindows } from './EntryWindow'
import { dragToken } from './tokenDrag'

/*
 * Pieces every system's sheet can use: counters, the action list, and the
 * character's token. A system's sheet (systems/<id>/Sheet.tsx) puts them
 * together with its own fields.
 */

export function Counter({
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
    <div
      class="counter"
      role="group"
      aria-label={label}
      data-label={label}
      data-fill={max !== undefined}
      style={max !== undefined ? { '--fill': `${Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100}%` } : undefined}
    >
      <span class="eyebrow">{label}</span>
      <div class="counter-row">
        <Button variant="secondary" class="counter-btn" label={`Decrease ${label}`} disabled={disabled} onClick={() => onChange(-1)}>
          <IconRemove size={18} />
        </Button>
        <output class="counter-value">
          {value}
          {max !== undefined && <span class="muted">/{max}</span>}
        </output>
        <Button variant="secondary" class="counter-btn" label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(1)}>
          <IconAdd size={18} />
        </Button>
      </div>
    </div>
  )
}

/** A signed number as the sheet shows it: +2, −1. */
export const signedStr = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)


/**
 * Moves as a filterable list: one row each, with the move's rules in a
 * tooltip beside the row. Clicking a move turns its tooltip into a window
 * that stays open, to read and make the move from.
 */
export function MoveList({ system, moves, onMake }: { system: GameSystem; moves: ActionDef[]; onMake: (m: ActionDef) => void }) {
  // The system's groupings that this character has any of, in the system's order; the first is shown to start.
  const categories = system.actionCategories.filter((k) => moves.some((m) => m.category === k.id))
  const filter = useSignal<string>(categories[0]?.id ?? 'all')
  const windows = useEntryWindows()
  const shown = filter.value === 'all' ? moves : moves.filter((m) => m.category === filter.value)

  return (
    <div class="moves">
      {categories.length > 1 && (
        <Segmented
          label="Move type"
          value={filter.value}
          options={[{ id: 'all', label: 'All' }, ...categories]}
          onChange={(k) => (filter.value = k)}
        />
      )}
      <List>
        {shown.map((m) => (
          <EntryRow
            key={m.id}
            name={m.name}
            Icon={entryIcon('move', m.category === 'class' ? 'class-move' : undefined)}
            tag={rollTag(system, m)}
            tip={m.text}
            onOpen={(row) => windows.show(`move:${m.id}`, row)}
          >
            <MakeButton m={m} onMake={onMake} />
          </EntryRow>
        ))}
      </List>
      {windows.keys.map((key) => {
        const m = moves.find((k) => `move:${k.id}` === key)
        if (!m) return null
        const tag = rollTag(system, m)
        return (
          <EntryWindow key={key} entryKey={key} title={m.name} text={m.text} onClose={() => windows.close(key)}>
            {tag && <Tag>{tag}</Tag>}
            <MakeButton m={m} onMake={onMake} big />
          </EntryWindow>
        )
      })}
    </div>
  )
}

/** The character's stand-in token: drag it onto the map, click it to change its image. */
export function TokenChip({ campaign, c, editable }: { campaign: Campaign; c: CharacterView; editable: boolean }) {
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

function TokenSettings({ campaign, c, onClose }: { campaign: Campaign; c: CharacterView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const style = c.tokenStyle ?? 'disc'
  const colour = c.tokenColour ?? colourOf(device.value)
  useLayoutEffect(() => openPopup(ref.current), [])
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

/** What using an action does first: pick targets, roll, or just post it. */
export function makeVerb(m: ActionDef) {
  return m.target
    ? { label: 'Target', Icon: IconTarget }
    : checkOf(m)
      ? { label: 'Roll', Icon: IconRoll }
      : { label: 'Post', Icon: IconPost }
}

/** The button that uses an action: an icon in a list row, or labelled in its window. */
function MakeButton({ m, onMake, big }: { m: ActionDef; onMake: (m: ActionDef) => void; big?: boolean }) {
  const { label, Icon } = makeVerb(m)
  if (big) {
    return (
      <Button variant="primary" onClick={() => onMake(m)}>
        <Icon size={18} /> {label}
      </Button>
    )
  }
  return (
    <Button size="sm" variant="ghost" class="move-make" label={`${label}: ${m.name}`} aria-label={`${label}: ${m.name}`} onClick={() => onMake(m)}>
      <Icon size={19} />
    </Button>
  )
}
