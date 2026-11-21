import { Graphics } from "pixi.js";
import { type Camera, type Rect, toScreen } from "../camera";
import { corners } from "../geometry";
import type { Point } from "../grid";
import { isPlainToken, type SceneElement, type Transform } from "../types";
import { HANDLE_SIZE, lightHandles, rotateHandlePosition } from "./handles";
import type { RenderState } from "./state";
import { ACCENT, INK } from "./style";

export interface OverlayState {
  selected: SceneElement[];
  /** Show resize and rotate handles (one unlocked element selected). */
  handles: boolean;
  /** Frame around a multi-selection, with a knob to rotate it as a group. */
  group: Transform | null;
  marquee: Rect | null;
  /** The eraser's reach, in world coordinates. */
  eraser: { p: Point; r: number } | null;
  /** The token this device's targets are measured from, if any. */
  rangeFrom: string | null;
}

/** A frame's corners on screen: top left, top right, bottom right, bottom left. */
function screenCorners(t: Transform, cam: Camera): Point[] {
  return corners(t).map((p) => toScreen(cam, p));
}

/** Draw the stem from the middle of a frame's top edge to its rotate knob; returns where the knob is. */
function drawKnobStem(g: Graphics, t: Transform, points: Point[], cam: Camera): Point {
  const [tl, tr] = points as [Point, Point];
  const knob = rotateHandlePosition(t, cam);
  g.moveTo((tl.x + tr.x) / 2, (tl.y + tr.y) / 2)
    .lineTo(knob.x, knob.y)
    .stroke({ color: ACCENT, width: 2 });
  return knob;
}

/** The selection, its handles, the marquee and the eraser, in screen space. */
export class OverlayLayer {
  readonly view = new Graphics();

  constructor(private readonly state: RenderState) {}

  draw(o: OverlayState) {
    const s = this.state;
    const g = this.view.clear();
    const { selected, handles, group, marquee, eraser } = o;
    const cam = s.camera;

    for (const element of selected) {
      const t = s.previews.get(element.id) ?? element;
      if ((element.type === "token" && !isPlainToken(element)) || element.type === "light") {
        const c = toScreen(cam, t);
        g.circle(c.x, c.y, (Math.min(t.w, t.h) / 2) * cam.zoom + 3);
      } else {
        g.poly(screenCorners(t, cam));
      }
      g.stroke({
        color: element.locked ? 0xFF_FF_FF : ACCENT,
        alpha: element.locked ? 0.5 : 1,
        width: 2,
      });
    }

    const selectedElement = selected.length === 1 ? selected[0]! : undefined;
    if (handles && selectedElement?.type === "light") {
      const element = selectedElement;
      const light = { ...element, ...s.previews.get(element.id) } as typeof element;
      const c = toScreen(cam, light);
      for (const r of [light.bright, light.dim]) {
        g.circle(c.x, c.y, r * cam.zoom).stroke({
          color: ACCENT,
          alpha: 0.8,
          width: 1.5,
        });
      }
      for (const { at } of lightHandles(light, cam)) g.circle(at.x, at.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    } else if (handles && selected.length === 1) {
      const element = selected[0]!;
      const t = s.previews.get(element.id) ?? element;
      const points = screenCorners(t, cam);
      const knob = drawKnobStem(g, t, points, cam);
      for (const p of points) {
        g.rect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }
      g.circle(knob.x, knob.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    }

    if (group) {
      const points = screenCorners(group, cam);
      g.poly(points).stroke({
        color: ACCENT,
        alpha: 0.6,
        width: 1.5,
      });
      const knob = drawKnobStem(g, group, points, cam);
      g.circle(knob.x, knob.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    }

    if (marquee) {
      const a = toScreen(cam, marquee);
      g.rect(a.x, a.y, marquee.w * cam.zoom, marquee.h * cam.zoom)
        .fill({ color: ACCENT, alpha: 0.08 })
        .stroke({ color: ACCENT, alpha: 0.7, width: 1.5 });
    }

    if (eraser) {
      const c = toScreen(cam, eraser.p);
      g.circle(c.x, c.y, eraser.r * cam.zoom).stroke({
        color: 0xFF_FF_FF,
        alpha: 0.7,
        width: 1.5,
      });
    }
  }
}
