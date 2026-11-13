/*
 * Pop-ups that grow out of whatever opened them, and open right there rather
 * than somewhere else on screen.
 *
 * Two ways to get there:
 *  - morphOpen(from, open): a shared-element view transition. The source (a
 *    menu item, a tooltip) and the dialog share a transition name, so the
 *    browser morphs one into the other's box and cross-fades them. `open`
 *    must remove the source and open the dialog with openPopup().
 *  - setMorphOrigin(from): just remember the rectangle. The next dialog
 *    opened with openPopup() starts as a strip that size and place, showing
 *    its top (the title, usually the item's label), and grows into its own
 *    box (FLIP on the dialog). For openers that can't use a transition.
 *
 * Any button, link or menu item that's clicked sets itself as the origin,
 * so a pop-up opened from a click grows out of what was clicked without its
 * opener doing anything. Openers with a better origin (a token, a tooltip)
 * set it after the click.
 *
 * Either way openPopup() places the dialog at the origin's top left.
 *
 * Going away is the reverse, as a view transition: leave() shrinks a pop-up
 * back into what opened it, if that's still on screen, or else fades it out,
 * shrinking slightly.
 */

import { until, withTransition } from "./transition";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/** An origin is only used by a dialog that opens soon after it was set. */
const ORIGIN_TTL_MS = 800;
const DURATION_MS = 240;
/** Room left around a growing dialog for its shadow (--window-shadow reaches 36px). */
const SHADOW_ROOM = 48;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

let origin: { rect: DOMRect; el: Element | null; at: number } | null = null;

/** Remember where the next pop-up is being opened from. */
export function setMorphOrigin(from: Element | DOMRect | null | undefined) {
  if (!from) {
    origin = null;
    return;
  }
  const el = from instanceof DOMRect ? null : from;
  origin = { rect: el?.getBoundingClientRect() ?? (from as DOMRect), el, at: performance.now() };
}

/** Where the next pop-up should open: over the thing that spawned it, if that was just now. */
export function originRect(): DOMRect | null {
  if (!origin || performance.now() - origin.at > ORIGIN_TTL_MS) return null;
  return origin.rect;
}

/** The controls that count as having spawned what opens from their click. */
const CONTROL = "button, a[href], [role=button], [role=menuitem], [role=option], [role=tab]";

document.addEventListener(
  "click",
  (e) => {
    const control = (e.target as Element | null)?.closest?.(CONTROL);
    if (control?.isConnected) setMorphOrigin(control);
  },
  { capture: true },
);

const MORPH_NAME = "popup-morph";
/** A shared-element morph is under way, waiting for its dialog to open. */
let morphing: { target: HTMLElement | null } | null = null;

/**
 * Open a pop-up out of `from` with a shared-element transition. `open` runs
 * inside the transition: it must take `from` away (close the menu, hide the
 * tooltip) and cause a dialog to open with openPopup(), synchronously or
 * from a layout effect, so the transition can catch it.
 */
export function morphOpen(from: Element, open: () => void) {
  setMorphOrigin(from);
  if (!document.startViewTransition || reducedMotion.matches || morphing) {
    open();
    return;
  }
  const source = from as HTMLElement;
  source.style.viewTransitionName = MORPH_NAME;
  const m = (morphing = { target: null as HTMLElement | null });
  void withTransition(
    async () => {
      source.style.removeProperty("view-transition-name");
      open();
      await until(() => !!m.target, 400);
    },
    { rootClass: "vt-popup" },
  ).finally(() => {
    if (m.target && m.target !== document.documentElement) {
      m.target.style.removeProperty("view-transition-name");
      delete m.target.dataset.morph;
    }
    if (morphing === m) morphing = null;
  });
}

/**
 * Called as a dialog shows: if a morph is waiting for a dialog, this is it.
 * Returns whether the transition will animate it.
 */
function claimMorph(dialog: HTMLElement): boolean {
  if (!morphing || morphing.target) return false;
  morphing.target = dialog;
  dialog.style.viewTransitionName = MORPH_NAME;
  // Skip the dialog's own fade-and-rise; the transition replaces it.
  dialog.dataset.morph = "true";
  origin = null;
  return true;
}

/** The pop-up a morph was opening is already open: let the transition finish now. */
export function releaseMorph() {
  if (morphing && !morphing.target) morphing.target = document.documentElement;
}

