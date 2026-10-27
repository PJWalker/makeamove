/*
 * Speech bubbles that grow out of what they belong to and shrink back into it
 * (chat popups out of the Chat tab, a roll's prompt out of its button).
 */

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/** A bubble whose box is `box`, squeezed into `into`; without it, faded a little below itself. */
export function collapsedInto(box: DOMRect, into: DOMRect | null): Keyframe {
  if (!into) return { transform: 'translateY(12px)', opacity: 0 }
  const dx = into.left + into.width / 2 - (box.left + box.width / 2)
  const dy = into.top + into.height / 2 - (box.top + box.height / 2)
  return { transform: `translate(${dx}px, ${dy}px) scale(${into.width / box.width}, ${into.height / box.height})`, opacity: 0 }
}
