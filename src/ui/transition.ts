const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

let running = 0;

/**
 * Whether a view transition is under way. Starting one moves hit testing to
 * the root, which fires pointerout/over without the pointer moving; hover
 * effects should ignore those.
 */
export const inTransition = () => running > 0;

/** Let React flush the renders queued by a state change. */
const nextRender = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}

interface ViewTransitionHost {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
}

/**
 * Apply a UI state change as a view transition. Elements with a
 * `view-transition-name` morph between their old and new geometry; the rest
 * of the page updates in place (the root itself is not captured).
 *
 * Falls back to an instant update without the API or with reduced motion.
 * Resolves once the new state is showing and any animation has finished.
 */
export async function withTransition(
  update: () => void | Promise<void>,
  {
    rootClass,
    scope,
    home,
  }: {
    rootClass?: string | string[];
    scope?: HTMLElement;
    /**
     * Something a snapshot grows from or shrinks into without itself being
     * captured, so it stays in place: its box is --vt-home-x/y/w/h on <html>
     * for the transition's keyframes (vt-from-home, vt-to-home).
     */
    home?: Element | null;
  } = {},
): Promise<void> {
  const host = (scope ?? document) as ViewTransitionHost;
  const startViewTransition = host.startViewTransition?.bind(host);
  if (!startViewTransition || reducedMotion.matches) {
    await update();
    await nextRender();
    return;
  }
  // A class on <html> for the transition's lifetime lets CSS name extra
  // elements just for this kind of transition.
  const root = document.documentElement;
  const classes = rootClass ? [rootClass].flat() : [];
  root.classList.add(...classes);
  const box = home?.getBoundingClientRect();
  if (box) {
    root.style.setProperty("--vt-home-x", `${box.left}px`);
    root.style.setProperty("--vt-home-y", `${box.top}px`);
    root.style.setProperty("--vt-home-w", `${box.width}px`);
    root.style.setProperty("--vt-home-h", `${box.height}px`);
  }
  running++;
  try {
    const t = startViewTransition(async () => {
      await update();
      await nextRender();
    });
    // A newer transition skips this one; that's expected, not an error.
    t.ready.catch(() => {});
    await t.finished.catch(() => {});
  } finally {
    running--;
    root.classList.remove(...classes);
    if (box) for (const v of ["x", "y", "w", "h"]) root.style.removeProperty(`--vt-home-${v}`);
  }
}

/** Resolve once `check` passes, or after `timeout` ms, whichever is first. */
export function until(check: () => boolean, timeout = 1500): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const poll = () => {
      // Timers, not rAF: rendering is paused while a transition's update runs.
      if (check() || performance.now() - start > timeout) resolve();
      else setTimeout(poll, 16);
    };
    poll();
  });
}
