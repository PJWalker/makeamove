let lastPosition: { x: number; y: number } | undefined;

function rememberPointer(event: PointerEvent) {
  lastPosition = { x: event.clientX, y: event.clientY };
}

if (typeof window !== "undefined") {
  window.addEventListener("pointermove", rememberPointer, { passive: true });
  window.addEventListener("pointerdown", rememberPointer, { passive: true });
}

export function lastPointer() {
  return lastPosition;
}

/**
 * Follow a press that may become a drag. Once the pointer has travelled
 * `threshold` px, `lift` runs, then `move` on every move (the lifting one
 * included). Releasing ends it with `commit`, a cancelled pointer without;
 * `lifted` says whether it ever became a drag, so a press that stayed put
 * can be left to click.
 */
export function followPress(
  down: Pick<PointerEvent, "clientX" | "clientY">,
  threshold: number,
  on: {
    lift: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    end: (e: PointerEvent, commit: boolean, lifted: boolean) => void;
  },
) {
  const startX = down.clientX;
  const startY = down.clientY;
  let lifted = false;
  const move = (e: PointerEvent) => {
    if (!lifted) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < threshold) return;
      lifted = true;
      on.lift(e);
    }
    on.move(e);
  };
  const end = (e: PointerEvent, commit: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    on.end(e, commit, lifted);
  };
  const up = (e: PointerEvent) => end(e, true);
  const cancel = (e: PointerEvent) => end(e, false);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

/**
 * Follow the pointer for a drag that resizes or moves something. While it
 * runs, the whole page shows `cursor` (so it doesn't flicker when the pointer
 * outruns the handle) and text selection is off. It ends on release, on a
 * cancelled pointer, or when the window loses focus mid-drag; `onEnd` runs
 * once then, with the event that ended it (none if ended early). Returns a
 * function that ends it early.
 */
export function trackPointer(
  cursor: string,
  onMove: (e: PointerEvent) => void,
  onEnd?: (event?: Event) => void,
): () => void {
  const root = document.documentElement;
  root.style.setProperty("--drag-cursor", cursor);
  root.classList.add("is-dragging");
  const ends = ["pointerup", "pointercancel", "blur"] as const;
  let done = false;
  const stop = (event?: Event) => {
    if (done) return;
    done = true;
    window.removeEventListener("pointermove", onMove);
    for (const type of ends) window.removeEventListener(type, stop);
    root.classList.remove("is-dragging");
    root.style.removeProperty("--drag-cursor");
    onEnd?.(event);
  };
  window.addEventListener("pointermove", onMove);
  for (const type of ends) window.addEventListener(type, stop);
  return () => stop();
}
