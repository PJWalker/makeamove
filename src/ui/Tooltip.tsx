import { useEffect, useRef } from 'preact/hooks'
import { useSignal } from '@preact/signals'

const DELAY = 150
const GAP = 8

/**
 * One tooltip for the whole app. It watches the pointer and keyboard focus
 * and, after a short delay, shows the `title` of whatever is under them. The
 * native tooltip would double up, so a title is moved into `data-tip` while
 * the element has one. It lives in the top layer, so it sits above dialogs.
 */
export function Tooltip() {
  const tip = useSignal<{ text: string; x: number; y: number; dir: 'down' | 'up' | 'left' | 'right' } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    let current: Element | null = null

    const hide = () => {
      clearTimeout(timer)
      current = null
      tip.value = null
    }

    function textOf(el: Element) {
      const title = el.getAttribute('title')
      if (title) {
        el.setAttribute('data-tip', title)
        el.removeAttribute('title')
      }
      return el.getAttribute('data-tip')
    }

    function show(el: Element) {
      const text = el.getAttribute('data-tip')
      if (!text || !el.isConnected) return
      const r = el.getBoundingClientRect()
      // Centred on the item and pointing toward the middle of the screen: sideways for
      // sidebar tabs, down from the top edge, up from the bottom.
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (el.closest('.sidebar-rail')) {
        const dir = cx < innerWidth / 2 ? 'right' : 'left'
        tip.value = { text, x: dir === 'right' ? r.right + GAP : r.left - GAP, y: cy, dir }
      } else {
        const dir = cy < innerHeight / 2 ? 'down' : 'up'
        tip.value = { text, x: cx, y: dir === 'down' ? r.bottom + GAP : r.top - GAP, dir }
      }
    }

    function consider(target: EventTarget | null, delay: number) {
      const el = (target as Element | null)?.closest?.('[title], [data-tip]') ?? null
      if (el === current) return
      hide()
      if (!el || !textOf(el)) return
      current = el
      timer = window.setTimeout(() => show(el), delay)
    }

    const onOver = (e: PointerEvent) => e.pointerType !== 'touch' && consider(e.target, DELAY)
    const onFocus = (e: FocusEvent) => (e.target as Element).matches?.(':focus-visible') && consider(e.target, DELAY)
    const onOut = (e: Event) => {
      const to = (e as PointerEvent).relatedTarget as Element | null
      if (!current || (to && current.contains(to))) return
      hide()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', hide)
    // A press, a key or a scroll dismisses it.
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('scroll', hide, true)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('scroll', hide, true)
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
        el.style.top = `${clamp(t.y - h / 2, h, innerHeight)}px`
      } else {
        el.style.left = `${clamp(t.x - w / 2, w, innerWidth)}px`
        el.style.top = `${t.dir === 'down' ? t.y : t.y - h}px`
      }
    } else if (el.matches(':popover-open')) {
      el.hidePopover()
    }
  }, [t])

  return (
    <div ref={ref} class="tooltip" popover="manual" role="tooltip">
      {t?.text}
    </div>
  )
}
