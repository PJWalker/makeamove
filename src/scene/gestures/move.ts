import { snapPoint, type Point } from "../grid";
import type { SceneElement } from "../types";
import { dragged, type Gesture, type ToolContext } from "./types";

/**
 * Dragging the selection, its unlocked elements, from `start`. Tokens snap to
 * the grid. A lone token can be dropped on the table outside the scene, and a
 * press without a drag clicks it.
 */
export function moveSelection(c: ToolContext, start: Point): Gesture {
  const originals = new Map<string, SceneElement>(
    c.selected().flatMap((s) => (s.locked ? [] : [[s.id, s] as const])),
  );
  let moved = false;
  const lone = originals.size === 1 ? [...originals.values()][0]! : null;
  const token = lone?.type === "token" ? lone : null;
  return {
    kind: "move",
    move(e, world) {
      const dx = world.x - start.x;
      const dy = world.y - start.y;
      if (!moved && !dragged(c, start, world)) return;
      moved = true;
      const grid = c.renderer.grid;
      for (const [id, el] of originals) {
        let p = { x: el.x + dx, y: el.y + dy };
        // Tokens snap to the grid; hold Alt to place them freely.
        if (el.type === "token" && !e.altKey) p = snapPoint(grid, p, Math.round(el.w / grid.size));
        c.renderer.previews.set(id, { ...el, ...p });
      }
      c.renderer.invalidate("previews", "overlay");
      if (token?.itemDefId) c.onItemTokenDragMove?.(token, e);
      else if (token) c.onTokenDragMove?.(token, e);
    },
    end(e) {
      if (!moved) {
        if (token) c.onTokenClick?.(token);
        if (lone) return;
      } else if (token) {
        const handled = token.itemDefId
          ? (c.onItemTokenDrop?.(token, e) ?? false)
          : (c.onTokenDrop?.(token, e) ?? false);
        if (token.itemDefId) c.onItemTokenDragMove?.(null, e);
        else c.onTokenDragMove?.(null, e);
        if (handled) {
          c.renderer.invalidate("previews", "overlay");
          return;
        }
      }
      c.commitPreviews();
    },
    cancel(e) {
      if (token?.itemDefId) {
        if (e) c.onItemTokenDragMove?.(null, e);
      } else if (moved && token) c.onTokenDragMove?.(null);
    },
  };
}
