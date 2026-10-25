import { signal, useSignal } from '@preact/signals'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { noteRecent, recentActions } from '../actions/recent'
import { buildIndex } from '../actions/registry'
import { rank } from '../actions/search'
import type { Action } from '../actions/types'
import { editHotbar, insertAt, isPinned, pin, unpin } from '../characters/hotbar'
import { IconAdd } from '../ui/icons'
import { dragToHotbar } from './hotbarDrop'
import { menuTrigger } from '../ui/menuTrigger'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { Campaign } from '../store/campaign'
import { nextZ } from '../ui/windows'

export const paletteOpen = signal(false)

const HINTS = [
  ['>', 'commands'],
  ['/', 'moves'],
  ['@', 'characters'],
  ['#', 'notes, items'],
  ['Alt+Enter', 'pin to hotbar'],
  ['Right-click', 'more'],
]

export function Palette({ campaign }: { campaign: Campaign }) {
  const open = paletteOpen.value

  // Ctrl/Cmd + K toggles, even from a text field, as in most apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        paletteOpen.value = !paletteOpen.value
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return open ? <PaletteBody campaign={campaign} /> : null
}

function PaletteBody({ campaign }: { campaign: Campaign }) {
  const query = useSignal('')
  const cursor = useSignal(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // The index is built once per opening, from whatever is current then.
  const index = useMemo(() => buildIndex(campaign), [campaign])
  const results = rank(index, query.value, { recent: recentActions.value })
  const active = Math.min(cursor.value, Math.max(0, results.length - 1))
  const returnTo = useRef<Element | null>(document.activeElement)
  const z = useMemo(() => nextZ(), [])
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const note = useSignal('')

  function togglePin(a: Action) {
    const pinned = isPinned(campaign, a.id)
    if (editHotbar(campaign, (slots) => (pinned ? unpin(slots, a.id) : pin(slots, a.id)))) {
      note.value = pinned ? `Removed ${a.title} from the hotbar` : `Added ${a.title} to the hotbar`
    }
  }

  /** Right-click for a menu; press and drag to pin the action onto the hotbar. */
  function rowTriggers(a: Action, i: number) {
    const trigger = menuTrigger((x, y) => {
      cursor.value = i
      const pinned = isPinned(campaign, a.id)
      menu.value = {
        x,
        y,
        items: [
          { label: pinned ? 'Remove from hotbar' : 'Add to hotbar', Icon: IconAdd, shortcut: 'Alt+Enter', onSelect: () => togglePin(a) },
          ...(a.available === true ? [{ label: 'Run', onSelect: () => choose(a) }] : []),
        ],
      }
    })
    return {
      onContextMenu: trigger.onContextMenu,
      onPointerDown(e: PointerEvent) {
        trigger.onPointerDown(e)
        dragToHotbar(e, (index) => {
          if (editHotbar(campaign, (slots) => insertAt(slots, a.id, index))) note.value = `Added ${a.title} to the hotbar`
        })
      },
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
    const target = returnTo.current
    return () => {
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [])

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, results.length])

  // A press outside closes it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (!rootRef.current?.contains(t) && !t.closest?.('.context-menu, .hotbar-palette')) paletteOpen.value = false
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])

  function choose(a: Action | undefined, secondary = false) {
    if (!a || a.available !== true) return
    const fn = secondary ? a.open : a.run
    if (!fn) return
    paletteOpen.value = false
    noteRecent(a.id)
    // After the palette has closed and given focus back.
    queueMicrotask(fn)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menu.value) return
    if (e.key === 'Escape') {
      e.preventDefault()
      paletteOpen.value = false
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = results.length
      if (n) cursor.value = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      const a = results[active]
      if (a) togglePin(a)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active], e.shiftKey)
    }
  }

  const empty = !query.value
  return (
    <div class="palette panel bevel" role="dialog" aria-label="Command palette" ref={rootRef} onKeyDown={onKeyDown} style={{ zIndex: z }}>
      <input
        ref={inputRef}
        class="palette-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={results[active] ? `palette-${active}` : undefined}
        aria-label="Search actions"
        placeholder="Search moves, tools, scenes and commands…"
        autocomplete="off"
        spellcheck={false}
        value={query.value}
        onInput={(e) => {
          query.value = e.currentTarget.value
          cursor.value = 0
        }}
      />
      <ul id="palette-list" class="palette-list" role="listbox" ref={listRef}>
        {results.map((a, i) => {
          const off = a.available !== true
          return (
            <li
              key={a.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={off}
              data-active={i === active}
              data-unavailable={off}
              onPointerMove={() => cursor.value !== i && (cursor.value = i)}
              onClick={() => choose(a)}
              {...rowTriggers(a, i)}
            >
              <span class="palette-icon">{a.icon && <a.icon size={18} />}</span>
              <span class="palette-text">
                <span class="palette-title">{a.title}</span>
                <span class="palette-detail">{off ? a.available : (a.detail ?? a.source)}</span>
              </span>
              {a.hint && <kbd>{a.hint}</kbd>}
            </li>
          )
        })}
        {!results.length && (
          <li class="palette-empty" role="presentation">
            {empty ? 'Nothing recent yet. Start typing.' : 'No matches.'}
          </li>
        )}
      </ul>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
      <p class="palette-note" role="status">
        {note.value}
      </p>
      <p class="palette-foot">
        {HINTS.map(([k, what]) => (
          <span key={k}>
            <kbd>{k}</kbd> {what}
          </span>
        ))}
      </p>
    </div>
  )
}
