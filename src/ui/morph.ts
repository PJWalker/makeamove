/*
 * Pop-ups that grow out of whatever opened them, and open right there rather
 * than somewhere else on screen.
 *
 * Two ways to get there:
 *  - morphOpen(from, open): a shared-element view transition. The source (a
 *    menu item, a tooltip) and the dialog share a transition name, so the
 *    browser morphs one into the other's box and cross-fades them. `open`
 *    must remove the source and open the dialog with openPopup().
 *  - setMorphOrigin(from): just remember the rectangle. The next dialog
 *    opened with openPopup() starts as a strip that size and place, showing
 *    its top (the title, usually the item's label), and grows into its own
 *    box (FLIP on the dialog). For openers that can't use a transition.
 *
 * Either way openPopup() places the dialog at the origin's top left.
 */

import { until, withTransition } from './transition'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/** An origin is only used by a dialog that opens soon after it was set. */
const ORIGIN_TTL_MS = 800
const DURATION_MS = 240
/** Room left around a growing dialog for its shadow (--window-shadow reaches 36px). */
const SHADOW_ROOM = 48
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

let origin: { rect: DOMRect; at: number } | null = null

/** Remember where the next pop-up is being opened from. */
export function setMorphOrigin(from: Element | DOMRect | null | undefined) {
  if (!from) {
    origin = null
    return
  }
  const rect = from instanceof DOMRect ? from : from.getBoundingClientRect()
  origin = { rect, at: performance.now() }
}

/** Where the next pop-up should open: the origin's top left, if it's fresh. */
export function originPoint(): { x: number; y: number } | null {
  if (!origin || performance.now() - origin.at > ORIGIN_TTL_MS) return null
  return { x: origin.rect.left, y: origin.rect.top }
}

const MORPH_NAME = 'popup-morph'
/** A shared-element morph is under way, waiting for its dialog to open. */
let morphing: { target: HTMLElement | null } | null = null

/**
 * Open a pop-up out of `from` with a shared-element transition. `open` runs
 * inside the transition: it must take `from` away (close the menu, hide the
 * tooltip) and cause a dialog to open with openPopup(), synchronously or
 * from a layout effect, so the transition can catch it.
 */
export function morphOpen(from: Element, open: () => void) {
  setMorphOrigin(from)
  if (!document.startViewTransition || reducedMotion.matches || morphing) {
    open()
    return
  }
  const source = from as HTMLElement
  source.style.viewTransitionName = MORPH_NAME
  const m = (morphing = { target: null as HTMLElement | null })
  void withTransition(
    async () => {
      source.style.removeProperty('view-transition-name')
      open()
      await until(() => !!m.target, 400)
    },
    { rootClass: 'vt-popup' },
  ).finally(() => {
    if (m.target && m.target !== document.documentElement) {
      m.target.style.removeProperty('view-transition-name')
      delete m.target.dataset.morph
    }
    if (morphing === m) morphing = null
  })
}

/**
 * Called by openPopup(): if a morph is waiting for a dialog, this is it.
 * Returns whether the transition will animate it.
 */
export function claimMorph(dialog: HTMLElement): boolean {
  if (!morphing || morphing.target) return false
  morphing.target = dialog
  dialog.style.viewTransitionName = MORPH_NAME
  // Skip the dialog's own fade-and-rise; the transition replaces it.
  dialog.dataset.morph = 'true'
  origin = null
  return true
}

/** The pop-up a morph was opening is already open: let the transition finish now. */
export function releaseMorph() {
  if (morphing && !morphing.target) morphing.target = document.documentElement
}

/** Whether an element shown now would grow from an origin. */
export function hasFreshOrigin(): boolean {
  return !!origin && performance.now() - origin.at <= ORIGIN_TTL_MS && !reducedMotion.matches && origin.rect.width >= 1
}

/**
 * Grow an element that has just appeared out of the remembered origin, if
 * there is a fresh one. Returns whether it animated.
 */
export function growFromOrigin(el: HTMLElement): boolean {
  if (!hasFreshOrigin()) {
    origin = null
    return false
  }
  const o = origin!
  origin = null

  const d = el.getBoundingClientRect()
  const scale = o.rect.width / d.width
  // Show only as much of the element as fits the origin's height, at that scale.
  const hidden = Math.max(0, d.height - o.rect.height / scale)
  // Skip the element's own fade-and-rise; this animation replaces it.
  el.dataset.morph = 'true'
  const anim = el.animate(
    [
      {
        transformOrigin: '0 0',
        transform: `translate(${o.rect.left - d.left}px, ${o.rect.top - d.top}px) scale(${scale})`,
        // Crop the dialog's bottom, but not its shadow.
        clipPath: `inset(${-SHADOW_ROOM}px ${-SHADOW_ROOM}px ${hidden}px ${-SHADOW_ROOM}px)`,
        opacity: 0.5,
      },
      { opacity: 1, offset: 0.35 },
      { transformOrigin: '0 0', transform: 'none', clipPath: `inset(${-SHADOW_ROOM}px)`, opacity: 1 },
    ],
    { duration: DURATION_MS, easing: EASE },
  )
  anim.finished.catch(() => {}).finally(() => delete el.dataset.morph)
  return true
}
