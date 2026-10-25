/*
 * Every window on the table (panels pulled out of the sidebar and pop-ups
 * opened from menus) lives in one layer and one stacking order, so whichever
 * was touched last is on top. The right-click menu sits above them all.
 */

/**
 * The layer windows render into. Tabletop attaches it inside the table, so
 * windows hide with the rest of the chrome; portals target it directly.
 */
export const windowLayer = document.createElement('div')
windowLayer.className = 'window-layer'

let top = 0

/** A z-index above every window so far. */
export function nextZ(): number {
  return ++top
}

/** Account for a z-index restored from storage, so new ones stay above it. */
export function noteZ(z: number) {
  top = Math.max(top, z)
}
