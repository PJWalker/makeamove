import { hits } from "../geometry";
import type { Point } from "../grid";
import { ERASER_RADIUS } from "../tools";
import { coalesced, type ToolPress } from "./types";

/** The Eraser: strokes it passes over hide at once, and go when it lifts. */
export const erase: ToolPress = (c, _e, world) => {
  /** Each stroke passed over, and how to show it again. */
  const erased = new Map<string, () => void>();
  const at = (p: Point) => {
    const r = ERASER_RADIUS / c.renderer.camera.zoom;
    for (const el of c.allElements()) {
      if (el.type !== "drawing" || el.locked || erased.has(el.id)) continue;
      if (hits(el, p, r)) erased.set(el.id, c.hide(el.id));
    }
  };
  const showAll = () => {
    for (const show of erased.values()) show();
  };
  at(world);
  return {
    kind: "erase",
    move(e) {
      for (const [, p] of coalesced(c, e)) at(p);
      c.updateOverlay();
    },
    end() {
      if (erased.size) c.scene.remove([...erased.keys()]);
      showAll();
    },
    cancel: showAll,
  };
};
