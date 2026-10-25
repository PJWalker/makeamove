const THRESHOLD = 5

/**
 * Drag a character row into a folder. A copy follows the pointer and the
 * folder under it (any element with `data-folder-drop`, "" meaning the top
 * level) is marked; releasing there calls `onDrop` with its id. A press that
 * never travels stays an ordinary click.
 */
export function dragToFolder(e: PointerEvent, onDrop: (folderId: string | undefined) => void) {
  if (e.button !== 0) return
  const row = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  const grab = row.getBoundingClientRect()
  let ghost: HTMLElement | null = null
  let target: HTMLElement | null = null

  const under = (ev: PointerEvent) =>
    document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-folder-drop]') ?? null

  function mark(next: HTMLElement | null) {
    if (next === target) return
    delete target?.dataset.dropping
    target = next
    if (target) target.dataset.dropping = 'true'
  }

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      ghost = row.cloneNode(true) as HTMLElement
      ghost.classList.add('drag-ghost')
      ghost.style.width = `${grab.width}px`
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
    }
    ghost.style.left = `${ev.clientX - (startX - grab.left)}px`
    ghost.style.top = `${ev.clientY - (startY - grab.top)}px`
    mark(under(ev))
  }

  function end(ev: PointerEvent, commit: boolean) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    mark(null)
    if (!ghost) return
    ghost.remove()
    document.documentElement.classList.remove('is-reordering')
    // The click that ends a drag is not a press on the row.
    const swallow = (c: Event) => c.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    const drop = under(ev)
    if (commit && drop) onDrop(drop.dataset.folderDrop || undefined)
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
