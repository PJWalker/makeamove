import { snapSize, type Point } from "../grid";
import {
  CORNER_SIGNS,
  type Corner,
  corners,
  fromLocal,
  resizeFromCorner,
  rotationTowards,
} from "../geometry";
import { HANDLE_SIZE, type LightPart, lightHandles, rotateHandlePosition } from "../render/handles";
import type { LightElement, SceneElement, Transform } from "../types";
import type { Gesture, ToolContext } from "./types";

/*
 * Dragging a selection's handles: a corner resizes, the knob rotates (a
 * multi-selection as a group), and a light's handles set its reach.
 */

export type Handle =
  { kind: "corner"; corner: Corner } | { kind: "rotate" } | { kind: "light"; part: LightPart };

const RESIZE_CURSORS = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize"];

/** The cursor over each of a light's handles, which sit right, up-right and down-right of it. */
const LIGHT_CURSORS: Record<LightPart, string> = {
  lamp: "ew-resize",
  bright: "nesw-resize",
  dim: "nwse-resize",
};

/** The handle of the selection under a screen point, if any. */
export function handleAt(c: ToolContext, screen: Point): Handle | null {
  const { selected, handles, group } = c.renderer.overlayState;
  const cam = c.renderer.camera;
  const reach = HANDLE_SIZE / 2 + 4;
  if (group) {
    const knob = rotateHandlePosition(group, cam);
    return Math.hypot(screen.x - knob.x, screen.y - knob.y) <= reach ? { kind: "rotate" } : null;
  }
  if (!handles || selected.length !== 1) return null;
  const el = selected[0]!;
  if (el.type === "light") {
    const near = lightHandles(el, cam).filter(
      (h) => Math.hypot(screen.x - h.at.x, screen.y - h.at.y) <= reach,
    );
    // The lamp's own handle can sit under a ring's when the light is small; the rings win.
    const h = near.find((h) => h.part !== "lamp") ?? near[0];
    return h ? { kind: "light", part: h.part } : null;
  }
  const knob = rotateHandlePosition(el, cam);
  if (Math.hypot(screen.x - knob.x, screen.y - knob.y) <= reach) return { kind: "rotate" };
  const cs = corners(el);
  for (let i = 0; i < 4; i++) {
    const corner = cs[i]!;
    const p = {
      x: corner.x * cam.zoom + cam.x,
      y: corner.y * cam.zoom + cam.y,
    };
    if (Math.hypot(screen.x - p.x, screen.y - p.y) <= reach)
      return { kind: "corner", corner: i as Corner };
  }
  return null;
}

/** The cursor over a handle of `el`. */
export function handleCursor(el: Transform, handle: Handle): string {
  if (handle.kind === "rotate") return "grab";
  if (handle.kind === "light") return LIGHT_CURSORS[handle.part];
  // A resize cursor that matches the corner's direction once rotated.
  const turns = Math.round(el.rot / (Math.PI / 2));
  return RESIZE_CURSORS[(((handle.corner + turns) % 4) + 4) % 4]!;
}

/** Start dragging the handle pressed: of the group frame if there is one, else of the one selected element. */
export function startHandleDrag(c: ToolContext, handle: Handle, world: Point): Gesture | null {
  const group = c.renderer.overlayState.group;
  if (group) return rotateGroup(c, group, world);
  const el = c.selected()[0]!;
  if (handle.kind === "rotate") return rotate(c, el);
  if (handle.kind === "light") return el.type === "light" ? light(c, el, handle.part) : null;
  return resize(c, el, handle.corner);
}

function resize(c: ToolContext, el: SceneElement, corner: Corner): Gesture {
  return {
    kind: "resize",
    keepsHandles: true,
    move(e, world) {
      let t: Transform;
      if (el.type === "token") {
        const raw = resizeFromCorner(el, corner, world, true);
        const size = e.altKey ? raw.w : snapSize(c.renderer.grid, raw.w);
        t = resizeToSize(el, corner, size, size);
      } else {
        // Images keep their shape unless Shift is held; drawings the reverse.
        const keepAspect = el.type === "map" ? !e.shiftKey : e.shiftKey;
        t = resizeFromCorner(el, corner, world, keepAspect);
      }
      c.renderer.previews.set(el.id, { ...el, ...t });
      c.renderer.invalidate("previews", "overlay");
    },
    end: () => c.commitPreviews(),
  };
}

