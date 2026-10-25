import { tokenDrop, type TokenSpec } from './canvasState'

const THRESHOLD = 5

/**
 * Drag a stand-in token (the pressed element) onto the map. A copy follows
 * the pointer; releasing over the scene places a token for the character.
 * A press that never travels stays an ordinary click.
 */
export function dragToken(e: PointerEvent, spec: TokenSpec) {
  if (e.button !== 0) return
  const src = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  const box = src.getBoundingClientRect()
  let ghost: HTMLElement | null = null

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      ghost = src.cloneNode(true) as HTMLElement
      ghost.classList.add('drag-ghost')
      ghost.style.width = `${box.width}px`
      ghost.style.height = `${box.height}px`
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
    }
    ghost.style.left = `${ev.clientX - box.width / 2}px`
    ghost.style.top = `${ev.clientY - box.height / 2}px`
  }

  function end(ev: PointerEvent, commit: boolean) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    if (!ghost) return
    ghost.remove()
    document.documentElement.classList.remove('is-reordering')
    if (commit && document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.scene-canvas')) {
      tokenDrop.value?.(ev.clientX, ev.clientY, spec)
    }
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
