import { zoomAt } from "../camera";
import type { Gesture, ToolContext, ToolPress } from "./types";

/** The Pan tool, the middle button, or Space held: dragging moves the view. */
export const pan: ToolPress = (c, _e, _world, start) => {
  const cam = c.renderer.camera;
  return {
    kind: "pan",
    cursor: "grabbing",
    move(_e, _world, screen) {
      c.renderer.setCamera({
        ...cam,
        x: cam.x + screen.x - start.x,
        y: cam.y + screen.y - start.y,
      });
    },
  };
};

/** Two fingers down: they pan and zoom the view together, whatever the tool. */
export function pinch(c: ToolContext): Gesture {
  const [a, b] = [...c.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
  const startDist = Math.hypot(a.x - b.x, a.y - b.y);
  const startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cam = c.renderer.camera;
  return {
    kind: "pinch",
    cursor: "grabbing",
    move() {
      const [a, b] = [...c.pointers.values()];
      if (!a || !b) return;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const panned = {
        ...cam,
        x: cam.x + mid.x - startMid.x,
        y: cam.y + mid.y - startMid.y,
      };
      c.renderer.setCamera(zoomAt(panned, mid, dist / startDist));
    },
  };
}
