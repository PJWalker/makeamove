import { Container, Graphics, Text } from "pixi.js";
import { type Camera, type Rect, toScreen } from "../camera";
import { conditionContains, conditionLayout, hoverSpring } from "../conditionLayout";
import type { Point } from "../grid";
import type { TokenMarks } from "../tokenMarks";
import type { Transform } from "../types";
import type { RenderState } from "./state";
import { INK, reducedMotion } from "./style";

const NO_MARKS: TokenMarks = { pips: [], turn: false };
const PIP_MIN_R = 3;
const PIP_MAX_R = 6;
const TURN_COLOUR = 0xf0c23b;

interface ConditionView {
  text: Text;
  current: Rect;
  from: Rect;
  target: Rect;
  start: number;
  expanded: boolean;
}

/**
 * What marks each token: a pip per condition, which opens into its name on
 * hover or where there's room, and a ring on the one whose turn it is.
 */
export class ConditionLayer {
  readonly view = new Graphics();
  readonly texts = new Container();
  private hover: { id: string; anchor: number; bounds: Rect } | null = null;
  private views = new Map<string, ConditionView>();
  private camera: Camera | null = null;
  /** Whether a pip is still opening or closing, and needs more frames. */
  animating = false;
  /** Condition pips and the turn marker, by token. */
  marksFor: (tokenId: string, characterId?: string) => TokenMarks = () => NO_MARKS;

  constructor(private readonly state: RenderState) {}

