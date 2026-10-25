/*
 * Press-and-hold menus, as on macOS: press to open a menu, move to an item
 * and release to choose it. A quick press-and-release in place is an
 * ordinary click instead, which leaves the menu open to use normally.
 */

/** A release sooner than this, without moving, is a plain click. */
export const HOLD_MS = 250
/** Movement beyond this many px makes a release count as a choice. */
export const HOLD_SLOP = 4

/**
 * Watch for `button` (0 = left, 2 = right) being released after a press at
 * (x, y). Calls `onRelease` with the release event only if it was a hold or
 * a drag; a quick click is ignored. Any new press cancels the watch (for a
 * menu that opened on release, as right-click menus do on Windows). Returns
 * a function that stops watching.
 */
export function watchHoldRelease(x: number, y: number, button: number, onRelease: (e: PointerEvent) => void): () => void {
  const started = performance.now()
  let moved = false
  const onMove = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - x, e.clientY - y) > HOLD_SLOP) moved = true
  }
  const onUp = (e: PointerEvent) => {
    if (e.button !== button) return
    stop()
    if (moved || performance.now() - started >= HOLD_MS) onRelease(e)
  }
  const stop = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointerdown', stop, true)
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  // Registered after the opening press has finished dispatching.
  setTimeout(() => window.addEventListener('pointerdown', stop, true))
  return stop
}

/** The element under a pointer event's position. */
export const elementAt = (e: PointerEvent) => document.elementFromPoint(e.clientX, e.clientY)
