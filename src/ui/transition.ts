const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

let running = 0

/**
 * Whether a view transition is under way. Starting one moves hit testing to
 * the root, which fires pointerout/over without the pointer moving; hover
 * effects should ignore those.
 */
export const inTransition = () => running > 0

/** Let Preact flush the renders queued by a state change. */
const nextRender = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

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
  { rootClass }: { rootClass?: string | string[] } = {},
): Promise<void> {
  if (!document.startViewTransition || reducedMotion.matches) {
    await update()
    await nextRender()
    return
  }
  // A class on <html> for the transition's lifetime lets CSS name extra
  // elements just for this kind of transition.
  const root = document.documentElement
  const classes = rootClass ? [rootClass].flat() : []
  root.classList.add(...classes)
  running++
  try {
    const t = document.startViewTransition(async () => {
      await update()
      await nextRender()
    })
    // A newer transition skips this one; that's expected, not an error.
    await t.finished.catch(() => {})
  } finally {
    running--
    root.classList.remove(...classes)
  }
}

/** Resolve once `check` passes, or after `timeout` ms, whichever is first. */
export function until(check: () => boolean, timeout = 1500): Promise<void> {
  const start = performance.now()
  return new Promise((resolve) => {
    const poll = () => {
      // Timers, not rAF: rendering is paused while a transition's update runs.
      if (check() || performance.now() - start > timeout) resolve()
      else setTimeout(poll, 16)
    }
    poll()
  })
}
