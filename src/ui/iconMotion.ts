/*
 * Icon motion: clicking a control (by pointer or keyboard) plays a short
 * animation on each of its icons, marking the icon's SVG with data-playing
 * (ui/iconMotion.css holds one animation per icon). A quick second click
 * starts it over; the mark comes off once the icon is still again.
 */

import { replay } from "./replay";
import { reducedMotion } from "./transition";

const CONTROLS =
  "button, a[href], [role='button'], [role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='option']";

document.addEventListener(
  "click",
  (event) => {
    if (reducedMotion.matches || !(event.target instanceof Element)) return;
    const control = event.target.closest(CONTROLS);
    if (!control || control.matches(":disabled, [data-disabled], [aria-disabled='true']")) return;
    for (const icon of control.querySelectorAll<SVGElement>("svg[data-icon]")) play(icon);
  },
  { capture: true },
);

/**
 * Its shapes sit in a mask, where animationend doesn't fire, so this waits
 * on the animations themselves. A replay cancels them, and the newer play
 * clears the mark instead.
 */
function play(icon: SVGElement) {
  replay(icon, "playing");
  const running = icon.getAnimations({ subtree: true });
  void Promise.allSettled(running.map((a) => a.finished)).then(() => {
    if (icon.getAnimations({ subtree: true }).length === 0) delete icon.dataset["playing"];
  });
}
