/*
 * Pop-ups that grow out of whatever opened them. A menu item (or anything
 * else) records where it is with setMorphOrigin(); the next dialog opened
 * with openPopup() starts as a strip exactly that size and place, showing
 * the top of the dialog (its title, which usually matches the item's label),
 * and grows into its own position. popup.ts opens dialogs this way.
 *
 * This animates the dialog itself (FLIP) rather than using a view
 * transition: the menu that spawned it closes at the same moment, so there
 * is often no element left to morph from, only the rectangle.
 */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/** An origin is only used by a dialog that opens soon after it was set. */
const ORIGIN_TTL_MS = 800
const DURATION_MS = 360
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
        clipPath: `inset(0 0 ${hidden}px 0)`,
        opacity: 0.5,
      },
      { opacity: 1, offset: 0.35 },
      { transformOrigin: '0 0', transform: 'none', clipPath: 'inset(0 0 0 0)', opacity: 1 },
    ],
    { duration: DURATION_MS, easing: EASE },
  )
  anim.finished.catch(() => {}).finally(() => delete el.dataset.morph)
  return true
}
