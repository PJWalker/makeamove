import { bounds, contains } from "../geometry";
import type { Point } from "../grid";
import { moveSelection } from "./move";
import { handleAt, handleCursor, startHandleDrag } from "./transform";
import { dragged, type Gesture, type ToolContext, type ToolPress } from "./types";

/**
 * The Select tool (and the Lights tool's own): a press on a handle drags it,
 * on an element selects and moves it, and on empty map draws a marquee.
 * Double-clicking text changes it; while an action asks for targets, a click
 * on a token targets it instead.
 */
export const select: ToolPress = (c, e, world, screen) => {
  if (c.pressCount === 2) {
    const under = c.hitTest(world);
    if (under?.type === "text") {
      c.onTextRequest?.({
        at: { x: under.x, y: under.y },
        screen,
        id: under.id,
        text: under.text,
      });
      return null;
    }
  }
  const handle = handleAt(c, screen);
  if (handle) return startHandleDrag(c, handle, world);
  const under = c.hitTest(world);
  if (c.targetMode.value && under?.type === "token") {
    c.toggleTarget(under.id);
    return null;
  }
  // An unselected map is usually just the backdrop: dragging over it
  // draws a marquee, and a click selects it. Select it to move it.
  const hit =
    under && (under.type !== "map" || c.selection.value.includes(under.id)) ? under : null;
  if (!hit) {
    const base = e.shiftKey ? c.selection.value : [];
    const pick = under?.id ?? null;
    if (!pick) c.selection.value = base;
    return marquee(c, world, base, pick);
  }
  const sel = c.selection.value;
  if (e.shiftKey) {
    if (sel.includes(hit.id)) {
      c.selection.value = sel.filter((id) => id !== hit.id);
      return null;
    }
    c.selection.value = [...sel, hit.id];
  } else if (!sel.includes(hit.id)) {
    c.selection.value = [hit.id];
  }
  return moveSelection(c, world);
};

/** The cursor over the canvas while selecting, before any press: over a handle, or an element. */
export function hoverCursor(c: ToolContext, world: Point, screen: Point): string | undefined {
  const handle = handleAt(c, screen);
  if (handle) return handleCursor(c.selected()[0]!, handle);
  return c.hitTest(world) ? "move" : undefined;
}

/**
 * Selecting everything inside a dragged rectangle, added to `base`. A press
 * on an unselected map (`pick`) that doesn't become a drag selects the map.
 */
function marquee(c: ToolContext, start: Point, base: string[], pick: string | null): Gesture {
  let moved = !pick;
  return {
    kind: "marquee",
    marqueeRect: (hover) => ({
      x: Math.min(start.x, hover.x),
      y: Math.min(start.y, hover.y),
      w: Math.abs(hover.x - start.x),
      h: Math.abs(hover.y - start.y),
    }),
    move(_e, world) {
      if (!moved) {
        if (!dragged(c, start, world)) return;
        moved = true;
      }
      const rect = {
        x: Math.min(start.x, world.x),
        y: Math.min(start.y, world.y),
        w: Math.abs(world.x - start.x),
        h: Math.abs(world.y - start.y),
      };
      const inside = c
        .allElements()
        .flatMap((el) =>
          !el.locked && c.pickable(el) && contains(rect, bounds([el])!) ? [el.id] : [],
        );
      c.selection.value = [...new Set([...base, ...inside])];
      c.updateOverlay();
    },
    end() {
      // A click on a map, not a drag across it.
      if (!moved && pick) {
        c.selection.value = base.includes(pick)
          ? base.filter((id) => id !== pick)
          : [...base, pick];
      }
    },
  };
}
