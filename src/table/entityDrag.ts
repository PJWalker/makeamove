import { addItem, setLearned, systemOf } from '../characters/api'
import type { LinkKind } from '../notes/api'
import type { Campaign } from '../store/campaign'
import { hideTooltip } from '../ui/Tooltip'

const THRESHOLD = 5

/**
 * Something that can be dragged out of a list, the command palette or a
 * note's link: onto a text editor to link to it, and for gear and moves,
 * onto a character to give it to them.
 */
export interface DragEntity {
  kind: LinkKind
  id: string
  label: string
  /** Give it to a character it's dropped on (items and moves only). */
  onCharacter?: (characterId: string) => void
}

/** An entity to drag: gear and moves can also be given to the character they're dropped on. */
export function entity(campaign: Campaign, kind: LinkKind, id: string, label: string): DragEntity {
  if (kind === 'item') {
    const def = systemOf(campaign).items.find((i) => i.id === id)
    return { kind, id, label, onCharacter: def && ((characterId) => addItem(campaign, characterId, def)) }
  }
  if (kind === 'move') return { kind, id, label, onCharacter: (characterId) => setLearned(campaign, characterId, id, true) }
  return { kind, id, label }
}

/** Editors that take a dropped entity as a link, by their element (marked `data-link-drop`). */
const linkDrops = new Map<Element, (entity: DragEntity, x: number, y: number) => void>()

/** Let an editor take dropped entities as links; returns a function that stops it. */
export function registerLinkDrop(el: HTMLElement, insert: (entity: DragEntity, x: number, y: number) => void) {
  el.dataset.linkDrop = 'true'
  linkDrops.set(el, insert)
  return () => {
    delete el.dataset.linkDrop
    linkDrops.delete(el)
  }
}

/**
 * Where an entity would land at a point: an editor that links it, or a
 * character that takes it (any element with `data-item-drop` or
 * `data-move-drop` holding the character's id).
 */
export function dropTargetAt(x: number, y: number, entity: DragEntity): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  const editor = el?.closest<HTMLElement>('[data-link-drop]')
  if (editor && linkDrops.has(editor)) return editor
  if (entity.onCharacter && (entity.kind === 'item' || entity.kind === 'move')) return el?.closest<HTMLElement>(`[data-${entity.kind}-drop]`) ?? null
  return null
}

/** Drop an entity on a target from dropTargetAt; it flashes to say it landed. */
export function dropOn(target: HTMLElement, entity: DragEntity, x: number, y: number) {
  const link = linkDrops.get(target)
  if (link) link(entity, x, y)
  else {
    const characterId = target.dataset[entity.kind === 'item' ? 'itemDrop' : 'moveDrop']
    if (!characterId) return
    entity.onCharacter?.(characterId)
  }
  target.dataset.dropped = 'true'
  setTimeout(() => delete target.dataset.dropped, 600)
}

/** Marks the target under the pointer while dragging. */
export function dropMarker() {
  let target: HTMLElement | null = null
  return (next: HTMLElement | null) => {
    if (next === target) return
    delete target?.dataset.dropping
    target = next
    if (target) target.dataset.dropping = 'true'
  }
}

/**
 * Drag an entity from a row (or a link chip): a small copy of it follows
 * the pointer, and releasing over a target drops it there. A press that
 * never moves far is left alone, so it still clicks.
 */
export function dragEntity(e: PointerEvent, entity: DragEntity, source = e.currentTarget as HTMLElement) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  let ghost: HTMLElement | null = null
  const mark = dropMarker()

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      // Just the name and icon, not the row's buttons.
      const pick = source.querySelector('.list-pick') ?? source
      ghost = pick.cloneNode(true) as HTMLElement
      ghost.className = 'drag-ghost item-ghost bevel'
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
      hideTooltip()
    }
    // Beside the pointer, so it doesn't hide what it's over.
    ghost.style.left = `${ev.clientX + 12}px`
    ghost.style.top = `${ev.clientY + 8}px`
    mark(dropTargetAt(ev.clientX, ev.clientY, entity))
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
    const target = commit ? dropTargetAt(ev.clientX, ev.clientY, entity) : null
    if (target) dropOn(target, entity, ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
