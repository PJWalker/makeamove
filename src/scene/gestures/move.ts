import { snapPoint, type Point } from "../grid";
import type { SceneElement, TokenElement } from "../types";
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
  // An item token's drag goes to the table's item handlers, any other token's to its token handlers.
  const showDrag = (t: TokenElement, dragging: boolean, e: PointerEvent) =>
    t.itemDefId
      ? c.onItemTokenDragMove?.(dragging ? t : null, e)
      : c.onTokenDragMove?.(dragging ? t : null, e);
  const drop = (t: TokenElement, e: PointerEvent) =>
    (t.itemDefId ? c.onItemTokenDrop?.(t, e) : c.onTokenDrop?.(t, e)) ?? false;
  return {
    kind: "move",
    move(e, world) {
      const dx = world.x - start.x;
      const dy = world.y - start.y;
      if (!moved && !dragged(c, start, world)) return;
      moved = true;
      const grid = c.renderer.grid;
      for (const [id, element] of originals) {
        let p = { x: element.x + dx, y: element.y + dy };
        // Tokens snap to the grid; hold Alt to place them freely.
        if (element.type === "token" && !e.altKey) p = snapPoint(grid, p, Math.round(element.w / grid.size));
        c.renderer.previews.set(id, { ...element, ...p });
      }
      c.renderer.invalidate("previews", "overlay");
      if (token) showDrag(token, true, e);
    },
    end(e) {
      if (!moved) {
        if (token) c.onTokenClick?.(token);
        if (lone) return;
      } else if (token) {
        const handled = drop(token, e);
        showDrag(token, false, e);
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
