/** The box of an element that's at least partly in the window, or null when it isn't. */
export function onScreenRect(el: Element | null | undefined): DOMRect | null {
  const r = el?.isConnected ? el.getBoundingClientRect() : null;
  if (!r) return null;
  const visible =
    r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
  return visible ? r : null;
}
