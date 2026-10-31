/**
 * Follow the pointer for a drag that resizes or moves something. While it
 * runs, the whole page shows `cursor` (so it doesn't flicker when the pointer
 * outruns the handle) and text selection is off. It ends on release, on a
 * cancelled pointer, or when the window loses focus mid-drag; `onEnd` runs
 * once then. Returns a function that ends it early.
 */
export function trackPointer(cursor: string, onMove: (e: PointerEvent) => void, onEnd?: () => void): () => void {
  const root = document.documentElement
  root.style.setProperty('--drag-cursor', cursor)
  root.classList.add('is-dragging')
  const ends = ['pointerup', 'pointercancel', 'blur'] as const
  let done = false
  const stop = () => {
    if (done) return
    done = true
    window.removeEventListener('pointermove', onMove)
    for (const type of ends) window.removeEventListener(type, stop)
    root.classList.remove('is-dragging')
    root.style.removeProperty('--drag-cursor')
    onEnd?.()
  }
  window.addEventListener('pointermove', onMove)
  for (const type of ends) window.addEventListener(type, stop)
  return stop
}
