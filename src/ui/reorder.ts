/*
 * Press-and-drag reordering for a row or column of items (sidebar tabs, tools,
 * hotbar slots). The pressed item is picked up as soon as the pointer moves
 * and follows it; a 3px white line shows where it would land. Releasing
 * commits, unless the pointer left the container, which is up to `outside`.
 */

export interface ReorderOptions {
  /** The press that starts it. The item is `e.currentTarget`. */
  event: PointerEvent
  /** Every item in the container, the pressed one included, in order. */
  items: () => HTMLElement[]
  axis: 'x' | 'y'
  /** Where the pointer counts as still inside; defaults to the items' bounds. */
  container?: HTMLElement | null
  /** Called on release inside, with the new position among the other items. */
  onDrop: (index: number) => void
  onLift?: () => void
  onEnd?: () => void
  /**
   * What leaving the container does: act as soon as the pointer is out
   * (the item is let go of), or when it is released out there. With none, a
   * release outside just puts the item back.
   */
  outside?: { when: 'move' | 'release'; run: (e: PointerEvent) => void }
}

const LIFT_DISTANCE = 3
const SLACK = 24

export function startReorder(o: ReorderOptions) {
  const { event: down, axis } = o
  if (down.button !== 0) return
  const el = down.currentTarget as HTMLElement
  const startX = down.clientX
  const startY = down.clientY
  let lifted = false

  const others = () => o.items().filter((i) => i !== el)
  const inside = (e: PointerEvent) => {
    const r = (o.container ?? el.parentElement)!.getBoundingClientRect()
    return e.clientX > r.left - SLACK && e.clientX < r.right + SLACK && e.clientY > r.top - SLACK && e.clientY < r.bottom + SLACK
  }

  const marker = dropLine(axis)
  const slot = (e: PointerEvent) => indexAmong(others(), axis, e)
  const showLine = (index: number) => marker.show(others(), index)

  function put() {
    marker.hide()
    el.classList.remove('reorder-lifted')
    el.style.translate = ''
  }

  function finish() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    document.documentElement.classList.remove('is-reordering')
    put()
    if (lifted) {
      // The click that ends a drag is not a press on the item.
      const swallow = (ev: Event) => ev.stopPropagation()
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      o.onEnd?.()
    }
  }

  function move(e: PointerEvent) {
    if (!lifted) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < LIFT_DISTANCE) return
      lifted = true
      el.classList.add('reorder-lifted')
      document.documentElement.classList.add('is-reordering')
      o.onLift?.()
    }
    el.style.translate = `${e.clientX - startX}px ${e.clientY - startY}px`
    if (inside(e)) {
      showLine(slot(e))
    } else {
      marker.hide()
      if (o.outside?.when === 'move') {
        finish()
        o.outside.run(e)
      }
    }
  }

  function up(e: PointerEvent) {
    const wasLifted = lifted
    const here = wasLifted && inside(e)
    const index = here ? slot(e) : -1
    finish()
    if (!wasLifted) return
    if (here) o.onDrop(index)
    else if (o.outside?.when === 'release') o.outside.run(e)
  }

  const cancel = () => finish()

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}

/** Where among `items` (in order) a pointer would drop: the count of items whose centre it has passed. */
export function indexAmong(items: HTMLElement[], axis: 'x' | 'y', e: PointerEvent) {
  const p = axis === 'x' ? e.clientX : e.clientY
  return items.filter((i) => {
    const r = i.getBoundingClientRect()
    return (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2) < p
  }).length
}

/** The 3px white line that marks a drop position between `items`. */
export function dropLine(axis: 'x' | 'y') {
  let line: HTMLElement | null = null
  return {
    show(items: HTMLElement[], index: number) {
      if (!items.length) return this.hide()
      const rects = items.map((i) => i.getBoundingClientRect())
      const lo = (r: DOMRect) => (axis === 'x' ? r.left : r.top)
      const hi = (r: DOMRect) => (axis === 'x' ? r.right : r.bottom)
      const at =
        index === 0 ? lo(rects[0]) - 2 : index === rects.length ? hi(rects[index - 1]) + 2 : (hi(rects[index - 1]) + lo(rects[index])) / 2
      const left = Math.min(...rects.map((r) => r.left))
      const right = Math.max(...rects.map((r) => r.right))
      const top = Math.min(...rects.map((r) => r.top))
      const bottom = Math.max(...rects.map((r) => r.bottom))
      if (!line) {
        line = document.createElement('div')
        line.className = 'reorder-line'
        document.body.appendChild(line)
      }
      const s = line.style
      if (axis === 'x') {
        s.left = `${at - 1.5}px`
        s.top = `${top - 2}px`
        s.width = '3px'
        s.height = `${bottom - top + 4}px`
      } else {
        s.top = `${at - 1.5}px`
        s.left = `${left - 2}px`
        s.height = '3px'
        s.width = `${right - left + 4}px`
      }
    },
    hide() {
      line?.remove()
      line = null
    },
  }
}
