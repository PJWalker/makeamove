import { useCallback, useState } from "react";
import type { PaneLayout, PaneLevel } from "./TwoPane";
import { withTransition } from "./transition";

/**
 * Which level shows when they take turns, and how to move between them:
 * one at a time, the move slides; side by side, both already show. `show`
 * is `go` for callers that need to wait until the level is showing.
 */
export function usePaneLevel(layout: PaneLayout, initial: PaneLevel) {
  const [level, setLevel] = useState<PaneLevel>(initial);
  const show = useCallback(
    async (to: PaneLevel): Promise<void> => {
      if (level === to) return;
      if (layout.mode.value !== "stack") {
        setLevel(to);
        return;
      }
      const done = markSliding(layout.el);
      await withTransition(
        () => {
          setLevel(to);
        },
        { rootClass: to === "detail" ? "vt-pane-fwd" : "vt-pane-back" },
      ).finally(done);
    },
    [layout, level],
  );
  const go = useCallback((to: PaneLevel) => void show(to), [show]);
  return { level, go, show };
}

function markSliding(el: HTMLElement | null): () => void {
  if (!el) return () => {};
  el.dataset.sliding = "true";
  return () => delete el.dataset.sliding;
}
