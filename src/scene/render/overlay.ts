import { Graphics } from "pixi.js";
import { type Rect, toScreen } from "../camera";
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

/** The selection, its handles, the marquee and the eraser, in screen space. */
export class OverlayLayer {
  readonly view = new Graphics();

  constructor(private readonly state: RenderState) {}

  draw(o: OverlayState) {
    const s = this.state;
    const g = this.view.clear();
    const { selected, handles, group, marquee, eraser } = o;
    const cam = s.camera;

    for (const el of selected) {
      const t = s.previews.get(el.id) ?? el;
      if ((el.type === "token" && !isPlainToken(el)) || el.type === "light") {
        const c = toScreen(cam, t);
        g.circle(c.x, c.y, (Math.min(t.w, t.h) / 2) * cam.zoom + 3);
      } else {
        g.poly(corners(t).map((p) => toScreen(cam, p)));
      }
      g.stroke({
        color: el.locked ? 0xffffff : ACCENT,
        alpha: el.locked ? 0.5 : 1,
        width: 2,
      });
    }

    const selectedElement = selected.length === 1 ? selected[0]! : undefined;
    if (handles && selectedElement?.type === "light") {
      const el = selectedElement;
      const light = { ...el, ...s.previews.get(el.id) } as typeof el;
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
      const el = selected[0]!;
      const t = s.previews.get(el.id) ?? el;
      const points = corners(t).map((p) => toScreen(cam, p));
      const tl = points[0]!;
      const tr = points[1]!;
      const br = points[2]!;
      const bl = points[3]!;
      const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const knob = rotateHandlePosition(t, cam);
      g.moveTo(top.x, top.y).lineTo(knob.x, knob.y).stroke({ color: ACCENT, width: 2 });
      for (const p of [tl, tr, br, bl]) {
        g.rect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }
      g.circle(knob.x, knob.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    }

    if (group) {
      const points = corners(group).map((p) => toScreen(cam, p));
      const tl = points[0]!;
      const tr = points[1]!;
      const br = points[2]!;
      const bl = points[3]!;
      const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const knob = rotateHandlePosition(group, cam);
      g.poly([tl, tr, br, bl]).stroke({
        color: ACCENT,
        alpha: 0.6,
        width: 1.5,
      });
      g.moveTo(top.x, top.y).lineTo(knob.x, knob.y).stroke({ color: ACCENT, width: 2 });
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
        color: 0xffffff,
        alpha: 0.7,
        width: 1.5,
      });
    }
  }
}