  /** Draw the pips; turn rings go in `turns`, under them. */
  draw(turns: Graphics, pointer: Point | null, unseen: (t: Transform) => boolean) {
    const s = this.state;
    const now = performance.now();
    const still = reducedMotion();
    const cam = s.camera;
    const previousCamera = this.camera;
    const cameraChanged =
      previousCamera !== null &&
      (previousCamera.x !== cam.x ||
        previousCamera.y !== cam.y ||
        previousCamera.zoom !== cam.zoom);
    if (this.hover && previousCamera && cameraChanged) {
      this.hover.bounds.x += cam.x - previousCamera.x;
      this.hover.bounds.y += cam.y - previousCamera.y;
    }
    this.camera = { ...cam };
    const insets = s.insets();
    const viewport: Rect = {
      x: insets.left + 4,
      y: insets.top + 4,
      w: Math.max(1, s.size.width - insets.left - insets.right - 8),
      h: Math.max(1, s.size.height - insets.top - 8),
    };
    const tokens = s.elements.filter(
      (el) => el.type === "token" && !s.hidden.has(el.id) && !unseen(s.previews.get(el.id) ?? el),
    );
    const boxes = new Map(
      tokens.map((el) => {
        const t = s.previews.get(el.id) ?? el;
        const c = toScreen(cam, t);
        return [
          el.id,
          {
            x: c.x - (t.w * cam.zoom) / 2,
            y: c.y - (t.h * cam.zoom) / 2,
            w: t.w * cam.zoom,
            h: t.h * cam.zoom,
          },
        ] as const;
      }),
    );
    const used = new Set<string>();
    const plans = tokens.map((el) => {
      const marks = this.marksFor(el.id, el.type === "token" ? el.characterId : undefined);
      const t = s.previews.get(el.id) ?? el;
      const c = toScreen(cam, t);
      const half = (Math.max(t.w, t.h) * cam.zoom) / 2;
      if (marks.turn)
        turns.circle(c.x, c.y, half + 5).stroke({ color: TURN_COLOUR, width: 3, alpha: 0.95 });
      const radius = Math.round(Math.min(PIP_MAX_R, Math.max(PIP_MIN_R, half * 0.12)));
      const views = marks.pips.map((pip) => {
        const key = `${el.id}:${pip.id}`;
        used.add(key);
        let view = this.views.get(key);
        if (!view) {
          const text = new Text({
            text: pip.name,
            style: {
              fontFamily: "Cabin, sans-serif",
              fontSize: 12,
              fontWeight: "700",
              fill: INK,
              wordWrap: true,
              breakWords: true,
              wordWrapWidth: Math.max(1, viewport.w - 16),
            },
            resolution: 2,
          });
          const initial = {
            x: c.x - radius,
            y: boxes.get(el.id)!.y - radius,
            w: radius * 2,
            h: radius * 2,
          };
          view = {
            text,
            current: initial,
            from: initial,
            target: initial,
            start: now,
            expanded: false,
          };
          this.views.set(key, view);
          this.texts.addChild(text);
        }
        if (view.text.text !== pip.name) view.text.text = pip.name;
        view.text.style.wordWrapWidth = Math.max(1, viewport.w - 16);
        view.text.scale.set(1);
        return view;
      });
      const layout = conditionLayout({
        x: c.x,
        y: boxes.get(el.id)!.y,
        tokenWidth: t.w * cam.zoom,
        radius,
        labels: views.map((view) => ({ w: view.text.width + 16, h: view.text.height + 8 })),
        viewport,
        obstacles: [...boxes.entries()].filter(([id]) => id !== el.id).map(([, box]) => box),
      });
      return { id: el.id, marks, views, layout, radius };
    });
    let hovered =
      this.hover && pointer && conditionContains(this.hover.bounds, pointer.x, pointer.y)
        ? this.hover
        : null;
    if (hovered && !plans.some((plan) => plan.id === hovered?.id && plan.views.length))
      hovered = null;
    if (!hovered && pointer) {
      for (const plan of plans) {
        if (plan.layout.inline) continue;
        const anchor = plan.layout.collapsed.findIndex(
          (box) =>
            Math.hypot(pointer.x - box.x - box.w / 2, pointer.y - box.y - box.h / 2) <=
            plan.radius + 2,
        );
        if (anchor >= 0) hovered = { id: plan.id, anchor, bounds: plan.layout.collapsed[anchor]! };
      }
    }
    this.hover = hovered;
    this.view.clear();
    this.animating = false;
    const ordered = [
      ...plans.filter((plan) => plan.id !== hovered?.id),
      ...plans.filter((plan) => plan.id === hovered?.id),
    ];
    for (const plan of ordered) {
      const expanded = plan.layout.inline || plan.id === hovered?.id;
      let targets = plan.layout.inline ? plan.layout.horizontal : plan.layout.collapsed;
      if (!plan.layout.inline && plan.id === hovered?.id) {
        const box = boxes.get(plan.id)!;
        targets = conditionLayout({
          x: box.x + box.w / 2,
          y: box.y,
          tokenWidth: box.w,
          radius: plan.radius,
          labels: plan.views.map((view) => ({ w: view.text.width + 16, h: view.text.height + 8 })),
          viewport,
          obstacles: [],
        }).vertical;
        const all = [...targets, ...plan.layout.collapsed];
        const left = Math.min(...all.map((box) => box.x));
        const top = Math.min(...all.map((box) => box.y));
        hovered.bounds = {
          x: left,
          y: top,
          w: Math.max(...all.map((box) => box.x + box.w)) - left,
          h: Math.max(...all.map((box) => box.y + box.h)) - top,
        };
      }
      for (const [index, view] of plan.views.entries()) {
        const target = targets[index]!;
        if (view.expanded !== expanded && !cameraChanged) {
          view.from = view.current;
          view.target = target;
          view.expanded = expanded;
          view.start =
            now + (expanded ? Math.min(100, Math.abs(index - (hovered?.anchor ?? 0)) * 18) : 0);
        } else if (view.expanded !== expanded) {
          view.from = view.current = view.target = target;
          view.expanded = expanded;
          view.start = now - 320;
        } else {
          const relocate = (box: Rect): Rect => ({
            x: box.x + target.x - view.target.x,
            y: box.y + target.y - view.target.y,
            w: box.w + target.w - view.target.w,
            h: box.h + target.h - view.target.h,
          });
          view.from = relocate(view.from);
          view.current = relocate(view.current);
          view.target = target;
        }
        const progress = still ? 1 : Math.min(1, Math.max(0, (now - view.start) / 320));
        const spring = hoverSpring(progress);
        const mix = (key: keyof Rect) =>
          view.from[key] + (view.target[key] - view.from[key]) * spring;
        const current = {
          x: mix("x"),
          y: mix("y"),
          w: Math.max(1, mix("w")),
          h: Math.max(1, mix("h")),
        };
        view.current = current;
        if (progress < 1) this.animating = true;
        if (!expanded && progress === 1)
          this.view.circle(current.x + current.w / 2, current.y + current.h / 2, current.w / 2);
        else
          this.view.roundRect(
            current.x,
            current.y,
            current.w,
            current.h,
            Math.min(expanded ? 4 : plan.radius, current.h / 2),
          );
        this.view
          .fill({ color: plan.marks.pips[index]!.colour })
          .stroke({ color: INK, width: 1.5 });
        const scale = Math.max(
          0,
          Math.min(1, (current.w - 16) / view.text.width, (current.h - 8) / view.text.height),
        );
        view.text.scale.set(scale);
        view.text.alpha = Math.min(1, Math.max(0, (scale - 0.4) / 0.6));
        view.text.visible = view.text.alpha > 0;
        view.text.position.set(current.x + 8, current.y + (current.h - view.text.height) / 2);
        if (plan.id === hovered?.id)
          this.texts.setChildIndex(view.text, this.texts.children.length - 1);
      }
    }
    for (const [key, view] of this.views) {
      if (used.has(key)) continue;
      view.text.destroy();
      this.views.delete(key);
    }
  }
}
