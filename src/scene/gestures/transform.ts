import { toScreen } from "../camera";
import { snapSize  } from "../grid";
import type {Point} from "../grid";
import {
  CORNER_SIGNS,
  
  corners,
  fromLocal,
  resizeFromCorner,
  rotationTowards
} from "../geometry";
import type {Corner} from "../geometry";
import { HANDLE_SIZE,  lightHandles, rotateHandlePosition } from "../render/handles";
import type {LightPart} from "../render/handles";
import type { LightElement, SceneElement, Transform } from "../types";
import type { Gesture, ToolContext } from "./types";

/*
 * Dragging a selection's handles: a corner resizes, the knob rotates (a
 * multi-selection as a group), and a light's handles set its reach.
 */

export type Handle =
  { kind: "corner"; corner: Corner } | { kind: "light"; part: LightPart } | { kind: "rotate" };

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
  const near = (p: Point) => Math.hypot(screen.x - p.x, screen.y - p.y) <= reach;
  if (group) return near(rotateHandlePosition(group, cam)) ? { kind: "rotate" } : null;
  if (!handles || selected.length !== 1) return null;
  const element = selected[0]!;
  if (element.type === "light") {
    const under = lightHandles(element, cam).filter((h) => near(h.at));
    // The lamp's own handle can sit under a ring's when the light is small; the rings win.
    const h = under.find((h) => h.part !== "lamp") ?? under[0];
    return h ? { kind: "light", part: h.part } : null;
  }
  if (near(rotateHandlePosition(element, cam))) return { kind: "rotate" };
  const corner = corners(element).findIndex((p) => near(toScreen(cam, p)));
  return corner === -1 ? null : { kind: "corner", corner: corner as Corner };
}

/** The cursor over a handle of `el`. */
export function handleCursor(element: Transform, handle: Handle): string {
  if (handle.kind === "rotate") return "grab";
  if (handle.kind === "light") return LIGHT_CURSORS[handle.part];
  // A resize cursor that matches the corner's direction once rotated.
  const turns = Math.round(element.rot / (Math.PI / 2));
  return RESIZE_CURSORS[(((handle.corner + turns) % 4) + 4) % 4]!;
}

/** Start dragging the handle pressed: of the group frame if there is one, else of the one selected element. */
export function startHandleDrag(c: ToolContext, handle: Handle, world: Point): Gesture | null {
  const {group} = c.renderer.overlayState;
  if (group) return rotateGroup(c, group, world);
  const element = c.selected()[0]!;
  if (handle.kind === "rotate") return rotate(c, element);
  if (handle.kind === "light") return element.type === "light" ? light(c, element, handle.part) : null;
  return resize(c, element, handle.corner);
}

function resize(c: ToolContext, element: SceneElement, corner: Corner): Gesture {
  return {
    kind: "resize",
    keepsHandles: true,
    move(e, world) {
      let t: Transform;
      if (element.type === "token") {
        const raw = resizeFromCorner(element, corner, world, true);
        const size = e.altKey ? raw.w : snapSize(c.renderer.grid, raw.w);
        t = resizeToSize(element, corner, size, size);
      } else {
        // Images keep their shape unless Shift is held; drawings the reverse.
        const keepAspect = element.type === "map" ? !e.shiftKey : e.shiftKey;
        t = resizeFromCorner(element, corner, world, keepAspect);
      }
      c.renderer.previews.set(element.id, { ...element, ...t });
      c.renderer.invalidate("previews", "overlay");
    },
    end: () => { c.commitPreviews(); },
  };
}

function rotate(c: ToolContext, element: SceneElement): Gesture {
  return {
    kind: "rotate",
    keepsHandles: true,
    move(e, world) {
      // Shift snaps to 15° steps.
      const rot = rotationTowards(element, world, e.shiftKey ? 15 : 0);
      c.renderer.previews.set(element.id, { ...element, rot });
      c.renderer.invalidate("previews", "overlay");
    },
    end: () => { c.commitPreviews(); },
  };
}

function rotateGroup(c: ToolContext, frame: Transform, world: Point): Gesture {
  const originals = c.selected().filter((element) => !element.locked);
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
      for (const element of originals) {
        const dx = element.x - frame.x;
        const dy = element.y - frame.y;
        const rot = Math.atan2(Math.sin(element.rot + delta), Math.cos(element.rot + delta));
        c.renderer.previews.set(element.id, {
          ...element,
          x: frame.x + dx * cos - dy * sin,
          y: frame.y + dx * sin + dy * cos,
          rot,
        });
      }
      c.renderer.invalidate("previews");
      c.updateOverlay();
    },
    end: () => { c.commitPreviews(); },
  };
}

function light(c: ToolContext, element: LightElement, part: LightPart): Gesture {
  return {
    kind: "light",
    keepsHandles: true,
    move(e, world) {
      c.renderer.previews.set(element.id, dragLight(element, part, world, e.altKey, c.renderer.grid.size));
      c.renderer.invalidate("previews", "overlay");
    },
    end() {
      const light = c.renderer.previews.get(element.id) as LightElement | undefined;
      c.renderer.previews.clear();
      if (light) {
        const { w, h, bright, dim } = light;
        c.scene.update([[light.id, { w, h, bright, dim }]]);
      }
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
  element: LightElement,
  part: LightPart,
  p: Point,
  free: boolean,
  cell: number,
): LightElement {
  const distribution = Math.hypot(p.x - element.x, p.y - element.y);
  if (part === "lamp") {
    const size = Math.max(8, distribution * 2);
    return { ...element, w: size, h: size };
  }
  const r = free ? distribution : Math.round(distribution / cell) * cell;
  if (part === "bright") {
    const bright = Math.max(0, r);
    return { ...element, bright, dim: Math.max(element.dim, bright) };
  }
  const dim = Math.max(free ? 8 : cell, r);
  return { ...element, dim, bright: Math.min(element.bright, dim) };
}

/** Resize to exactly w × h, keeping the corner opposite `corner` fixed. */
function resizeToSize(t: Transform, corner: Corner, w: number, h: number): Transform {
  const sign = CORNER_SIGNS[corner];
  const anchor = fromLocal(t, { x: (-sign.x * t.w) / 2, y: (-sign.y * t.h) / 2 });
  const centre = fromLocal({ ...t, ...anchor }, { x: (sign.x * w) / 2, y: (sign.y * h) / 2 });
  return { ...t, ...centre, w, h };
}
