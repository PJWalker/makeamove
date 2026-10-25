import { setMorphOrigin } from '../ui/morph'
import { elementAt, watchHoldRelease } from '../ui/holdRelease'
import type { ComponentType } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { IconProps } from '../ui/icons'

export type MenuItem =
  | {
      label: string
      Icon?: ComponentType<IconProps>
      shortcut?: string
      danger?: boolean
      disabled?: boolean
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
 * Press and hold works as on macOS: hold the right button, move to an item
 * and let go to choose it; let go anywhere else to close the menu. A quick
 * right-click (released at once, without moving) leaves the menu open.
 */

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
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
      watchHoldRelease(x, y, 2, (e) => {
        const item = elementAt(e)?.closest<HTMLButtonElement>('.menu-item:not(:disabled)')
        if (item && ref.current?.contains(item)) item.click()
        else dismissRef.current()
      }),
    [x, y],
  )

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.left = `${Math.round(Math.max(8, Math.min(x, innerWidth - r.width - 8)))}px`
    el.style.top = `${Math.round(Math.max(8, Math.min(y, innerHeight - r.height - 8)))}px`
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
            role="menuitem"
            class="menu-item bevel"
            data-danger={item.danger}
            data-chosen={closing === i}
            onPointerMove={(e) => e.currentTarget.focus({ preventScroll: true })}
            disabled={item.disabled}
            onClick={(e) => {
              // Anything this item opens grows out of it.
              setMorphOrigin(e.currentTarget)
              dismiss(i)
              item.onSelect()
            }}
          >
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
