/** Suppress the click synthesized after a completed drag. */
export function suppressNextClick() {
  const swallow = (event: Event) => event.stopPropagation();
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
}
