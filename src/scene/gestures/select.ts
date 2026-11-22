import type { Rect } from "../camera";
import { bounds, contains } from "../geometry";
import type { Point } from "../grid";
import { moveSelection } from "./move";
import { editRequest } from "./text";
import { handleAt, handleCursor, startHandleDrag } from "./transform";
import { dragged    } from "./types";
import type {Gesture, ToolContext, ToolPress} from "./types";

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
      c.onTextRequest?.(editRequest(under));
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

/** The rectangle with corners at a and b. */
function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * Selecting everything inside a dragged rectangle, added to `base`. A press
 * on an unselected map (`pick`) that doesn't become a drag selects the map.
 */
function marquee(c: ToolContext, start: Point, base: string[], pick: string | null): Gesture {
  let moved = !pick;
  return {
    kind: "marquee",
    marqueeRect: (hover) => rectBetween(start, hover),
    move(_e, world) {
      if (!moved) {
        if (!dragged(c, start, world)) return;
        moved = true;
      }
      const rect = rectBetween(start, world);
      const inside = c
        .allElements()
        .flatMap((element) =>
          !element.locked && c.pickable(element) && contains(rect, bounds([element])!) ? [element.id] : [],
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
