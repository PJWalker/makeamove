/*
 * Press sparkle: clicking a raised control (by pointer or keyboard) marks it
 * with data-sparkle for one run of its edge glint (ui/sparkle.css). A quick
 * second click restarts the glint rather than waiting for the first to end.
 */

const SPARKLING = ".btn, .popup-tab, .campaign-open, .segment, .pen-width, .pen-layer";
const GLINT = "edge-glint";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

document.addEventListener(
  "click",
  (event) => {
    if (reducedMotion.matches || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(SPARKLING);
    if (!control || control.matches(":disabled, [data-disabled], [aria-disabled='true']")) return;
    delete control.dataset.sparkle;
    // Flush the style so re-adding the attribute starts the animation over.
    void control.offsetWidth;
    control.dataset.sparkle = "";
  },
  { capture: true },
);

document.addEventListener(
  "animationend",
  (event) => {
    if (event.animationName === GLINT && event.target instanceof HTMLElement)
      delete event.target.dataset.sparkle;
  },
  { capture: true },
);
