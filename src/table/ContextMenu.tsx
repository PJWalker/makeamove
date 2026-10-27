import { morphOpen, setMorphOrigin } from '../ui/morph'
import { elementAt, watchHoldRelease } from '../ui/holdRelease'
import type { ComponentType } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { placeAnchored, pointAnchor } from '../ui/anchor'
import { IconCheck } from '../ui/icons'
import type { IconProps } from '../ui/icons'

export type MenuItem =
  | {
      label: string
      Icon?: ComponentType<IconProps>
      shortcut?: string
      danger?: boolean
      disabled?: boolean
      /** For an item that turns something on or off: ticked when it's on. */
      checked?: boolean
      onSelect: () => void
    }
  | 'divider'

/**
 * A right-click menu at (x, y), nudged to stay on screen. Arrow keys move
 * between items (Home/End jump; Enter, Space or Right choose the focused item; Left or
 * Escape close); Escape, a click elsewhere or scrolling closes it. Closing
 * plays a fade first (the chosen item blinks while the rest fades), and
 * `onClose` fires once it ends.
 *
 * An item whose label ends in "…" opens a pop-up, as on macOS; the menu
 * closes at once and the pop-up morphs out of the item (morph.ts).
 *
 * Press and hold works as on macOS: hold the right button, move to an item
 * and let go to choose it; let go anywhere else to close the menu. A quick
 * right-click (released at once, without moving) leaves the menu open.
 */

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  button = 2,
  press,
  label,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
  /** The button whose release chooses an item: 2 for right-click menus, 0 for a menu button. */
  button?: number
  /** Where the opening press was, when the menu opens somewhere else (below a menu button). */
  press?: { x: number; y: number }
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Index of the chosen item, or -1 when dismissed; null while open.
  const [closing, setClosing] = useState<number | null>(null)
  const closingRef = useRef(false)
  closingRef.current = closing !== null

  const dismiss = (chosen = -1) => {
    if (closingRef.current) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) onClose()
    else setClosing(chosen)
  }
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  // A new right-click reuses this instance; show the new menu. Not keyed on
  // `items`, which is rebuilt on every parent render (e.g. after onSelect).
  useLayoutEffect(() => setClosing(null), [x, y])

  // Press, hold and release: the release chooses (or closes).
  useEffect(
    () =>
      watchHoldRelease(press?.x ?? x, press?.y ?? y, button, (e) => {
        const item = elementAt(e)?.closest<HTMLButtonElement>('.menu-item:not(:disabled)')
        if (item && ref.current?.contains(item)) item.click()
        else dismissRef.current()
      }),
    [x, y],
  )

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Down from the pointer, or up from it near the bottom of the window.
    placeAnchored(el, pointAnchor(x, y), 0)
  }, [x, y])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) dismissRef.current()
    }
    // Captured at the document so the menu works even if focus has strayed.
    const onKey = (e: KeyboardEvent) => {
      const menu = ref.current
      if (!menu || e.metaKey || e.ctrlKey || e.altKey) return
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === 'Escape' || e.key === 'ArrowLeft') return handled(), dismissRef.current()
      if (e.key === 'Tab') return dismissRef.current()
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (!buttons.length) return
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const last = buttons.length - 1
      let next: number | null = null
      if (e.key === 'ArrowDown') next = i < 0 || i === last ? 0 : i + 1
      else if (e.key === 'ArrowUp') next = i <= 0 ? last : i - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      if (next !== null) {
        handled()
        buttons[next].focus()
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        // There are no submenus, so Right activates like Enter.
        handled()
        if (i >= 0 && !e.repeat) buttons[i].click()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    const onAway = () => dismissRef.current()
    window.addEventListener('wheel', onAway, { passive: true })
    window.addEventListener('blur', onAway)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onAway)
      window.removeEventListener('blur', onAway)
    }
  }, [])

  // On <body>, above any open pop-ups.
  return createPortal(
    <div
      ref={ref}
      class="context-menu panel bevel"
      role="menu"
      aria-label={label}
      style={{ left: x, top: y }}
      data-closing={closing !== null}
      onAnimationEnd={(e) => {
        if (e.target === ref.current && closing !== null) onClose()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} class="context-divider" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            class="menu-item bevel"
            data-danger={item.danger}
            data-chosen={closing === i}
            onPointerMove={(e) => e.currentTarget.focus({ preventScroll: true })}
            disabled={item.disabled}
            onClick={(e) => {
              // An item ending in "…" opens a pop-up, which morphs out of the
              // item while the menu goes at once.
              if (item.label.endsWith('…') && !closingRef.current) {
                closingRef.current = true
                morphOpen(e.currentTarget, () => {
                  onClose()
                  item.onSelect()
                })
                return
              }
              // Anything else it opens still grows out of it.
              setMorphOrigin(e.currentTarget)
              dismiss(i)
              item.onSelect()
            }}
          >
            {item.checked !== undefined && (item.checked ? <IconCheck size={16} class="menu-check" /> : <span class="menu-icon-space" />)}
            {item.Icon ? <item.Icon size={16} /> : <span class="menu-icon-space" />}
            <span class="menu-label">{item.label}</span>
            {item.shortcut && <kbd class="menu-shortcut">{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
