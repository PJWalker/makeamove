import { dropLine, indexAmong } from '../ui/reorder'
import { dropMarker, dropOn, dropTargetAt, type DragEntity } from './entityDrag'

const THRESHOLD = 5

/**
 * Drag a row (the pressed element) onto the hotbar. A copy follows the
 * pointer, and over the bar a white line marks where it would be pinned;
 * releasing there calls `onDrop` with that position. With an `entity`, it
 * can instead land on a character or in a note (see entityDrag.ts). A press
 * that never travels is left alone, so it stays an ordinary click.
 */
export function dragToHotbar(e: PointerEvent, onDrop: (index: number) => void, entity?: DragEntity) {
  if (e.button !== 0) return
  const row = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  const grab = row.getBoundingClientRect()
  const marker = dropLine('x')
  let ghost: HTMLElement | null = null
  // Off the hotbar, it can also land on a character or in a note.
  const mark = dropMarker()
  const elsewhere = (ev: PointerEvent) => (entity && !over(ev) ? dropTargetAt(ev.clientX, ev.clientY, entity) : null)

  const bar = () => document.querySelector<HTMLElement>('.hotbar')
  const slots = () => [...(bar()?.querySelectorAll<HTMLElement>('.hotbar-slot') ?? [])]
  const over = (ev: PointerEvent) => {
    const r = bar()?.getBoundingClientRect()
    return !!r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 12 && ev.clientY <= r.bottom
  }

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      ghost = row.cloneNode(true) as HTMLElement
      ghost.removeAttribute('id')
      ghost.classList.add('drag-ghost')
      ghost.style.width = `${grab.width}px`
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
    }
    ghost.style.left = `${ev.clientX - (startX - grab.left)}px`
    ghost.style.top = `${ev.clientY - (startY - grab.top)}px`
    const b = bar()
    if (b) b.dataset.dropping = String(over(ev))
    if (over(ev)) marker.show(slots(), indexAmong(slots(), 'x', ev))
    else marker.hide()
    mark(elsewhere(ev))
  }

  function end(ev: PointerEvent, commit: boolean) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    marker.hide()
    delete bar()?.dataset.dropping
    mark(null)
    if (!ghost) return
    ghost.remove()
    document.documentElement.classList.remove('is-reordering')
    // The click that ends a drag is not a press on the row.
    const swallow = (c: Event) => c.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    if (commit && over(ev)) onDrop(indexAmong(slots(), 'x', ev))
    const target = commit ? elsewhere(ev) : null
    if (target && entity) dropOn(target, entity, ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
