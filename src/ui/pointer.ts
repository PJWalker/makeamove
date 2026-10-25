/**
 * Follow the pointer for a drag that resizes something. While it runs, the
 * whole page shows `cursor` (so it doesn't flicker when the pointer outruns
 * the handle) and text selection is off. Returns a function that ends it.
 */
export function trackPointer(cursor: string, onMove: (e: PointerEvent) => void): () => void {
  const root = document.documentElement
  root.style.setProperty('--drag-cursor', cursor)
  root.classList.add('is-dragging')
  window.addEventListener('pointermove', onMove)
  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointercancel', stop)
    root.classList.remove('is-dragging')
    root.style.removeProperty('--drag-cursor')
  }
  window.addEventListener('pointercancel', stop)
  return stop
}