/** What each pop-up was opened from, to go back into when it closes. */
const spawners = new WeakMap<Element, Element>();

/**
 * Show a dialog out of where it was opened from: as the target of a
 * waiting shared-element morph, or else growing from a fresh origin.
 * `show` opens it and may place it before it grows.
 */
export function showFromOrigin(dialog: HTMLElement, show: () => void) {
  const from = hasFreshOrigin() || morphing ? origin?.el : null;
  if (from) spawners.set(dialog, from);
  else spawners.delete(dialog);
  const viewMorph = claimMorph(dialog);
  // Mark it before showing, so its own fade-in doesn't start underneath.
  if (hasFreshOrigin()) dialog.dataset.morph = "true";
  show();
  if (viewMorph) return;
  if (hasFreshOrigin()) growFrom(dialog, origin!.rect);
  origin = null;
}

/** Whether an element shown now would grow from an origin. */
function hasFreshOrigin(): boolean {
  return (
    !!origin &&
    performance.now() - origin.at <= ORIGIN_TTL_MS &&
    !reducedMotion.matches &&
    origin.rect.width >= 1
  );
}

/** The transform that lays `el` (at `d`) over `to`, showing only as much as fits. */
function overKeyframe(d: DOMRect, to: DOMRect): Keyframe {
  const scale = to.width / d.width;
  // Show only as much of the element as fits the target's height, at that scale.
  const hidden = Math.max(0, d.height - to.height / scale);
  return {
    transformOrigin: "0 0",
    transform: `translate(${to.left - d.left}px, ${to.top - d.top}px) scale(${scale})`,
    // Crop the element's bottom, but not its shadow.
    clipPath: `inset(${-SHADOW_ROOM}px ${-SHADOW_ROOM}px ${hidden}px ${-SHADOW_ROOM}px)`,
  };
}
const AT_REST: Keyframe = {
  transformOrigin: "0 0",
  transform: "none",
  clipPath: `inset(${-SHADOW_ROOM}px)`,
};

/** Grow an element that has just appeared out of `from` (FLIP on the element). */
export function growFrom(el: HTMLElement, from: Element | DOMRect) {
  if (reducedMotion.matches) return;
  const rect = from instanceof DOMRect ? from : from.getBoundingClientRect();
  if (rect.width < 1) return;
  // Skip the element's own fade-and-rise; this animation replaces it.
  el.dataset.morph = "true";
  const anim = el.animate(
    [
      { ...overKeyframe(el.getBoundingClientRect(), rect), opacity: 0.5 },
      { opacity: 1, offset: 0.35 },
      { ...AT_REST, opacity: 1 },
    ],
    { duration: DURATION_MS, easing: EASE },
  );
  anim.finished.catch(() => {}).finally(() => delete el.dataset.morph);
}

/** Whether `el` is on screen to morph into. */
function onScreen(el: Element | undefined): el is Element {
  if (!el?.isConnected || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    return false;
  const r = el.getBoundingClientRect();
  return r.width >= 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

/** What `el` was opened from, if it's still on screen to go back into. */
function spawnerOf(el: Element): Element | null {
  const s = spawners.get(el);
  return onScreen(s) ? s : null;
}

const LEAVE_NAME = "popup-leave";

/**
 * Take `el` away with a view transition: `finish` closes or removes it, and
 * its snapshot shrinks into `into` (by default what opened it) if that's on
 * screen, or else fades out, shrinking slightly. The change itself is
 * immediate; only the snapshot animates. Ignored while `el` is already leaving.
 */
export async function leave(
  el: HTMLElement,
  finish: () => void,
  into: Element | null = spawnerOf(el),
): Promise<void> {
  if (el.style.viewTransitionName === LEAVE_NAME) return;
  const target = onScreen(into ?? undefined) ? into : null;
  const ownName = el.style.viewTransitionName;
  el.style.viewTransitionName = LEAVE_NAME;
  await withTransition(
    async () => {
      el.style.viewTransitionName = ownName;
      finish();
      // Pop-ups close at once; React unmounts others on its next render.
      await until(() => !el.isConnected || !el.checkVisibility(), 300);
    },
    { rootClass: target ? "vt-leave-into" : "vt-leave", home: target },
  );
}
