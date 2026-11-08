/*
 * Floating things tethered to what they belong to (menus, lists that drop
 * down under text, the tooltip) with CSS anchor positioning: the browser
 * keeps them against their anchor, flips them when they won't fit, and
 * follows the anchor as it moves. Where each one goes is in its CSS
 * (`position-area`, `position-try-fallbacks`); `.drops-down` in popup.css
 * is the menu rule: below the anchor, left edges lined up, flipping above
 * or leftward when there isn't room.
 */

let count = 0;

function names(el: HTMLElement) {
  return el.style
    .getPropertyValue("anchor-name")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Anchor `el` (position: fixed, later in the document than `anchor` or in
 * the top layer) to `anchor`. Returns a function that lets go. An anchor
 * can hold several things at once.
 */
export function tether(el: HTMLElement, anchor: Element): () => void {
  const name = `--anchor-${++count}`;
  const target = anchor as HTMLElement;
  target.style.setProperty("anchor-name", [...names(target), name].join(", "));
  el.style.setProperty("position-anchor", name);
  return () => {
    const rest = names(target).filter((n) => n !== name);
    if (rest.length) target.style.setProperty("anchor-name", rest.join(", "));
    else target.style.removeProperty("anchor-name");
    if (el.style.getPropertyValue("position-anchor") === name)
      el.style.removeProperty("position-anchor");
  };
}
