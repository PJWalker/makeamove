import { hideTooltip } from '../ui/Tooltip'

const THRESHOLD = 5

/**
 * Drag an item out of the Libraries onto a character: their sheet's
 * inventory, or their row in the character list. A small chip (the row's
 * name, with its icon) follows the pointer, and the target under it (any
 * element with `data-item-drop`, holding the character's id) is marked;
 * releasing there calls `onDrop` with that id, and the target flashes. A
 * press that never moves far is left alone, so it still clicks.
 */
export function dragItem(e: PointerEvent, onDrop: (characterId: string) => void) {
  if (e.button !== 0) return
  const row = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  let ghost: HTMLElement | null = null
  let target: HTMLElement | null = null

  const under = (ev: PointerEvent) =>
    document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-item-drop]') ?? null

  function mark(next: HTMLElement | null) {
    if (next === target) return
    delete target?.dataset.dropping
    target = next
    if (target) target.dataset.dropping = 'true'
  }

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      // Just the name and icon, not the row's buttons.
      const pick = row.querySelector('.list-pick') ?? row
      ghost = pick.cloneNode(true) as HTMLElement
      ghost.className = 'drag-ghost item-ghost bevel'
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
      hideTooltip()
    }
    // Beside the pointer, so it doesn't hide what it's over.
    ghost.style.left = `${ev.clientX + 12}px`
    ghost.style.top = `${ev.clientY + 8}px`
    mark(under(ev))
  }

  function end(ev: PointerEvent, commit: boolean) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    const drop = commit ? under(ev) : null
    mark(null)
    if (!ghost) return
    ghost.remove()
    document.documentElement.classList.remove('is-reordering')
    // The click that ends a drag is not a press on the row.
    const swallow = (c: Event) => c.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    if (!drop?.dataset.itemDrop) return
    onDrop(drop.dataset.itemDrop)
    // A brief flash says it landed.
    drop.dataset.dropped = 'true'
    setTimeout(() => delete drop.dataset.dropped, 600)
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
