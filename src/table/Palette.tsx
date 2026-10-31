import { signal, useSignal } from '@preact/signals'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { noteRecent, recentActions } from '../actions/recent'
import { rollAction } from '../actions/core'
import { actionForCombo, comboOf, firesWhileTyping, shortcutFor, shortcuts, showCombo } from '../actions/custom'
import { buildIndex, findAction } from '../actions/registry'
import { diceFormula } from '../chat/commands'
import { rank } from '../actions/search'
import type { Action } from '../actions/types'
import {
  editHotbar,
  insertAt,
  isPinned,
  pin,
  unpin,
} from "../characters/hotbar";
import { isTyping } from '../ui/keys'
import { RECORDER } from "./ActionDialogs";
import { actionMenuItems } from "./actionMenu";
import { actionEntity, dragEntity } from './entityDrag'
import { menuTrigger } from '../ui/menuTrigger'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { Campaign } from '../store/campaign'
import { nextZ } from '../ui/windows'

export const paletteOpen = signal(false)

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

  // The player's own shortcuts, ahead of the app's (captured, so a tool key bound to something else stays bound).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as Element | null)?.closest?.(`.${RECORDER}`)) return
      const combo = comboOf(e)
      if (!combo) return
      const id = actionForCombo(shortcuts(campaign), combo)
      if (!id || (isTyping(e.target) && !firesWhileTyping(combo))) return
      const a = findAction(campaign, id)
      if (a?.available !== true) return
      e.preventDefault()
      e.stopPropagation()
      paletteOpen.value = false
      noteRecent(a.id)
      a.run()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [campaign])

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
  const ranked = rank(index, query.value, { recent: recentActions.value })
  // A dice formula typed on its own rolls it, first in the list.
  const formula = diceFormula(query.value)
  const roll = formula ? rollAction(campaign, formula) : null
  const results = roll ? [roll, ...ranked.filter((a) => a.id !== roll.id)] : ranked
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
      cursor.value = i;
      menu.value = {
        x,
        y,
        items: [
          ...actionMenuItems(
            campaign,
            [{ id: a.id, title: a.title }],
            () => (paletteOpen.value = false),
          ),
          ...(a.available === true
            ? [{ label: "Run", onSelect: () => choose(a) }]
            : []),
        ],
      };
    })
    return {
      onContextMenu: trigger.onContextMenu,
      onPointerDown(e: PointerEvent) {
        trigger.onPointerDown(e)
        // Onto the hotbar, a character or a note.
        const what = actionEntity(campaign, a.id, a.title)
        dragEntity(e, {
          ...what,
          pin: (index) => {
            if (editHotbar(campaign, (slots) => insertAt(slots, a.id, index))) note.value = `Added ${a.title} to the hotbar`
          },
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
        placeholder="Search moves, tools, scenes and commands, or roll 2d6+1…"
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
          const combo = shortcutFor(campaign, a.id)
          const hint = combo ? showCombo(combo) : a.hint
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
              <span class="palette-icon">{a.icon && <a.icon size={22} />}</span>
              <span class="palette-text">
                <span class="palette-title">{a.title}</span>
                <span class="palette-detail">
                  {off ? a.available : (a.detail ?? a.source)}
                </span>
              </span>
              {hint && <kbd>{hint}</kbd>}
            </li>
          );
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
    </div>
  )
}
