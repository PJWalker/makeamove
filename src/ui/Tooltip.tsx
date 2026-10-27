import { useEffect, useRef } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { inTransition } from './transition'

const DELAY = 150
const GAP = 10

let hideNow: (() => void) | null = null

/**
 * Take the tooltip away at once, without waiting for a render (for a
 * transition that morphs it into something else), and keep it away until
 * the pointer leaves the element it belongs to.
 */
export function hideTooltip() {
  hideNow?.()
}

/**
 * One tooltip for the whole app. It watches the pointer and keyboard focus
 * and, after a short delay, shows the `title` of whatever is under them. The
 * native tooltip would double up, so a title is moved into `data-tip` while
 * the element has one. It lives in the top layer, so it sits above dialogs.
 * An element marked `data-tip-opens` keeps its tooltip through a press, for
 * a click that turns the tooltip into a window (hideTooltip ends it).
 */
export function Tooltip() {
  const tip = useSignal<{ text: string; long?: boolean; x: number; y: number; dir: 'down' | 'up' | 'left' | 'right'; instant?: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    let current: Element | null = null
    // Turned into something else; not shown again until the pointer leaves it.
    let suppressed: Element | null = null
    let lastShown = 0

    const hide = () => {
      clearTimeout(timer)
      current = null
      if (tip.value) lastShown = performance.now()
      tip.value = null
    }
    // A press, key or scroll ends the "already browsing" state too.
    const dismiss = () => {
      hide()
      lastShown = 0
    }
    const onPress = (e: PointerEvent) => {
      const opens = (e.target as Element | null)?.closest?.('[data-tip-opens]')
      if (opens && opens === current) return
      dismiss()
    }
    hideNow = () => {
      suppressed = current
      dismiss()
      if (ref.current?.matches(':popover-open')) ref.current.hidePopover()
    }

    function textOf(el: Element) {
      const title = el.getAttribute('title')
      if (title) {
        el.setAttribute('data-tip', title)
        el.removeAttribute('title')
      }
      return el.getAttribute('data-tip')
    }

    function show(el: Element, instant = false) {
      const text = el.getAttribute('data-tip')
      if (!text || !el.isConnected) return
      const long = el.hasAttribute('data-tip-long')
      const r = el.getBoundingClientRect()
      // Centred on the item and pointing toward the middle of the screen: sideways for
      // sidebar tabs and anything marked data-tip-side, down from the top edge, up
      // from the bottom.
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (el.closest('.sidebar-rail') || el.hasAttribute('data-tip-side')) {
        // data-tip-side="left" or "right" picks a side; otherwise, the side with more room.
        const side = el.getAttribute('data-tip-side')
        const dir = side === 'left' || side === 'right' ? side : cx < innerWidth / 2 ? 'right' : 'left'
        tip.value = { text, long, x: dir === 'right' ? r.right + GAP : r.left - GAP, y: cy, dir, instant }
      } else {
        const dir = cy < innerHeight / 2 ? 'down' : 'up'
        tip.value = { text, long, x: cx, y: dir === 'down' ? r.bottom + GAP : r.top - GAP, dir, instant }
      }
    }

    function consider(target: EventTarget | null, delay: number) {
      const el = (target as Element | null)?.closest?.('[title], [data-tip]') ?? null
      if (el === current || (el && el === suppressed)) return
      hide()
      if (!el || !textOf(el)) return
      current = el
      const browsing = performance.now() - lastShown < 200
      if (browsing) show(el, true)
      else timer = window.setTimeout(() => show(el), delay)
    }

    const onOver = (e: PointerEvent) => e.pointerType !== 'touch' && !inTransition() && consider(e.target, DELAY)
    const onFocus = (e: FocusEvent) => (e.target as Element).matches?.(':focus-visible') && consider(e.target, DELAY)
    // Focus leaving the element it belongs to; focus moving elsewhere (a
    // click that focuses a button) leaves a pointer's tooltip alone.
    const onBlur = (e: FocusEvent) => {
      if (current && current.contains(e.target as Node)) hide()
    }
    const onOut = (e: Event) => {
      if (inTransition()) return
      const to = (e as PointerEvent).relatedTarget as Element | null
      if (suppressed && !(to && suppressed.contains(to))) suppressed = null
      if (!current || (to && current.contains(to))) return
      hide()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    // A press, a key or a scroll dismisses it.
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      hideNow = null
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('keydown', dismiss, true)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [])

  const t = tip.value
  // Keep it on screen: centre on the target, then clamp to the window.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (t) {
      if (!el.matches(':popover-open')) el.showPopover()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const clamp = (v: number, size: number, max: number) => Math.min(Math.max(v, 4), max - size - 4)
      if (t.dir === 'left' || t.dir === 'right') {
        el.style.left = `${t.dir === 'right' ? t.x : t.x - w}px`
        const top = clamp(t.y - h / 2, h, innerHeight)
        el.style.top = `${top}px`
        el.style.setProperty('--arrow', `${t.y - top}px`)
      } else {
        const left = clamp(t.x - w / 2, w, innerWidth)
        el.style.left = `${left}px`
        el.style.setProperty('--arrow', `${t.x - left}px`)
        el.style.top = `${t.dir === 'down' ? t.y : t.y - h}px`
      }
    } else if (el.matches(':popover-open')) {
      el.hidePopover()
    }
  }, [t])

  return (
    <div ref={ref} class="tooltip" data-dir={t?.dir} data-instant={t?.instant || undefined} data-long={t?.long || undefined} popover="manual" role="tooltip">
      {t?.text}
    </div>
  )
}
