/*
 * Where floating things go next to what they belong to (menus, lists that
 * drop down under text, pop-ups growing out of a button). The rule for all
 * of them: open below the anchor; if there isn't room below, open above it
 * (or wherever has more room); and stay wholly inside the window.
 */

const MARGIN = 8

export interface Anchor {
  left: number
  top: number
  bottom: number
}

/**
 * Place `el` (position: fixed) against `anchor`: its left edge at the
 * anchor's, `gap` px below it, or above it when it won't fit below.
 * Returns the side it went to.
 */
export function placeAnchored(el: HTMLElement, anchor: Anchor, gap = 6): 'below' | 'above' {
  const w = el.offsetWidth
  const h = el.offsetHeight
  const below = innerHeight - MARGIN - (anchor.bottom + gap)
  const above = anchor.top - gap - MARGIN
  const side = h <= below || below >= above ? 'below' : 'above'
  const y = side === 'below' ? anchor.bottom + gap : anchor.top - gap - h
  el.style.left = `${Math.round(Math.max(MARGIN, Math.min(anchor.left, innerWidth - w - MARGIN)))}px`
  el.style.top = `${Math.round(Math.max(MARGIN, Math.min(y, innerHeight - h - MARGIN)))}px`
  el.dataset.side = side
  return side
}

/** A point as an anchor, for menus opened where the pointer is. */
export const pointAnchor = (x: number, y: number): Anchor => ({ left: x, top: y, bottom: y })
