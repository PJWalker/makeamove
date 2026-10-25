import { growFromOrigin, hasFreshOrigin } from './morph'
import { nextZ } from './windows'
import { trackPointer } from './pointer'

/*
 * Pop-up panels: non-modal <dialog>s that float above the table, open
 * without a backdrop, and can be dragged by their title bar. They keep
 * where they were left between openings; the first time, they open centred.
 * Each one grows out of whatever opened it (see morph.ts).
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

/** Bring a pop-up in front of every other window. */
export function raisePopup(dialog: HTMLElement) {
  dialog.style.zIndex = String(nextZ())
}

/** Open a pop-up (or bring it forward if it's already open). */
export function openPopup(dialog: HTMLDialogElement | null | undefined) {
  if (!dialog) return
  raisePopup(dialog)
  if (dialog.open) return
  // Mark it before showing, so its own fade-in doesn't start underneath.
  if (hasFreshOrigin()) dialog.dataset.morph = 'true'
  dialog.show()
  const r = dialog.getBoundingClientRect()
  if (!dialog.style.left) {
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
  growFromOrigin(dialog)
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
