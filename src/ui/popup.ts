import { placeAnchored } from './anchor'
import { claimMorph, growFromOrigin, hasFreshOrigin, originRect, releaseMorph } from './morph'
import { nextZ } from './windows'
import { RESIZE_CURSORS, resizeRect, type ResizeDir } from '../table/resizeRect'
import { trackPointer } from './pointer'

/*
 * Pop-up panels: non-modal <dialog>s that float above the table, open
 * without a backdrop, and can be dragged by their title bar. Each one opens
 * where it came from, growing out of whatever opened it (see morph.ts), so
 * it doesn't jump somewhere else on screen. Without an origin, a pop-up
 * opens where it was last left, or else centred.
 */

/** How much of a pop-up must stay on screen, so it can always be dragged back. */
const KEEP_VISIBLE = 80

const whole = (v: number) => Math.round(v)
const CASCADE = 28

function place(el: HTMLElement, x: number, y: number) {
  const { width } = el.getBoundingClientRect()
  el.style.left = `${whole(Math.min(innerWidth - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - width, x)))}px`
  el.style.top = `${whole(Math.min(innerHeight - 40, Math.max(0, y)))}px`
}

/**
 * Place a pop-up that is just opening over what spawned it, wholly on
 * screen: from the spawner's top edge down, or where that won't fit, from
 * its bottom edge up (see ui/anchor.ts).
 */
function placeOver(el: HTMLElement, from: DOMRect) {
  placeAnchored(el, { left: from.left, top: from.bottom, bottom: from.top }, 0)
}

/** Bring a pop-up in front of every other window. */
export function raisePopup(dialog: HTMLElement) {
  dialog.style.zIndex = String(nextZ())
}

/** Open a pop-up (or bring it forward if it's already open). */
export function openPopup(dialog: HTMLDialogElement | null | undefined) {
  if (!dialog) return
  raisePopup(dialog)
  if (dialog.open) {
    releaseMorph()
    return
  }
  const at = originRect()
  const viewMorph = claimMorph(dialog)
  // Mark it before showing, so its own fade-in doesn't start underneath.
  if (hasFreshOrigin()) dialog.dataset.morph = 'true'
  dialog.show()
  const r = dialog.getBoundingClientRect()
  if (at) {
    // Open over the thing that spawned it.
    placeOver(dialog, at)
  } else if (!dialog.style.left) {
    // Centred, stepping down and right past any pop-up already there.
    let x = (innerWidth - r.width) / 2
    let y = Math.max(48, (innerHeight - r.height) / 3)
    const others = [...document.querySelectorAll<HTMLElement>('dialog[open]')].filter((d) => d !== dialog)
    const taken = (x: number, y: number) =>
      others.some((d) => Math.abs(d.offsetLeft - x) < 8 && Math.abs(d.offsetTop - y) < 48)
    while (taken(whole(x), whole(y))) {
      x += CASCADE
      y += CASCADE
    }
    place(dialog, x, y)
  } else {
    place(dialog, r.left, r.top)
  }
  // A view transition animates it; otherwise grow it here.
  if (!viewMorph) growFromOrigin(dialog)
}

/**
 * Resize a pop-up from an edge or corner, like a floating window; call from
 * a resize zone's pointerdown. Once sized by hand, a pop-up keeps that size
 * (its body scrolls) instead of fitting its content.
 */
export function resizePopup(dialog: HTMLElement, e: PointerEvent, dir: ResizeDir) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  raisePopup(dialog)
  // Layout size, not getBoundingClientRect: that would include the grow
  // animation's scale if the pop-up is still opening.
  const start = { x: dialog.offsetLeft, y: dialog.offsetTop, w: dialog.offsetWidth, h: dialog.offsetHeight }
  dialog.dataset.sized = 'true'
  const stop = trackPointer(RESIZE_CURSORS[dir], (ev) => {
    const next = resizeRect(start, dir, ev.clientX - e.clientX, ev.clientY - e.clientY)
    Object.assign(dialog.style, {
      left: `${next.x}px`,
      top: `${next.y}px`,
      width: `${next.w}px`,
      height: `${next.h}px`,
    })
  })
  window.addEventListener('pointerup', stop, { once: true })
}

/** Drag a pop-up by its title bar; call from the bar's pointerdown. */
export function dragPopup(dialog: HTMLElement, e: PointerEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea')) return
  e.preventDefault()
  raisePopup(dialog)
  const r = dialog.getBoundingClientRect()
  const dx = e.clientX - r.left
  const dy = e.clientY - r.top
  const stop = trackPointer('grabbing', (ev) => place(dialog, ev.clientX - dx, ev.clientY - dy))
  window.addEventListener('pointerup', stop, { once: true })
}
