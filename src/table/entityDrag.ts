import { addItem, setLearned, systemOf } from '../characters/api'
import { editHotbar, insertAt } from '../characters/hotbar'
import type { LinkKind } from '../notes/api'
import type { Campaign } from '../store/campaign'
import { dropLine, indexAmong } from '../ui/reorder'
import { hideTooltip } from '../ui/Tooltip'

const THRESHOLD = 5

/**
 * Something dragged out of a list, the command palette, the hotbar or a
 * note's link, and the places it can land: pinned to the hotbar, given to a
 * character (gear and moves), or linked in a note.
 */
export interface DragEntity {
  label: string
  /** Pin it to the hotbar at a position. */
  pin?: (index: number) => void
  /** Link to it from a note. */
  link?: { kind: LinkKind; id: string }
  /** Give it to the character it's dropped on. */
  give?: { kind: 'item' | 'move'; to: (characterId: string) => void }
}

/** The hotbar action for a link target, so it can be pinned (see actions/). */
const ACTION_PREFIX: Partial<Record<LinkKind, string>> = { move: 'move', item: 'library', character: 'character', scene: 'scene' }

/** An entity for a link target: anything links; most also pin; gear and moves can be given. */
export function entity(campaign: Campaign, kind: LinkKind, id: string, label: string): DragEntity {
  const prefix = ACTION_PREFIX[kind]
  const out: DragEntity = {
    label,
    link: { kind, id },
    pin: prefix ? (index) => void editHotbar(campaign, (slots) => insertAt(slots, `${prefix}:${id}`, index)) : undefined,
  }
  if (kind === 'item') {
    const def = systemOf(campaign).items.find((i) => i.id === id)
    if (def) out.give = { kind, to: (characterId) => addItem(campaign, characterId, def) }
  }
  if (kind === 'move') out.give = { kind, to: (characterId) => setLearned(campaign, characterId, id, true) }
  return out
}

/** An entity for a hotbar or palette action, by its id: links and gifts where it names a link target. */
export function actionEntity(campaign: Campaign, actionId: string, label: string): DragEntity {
  const i = actionId.indexOf(':')
  const prefix = actionId.slice(0, i)
  const kind = (Object.keys(ACTION_PREFIX) as LinkKind[]).find((k) => ACTION_PREFIX[k] === prefix)
  const pin = (index: number) => void editHotbar(campaign, (slots) => insertAt(slots, actionId, index))
  return kind ? { ...entity(campaign, kind, actionId.slice(i + 1), label), pin } : { label, pin }
}

/** Editors that take a dropped entity as a link, by their element (marked `data-link-drop`). */
const linkDrops = new Map<Element, (link: { kind: LinkKind; id: string; label: string }, x: number, y: number) => void>()

/** Let an editor take dropped entities as links; returns a function that stops it. */
export function registerLinkDrop(el: HTMLElement, insert: (link: { kind: LinkKind; id: string; label: string }, x: number, y: number) => void) {
  el.dataset.linkDrop = 'true'
  linkDrops.set(el, insert)
  return () => {
    delete el.dataset.linkDrop
    linkDrops.delete(el)
  }
}

const hotbar = () => document.querySelector<HTMLElement>('.hotbar')
const hotbarSlots = (except?: Element | null) => [...(hotbar()?.querySelectorAll<HTMLElement>('.hotbar-slot') ?? [])].filter((s) => s !== except)

/** Whether a point is over the hotbar (with a little room above it). */
export function overHotbar(x: number, y: number) {
  const r = hotbar()?.getBoundingClientRect()
  return !!r && x >= r.left && x <= r.right && y >= r.top - 12 && y <= r.bottom
}

/**
 * Where an entity would land at a point, other than the hotbar: an editor
 * that links it, or a character that takes it (any element with
 * `data-item-drop` or `data-move-drop` holding the character's id).
 */
export function dropTargetAt(x: number, y: number, entity: DragEntity): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  const editor = el?.closest<HTMLElement>('[data-link-drop]')
  if (entity.link && editor && linkDrops.has(editor)) return editor
  if (entity.give) return el?.closest<HTMLElement>(`[data-${entity.give.kind}-drop]`) ?? null
  return null
}

/** Drop an entity on a target from dropTargetAt; it flashes to say it landed. */
export function dropOn(target: HTMLElement, entity: DragEntity, x: number, y: number) {
  const link = linkDrops.get(target)
  if (link && entity.link) link({ ...entity.link, label: entity.label }, x, y)
  else if (entity.give) {
    const characterId = target.dataset[entity.give.kind === 'item' ? 'itemDrop' : 'moveDrop']
    if (!characterId) return
    entity.give.to(characterId)
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
 * the pointer; over the hotbar a line shows where it would be pinned, and
 * other targets are marked. Releasing drops it there. A press that never
 * moves far is left alone, so it still clicks.
 */
export function dragEntity(e: PointerEvent, entity: DragEntity, source = e.currentTarget as HTMLElement) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  let ghost: HTMLElement | null = null
  const mark = dropMarker()
  const line = dropLine('x')
  const onBar = (ev: PointerEvent) => !!entity.pin && overHotbar(ev.clientX, ev.clientY)

  function move(ev: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return
      // Just the name and icon, not the row's buttons or details.
      const pick = source.querySelector('.list-pick, .palette-title') ?? source
      ghost = pick.cloneNode(true) as HTMLElement
      ghost.removeAttribute('id')
      ghost.className = 'drag-ghost item-ghost bevel'
      document.body.appendChild(ghost)
      document.documentElement.classList.add('is-reordering')
      hideTooltip()
    }
    // Beside the pointer, so it doesn't hide what it's over.
    ghost.style.left = `${ev.clientX + 12}px`
    ghost.style.top = `${ev.clientY + 8}px`
    const bar = hotbar()
    if (onBar(ev)) {
      if (bar) bar.dataset.dropping = 'true'
      line.show(hotbarSlots(), indexAmong(hotbarSlots(), 'x', ev))
      mark(null)
    } else {
      if (bar) delete bar.dataset.dropping
      line.hide()
      mark(dropTargetAt(ev.clientX, ev.clientY, entity))
    }
  }

  function end(ev: PointerEvent, commit: boolean) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    mark(null)
    line.hide()
    const bar = hotbar()
    if (bar) delete bar.dataset.dropping
    if (!ghost) return
    ghost.remove()
    document.documentElement.classList.remove('is-reordering')
    // The click that ends a drag is not a press on the row.
    const swallow = (c: Event) => c.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    if (!commit) return
    if (onBar(ev)) return entity.pin!(indexAmong(hotbarSlots(), 'x', ev))
    const target = dropTargetAt(ev.clientX, ev.clientY, entity)
    if (target) dropOn(target, entity, ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => end(ev, true)
  const cancel = (ev: PointerEvent) => end(ev, false)

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}
