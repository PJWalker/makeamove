/*
 * The control the user just pressed, so something it starts (a roll's
 * prompt) can appear beside it. Pointer presses are noted for every button;
 * keyboard shortcuts note the control they stand for.
 */

/** A press only counts for whatever it starts right away. */
const TTL_MS = 1000

let last: { el: Element; at: number } | null = null

export function notePressed(el: Element | null | undefined) {
  last = el ? { el, at: performance.now() } : null
}

addEventListener(
  'pointerdown',
  (e) => notePressed((e.target as Element | null)?.closest?.('button, [role="button"], a')),
  true,
)

/** The control pressed just now, if any. */
export function lastPressed(): Element | null {
  return last && performance.now() - last.at < TTL_MS ? last.el : null
}
