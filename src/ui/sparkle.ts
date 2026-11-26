/*
 * Press sparkle: clicking a raised control (by pointer or keyboard) marks it
 * with data-sparkle for one run of its edge glint (ui/sparkle.css). A quick
 * second click restarts the glint rather than waiting for the first to end.
 */

import replay from "./replay";
import { reducedMotion } from "./transition";

const SPARKLING = ".btn, .popup-tab, .campaign-open, .segment";
const GLINT = "edge-glint";

document.addEventListener(
  "click",
  (event) => {
    if (reducedMotion.matches || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(SPARKLING);
    if (!control || control.matches(":disabled, [data-disabled], [aria-disabled='true']")) return;
    replay(control, "sparkle");
  },
  { capture: true },
);

document.addEventListener(
  "animationend",
  (event) => {
    if (event.animationName === GLINT && event.target instanceof HTMLElement)
      delete event.target.dataset["sparkle"];
  },
  { capture: true },
);
