import { signal, useSignal } from '@preact/signals'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { actionForCombo, comboOf, setShortcut, setSlotLook, shortcuts, showCombo, slotLook } from '../actions/custom'
import { findAction } from '../actions/registry'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { ENTRY_ICONS, type EntryIconName } from '../ui/entryIcons'
import { openPopup } from '../ui/popup'
import { Dialog } from './CampaignDialogs'

/*
 * Pop-ups for a player's own touches on an action (actions/custom.ts):
 * renaming a hotbar slot, giving it an icon, and binding a shortcut. The
 * hotbar's and the palette's menus open them.
 */

type Kind = 'rename' | 'icon' | 'shortcut'

const request = signal<{ n: number; kind: Kind; id: string; title: string } | null>(null)
let requests = 0

export function editAction(kind: Kind, id: string, title: string) {
  request.value = { n: ++requests, kind, id, title }
}

/** The recorder's class: global shortcuts stand aside while it has focus. */
export const RECORDER = 'shortcut-recorder'

export function ActionDialogs({ campaign }: { campaign: Campaign }) {
  const req = request.value
  if (!req) return null
  // A new pop-up for each request, opened as it mounts so the menu item's morph catches it.
  const props = { key: req.n, campaign, id: req.id, title: req.title }
  if (req.kind === 'rename') return <RenameDialog {...props} />
  if (req.kind === 'icon') return <IconDialog {...props} />
  return <ShortcutDialog {...props} />
}

interface Props {
  campaign: Campaign
  id: string
  title: string
}

function usePopup() {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => openPopup(ref.current), [])
  return { ref, close: () => ref.current?.close(), onClose: () => (request.value = null) }
}

function RenameDialog({ campaign, id, title }: Props) {
  const { ref, close, onClose } = usePopup()
  const custom = slotLook(campaign, id).label
  const text = useSignal(custom ?? title)
  const done = (label: string | undefined) => {
    setSlotLook(campaign, id, { label: label?.trim() || undefined })
    close()
  }
  return (
    <Dialog dialogRef={ref} title="Rename" onClose={onClose}>
      <form
        class="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          done(text.value)
        }}
      >
        <label class="field">
          Show on the hotbar as
          <input
            class="input bevel"
            value={text.value}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => (text.value = e.currentTarget.value)}
          />
        </label>
        <div class="form-actions">
          {custom && (
            <Button variant="ghost" onClick={() => done(undefined)}>
              Use its own name
            </Button>
          )}
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Each icon once: some names share one (fighter and longsword). */
const CHOICES = (Object.keys(ENTRY_ICONS) as EntryIconName[]).filter(
  (name, i, all) => all.findIndex((n) => ENTRY_ICONS[n] === ENTRY_ICONS[name]) === i,
)

function IconDialog({ campaign, id, title }: Props) {
  const { ref, close, onClose } = usePopup()
  const current = slotLook(campaign, id).icon
  const choose = (icon: EntryIconName | undefined) => {
    setSlotLook(campaign, id, { icon })
    close()
  }
  return (
    <Dialog dialogRef={ref} title={`Icon for ${slotLook(campaign, id).label ?? title}`} onClose={onClose}>
      <div class="dialog-form">
        <div class="icon-choices" role="listbox" aria-label="Icons">
          {CHOICES.map((name) => {
            const Icon = ENTRY_ICONS[name]
            return (
              <button
                key={name}
                type="button"
                role="option"
                class="icon-choice btn btn-ghost bevel"
                aria-selected={name === current}
                aria-label={name.replace('-', ' ')}
                data-tip={name.replace('-', ' ')}
                onClick={() => choose(name)}
              >
                <Icon size={24} />
              </button>
            )
          })}
        </div>
        <div class="form-actions">
          <Button variant="ghost" disabled={!current} onClick={() => choose(undefined)}>
            Use its own icon
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ShortcutDialog({ campaign, id, title }: Props) {
  const { ref, close, onClose } = usePopup()
  const existing = shortcuts(campaign)[id] ?? null
  const combo = useSignal<string | null>(existing)
  const other = combo.value ? actionForCombo(shortcuts(campaign), combo.value) : undefined
  const taken =
    other && other !== id ? (slotLook(campaign, other).label ?? findAction(campaign, other)?.title ?? 'another action') : null
  const save = (value: string | null) => {
    setShortcut(campaign, id, value)
    close()
  }
  return (
    <Dialog dialogRef={ref} title={`Shortcut for ${title}`} onClose={onClose}>
      <form
        class="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          save(combo.value)
        }}
      >
        <label class="field">
          Press the keys to use
          <input
            class={`input bevel ${RECORDER}`}
            readOnly
            autoFocus
            placeholder="Press a key…"
            value={combo.value ? showCombo(combo.value) : ''}
            onKeyDown={(e) => {
              // Escape closes and Tab moves on, as everywhere else; Enter saves.
              if (e.key === 'Escape' || e.key === 'Enter' || (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey)) return
              e.preventDefault()
              e.stopPropagation()
              if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                combo.value = null
                return
              }
              const next = comboOf(e)
              if (next) combo.value = next
            }}
          />
        </label>
        <p class="muted" role="status">
          {taken ? `Now on ${taken}. Saving moves it here.` : 'Backspace clears it.'}
        </p>
        <div class="form-actions">
          {existing && (
            <Button variant="ghost" onClick={() => save(null)}>
              Remove shortcut
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={combo.value === existing}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
