/** Suppress the click synthesized after a completed drag. */
export function suppressNextClick() {
  const swallow = (event: Event) => event.stopPropagation();
  globalThis.addEventListener("click", swallow, { capture: true, once: true });
  globalThis.setTimeout(() => globalThis.removeEventListener("click", swallow, true), 0);
}