function rotate(c: ToolContext, el: SceneElement): Gesture {
  return {
    kind: "rotate",
    keepsHandles: true,
    move(e, world) {
      // Shift snaps to 15° steps.
      const rot = rotationTowards(el, world, e.shiftKey ? 15 : 0);
      c.renderer.previews.set(el.id, { ...el, rot });
      c.renderer.invalidate("previews", "overlay");
    },
    end: () => c.commitPreviews(),
  };
}

function rotateGroup(c: ToolContext, frame: Transform, world: Point): Gesture {
  const originals = c.selected().filter((el) => !el.locked);
  const startAngle = Math.atan2(world.y - frame.y, world.x - frame.x);
  let delta = 0;
  return {
    kind: "rotateGroup",
    groupFrame: () => ({ ...frame, rot: delta }),
    move(e, world) {
      delta = Math.atan2(world.y - frame.y, world.x - frame.x) - startAngle;
      // Shift snaps to 15° steps.
      if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      for (const el of originals) {
        const dx = el.x - frame.x;
        const dy = el.y - frame.y;
        const rot = Math.atan2(Math.sin(el.rot + delta), Math.cos(el.rot + delta));
        c.renderer.previews.set(el.id, {
          ...el,
          x: frame.x + dx * cos - dy * sin,
          y: frame.y + dx * sin + dy * cos,
          rot,
        });
      }
      c.renderer.invalidate("previews");
      c.updateOverlay();
    },
    end: () => c.commitPreviews(),
  };
}

function light(c: ToolContext, el: LightElement, part: LightPart): Gesture {
  return {
    kind: "light",
    keepsHandles: true,
    move(e, world) {
      c.renderer.previews.set(el.id, dragLight(el, part, world, e.altKey, c.renderer.grid.size));
      c.renderer.invalidate("previews", "overlay");
    },
    end() {
      const light = c.renderer.previews.get(el.id) as LightElement | undefined;
      c.renderer.previews.clear();
      if (light)
        c.scene.update([
          [
            light.id,
            {
              w: light.w,
              h: light.h,
              bright: light.bright,
              dim: light.dim,
            },
          ],
        ]);
      c.renderer.invalidate("elements", "overlay");
    },
  };
}

/**
 * A light with one of its handles dragged to p: the lamp's rim sizes the lamp
 * (softer or sharper shadows); the rings set how far bright and dim light
 * reach, in whole cells unless Alt is held. Dim light never falls short of bright.
 */
function dragLight(
  el: LightElement,
  part: LightPart,
  p: Point,
  free: boolean,
  cell: number,
): LightElement {
  const dist = Math.hypot(p.x - el.x, p.y - el.y);
  if (part === "lamp") {
    const size = Math.max(8, dist * 2);
    return { ...el, w: size, h: size };
  }
  const r = free ? dist : Math.round(dist / cell) * cell;
  if (part === "bright") {
    const bright = Math.max(0, r);
    return { ...el, bright, dim: Math.max(el.dim, bright) };
  }
  const dim = Math.max(free ? 8 : cell, r);
  return { ...el, dim, bright: Math.min(el.bright, dim) };
}

/** Resize to exactly w × h, keeping the corner opposite `corner` fixed. */
function resizeToSize(t: Transform, corner: Corner, w: number, h: number): Transform {
  const sign = CORNER_SIGNS[corner];
  const anchor = fromLocal(t, {
    x: (-sign.x * t.w) / 2,
    y: (-sign.y * t.h) / 2,
  });
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const lx = (sign.x * w) / 2;
  const ly = (sign.y * h) / 2;
  return {
    ...t,
    x: anchor.x + lx * c - ly * s,
    y: anchor.y + lx * s + ly * c,
    w,
    h,
  };
}
