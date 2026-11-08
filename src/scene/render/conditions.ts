import { Container, Graphics, Text } from "pixi.js";
import { type Camera, type Rect, toScreen } from "../camera";
import { conditionContains, conditionLayout, hoverSpring } from "../conditionLayout";
import { pointerToward, unionRect } from "../edgePin";
import type { Point } from "../grid";
import type { TokenMarks } from "../tokenMarks";
import type { Transform } from "../types";
import type { RenderState } from "./state";
import {
  drawPointer,
  INK,
  POINTER_ROOM,
  reducedMotion,
  screenViewport,
  TOKEN_NAME_STYLE,
} from "./style";

const NO_MARKS: TokenMarks = { pips: [], turn: false };
const PIP_MIN_R = 3;
const PIP_MAX_R = 6;
const TURN_COLOUR = 0xf0c23b;
/** How long a newly applied condition shows its name, in ms, before it closes to a pip. */
const ANNOUNCE_MS = 1800;
/** How long the ring that rings out from a newly applied condition takes, in ms. */
const PULSE_MS = 700;

interface ConditionView {
  text: Text;
  current: Rect;
  from: Rect;
  target: Rect;
  start: number;
  /** Whether it's showing its name, rather than a pip. */
  open: boolean;
  /** When it was applied, if since the token was first drawn; it shows its name for a moment. */
  appliedAt: number | null;
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
  /** Names of off-screen tokens, over the conditions they've just had applied. */
  private names = new Map<string, Text>();
  /** Off-screen tokens whose names head their conditions out at the edge: which condition it rides on, and where. */
  private pinnedNames = new Map<string, { view: ConditionView; offset: Point }>();
  /** Tokens drawn last frame: a condition new on one of these was just applied. */
  private drawnTokens = new Set<string>();
  /** Whose turn it was last frame, and when it became theirs, to ring it in. */
  private turn: { tokenId: string; since: number } | null = null;
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
    const viewport = screenViewport(s);
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
    const turnTokens: { id: string; x: number; y: number; r: number }[] = [];
    const plans = tokens.map((el) => {
      const marks = this.marksFor(el.id, el.type === "token" ? el.characterId : undefined);
      const t = s.previews.get(el.id) ?? el;
      const c = toScreen(cam, t);
      const half = (Math.max(t.w, t.h) * cam.zoom) / 2;
      if (marks.turn) turnTokens.push({ id: el.id, x: c.x, y: c.y, r: half + 5 });
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
          const applied = this.drawnTokens.has(el.id) && !still;
          // Just applied, it grows out of a point; otherwise it's simply there.
          const initial = applied
            ? { x: c.x, y: boxes.get(el.id)!.y, w: 0, h: 0 }
            : {
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
            open: false,
            appliedAt: applied ? now : null,
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
      const name = el.type === "token" && !el.hideName ? el.name.trim() : "";
      return { id: el.id, name, marks, views, layout, radius };
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
    this.drawTurns(turns, turnTokens, now, still);
    const announcing = (view: ConditionView) =>
      view.appliedAt !== null && now - view.appliedAt < ANNOUNCE_MS;
    for (const view of this.views.values()) {
      if (view.appliedAt !== null && !announcing(view) && now - view.appliedAt >= PULSE_MS)
        view.appliedAt = null;
    }
    const announces = (plan: (typeof plans)[number]) => plan.views.some(announcing);
    // Hovered on top, then those announcing a new condition.
    const ordered = [
      ...plans.filter((plan) => plan.id !== hovered?.id && !announces(plan)),
      ...plans.filter((plan) => plan.id !== hovered?.id && announces(plan)),
      ...plans.filter((plan) => plan.id === hovered?.id),
    ];
    const usedNames = new Set<string>();
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
      // Newly applied conditions show their names for a moment, stacked over the token.
      const announced = expanded ? [] : plan.views.filter(announcing);
      // Off screen, they show at the edge, under the token's name, pointing toward it.
      const box = boxes.get(plan.id)!;
      const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const offScreen = announced.length > 0 && !conditionContains(viewport, centre.x, centre.y);
      const name = offScreen ? this.nameText(plan.id, plan.name) : null;
      const stacked = conditionLayout({
        x: centre.x,
        y: box.y,
        tokenWidth: box.w,
        radius: plan.radius,
        labels: [
          ...(name ? [{ w: name.width, h: name.height }] : []),
          ...announced.map((view) => ({ w: view.text.width + 16, h: view.text.height + 8 })),
        ],
        // Room around them for the pointer.
        viewport: offScreen
          ? {
              x: viewport.x + POINTER_ROOM,
              y: viewport.y + POINTER_ROOM,
              w: Math.max(1, viewport.w - POINTER_ROOM * 2),
              h: Math.max(1, viewport.h - POINTER_ROOM * 2),
            }
          : viewport,
        obstacles: [],
      }).vertical;
      const announceTargets = name ? stacked.slice(1) : stacked;
      // The name rides on the first condition, flying out to the edge and back with it.
      if (name)
        this.pinnedNames.set(plan.id, {
          view: announced[0]!,
          offset: {
            x: stacked[0]!.x + stacked[0]!.w / 2 - announceTargets[0]!.x,
            y: stacked[0]!.y - announceTargets[0]!.y,
          },
        });
      if (announced.length) this.animating = true;
      for (const [index, view] of plan.views.entries()) {
        const announceAt = announced.indexOf(view);
        const open = expanded || announceAt >= 0;
        const target = announceAt >= 0 ? announceTargets[announceAt]! : targets[index]!;
        if (view.open !== open && !cameraChanged) {
          view.from = view.current;
          view.target = target;
          view.open = open;
          view.start =
            now +
            (open && plan.id === hovered?.id
              ? Math.min(100, Math.abs(index - hovered.anchor) * 18)
              : 0);
        } else if (view.open !== open) {
          view.from = view.current = view.target = target;
          view.open = open;
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
        if (!open && progress === 1)
          this.view.circle(current.x + current.w / 2, current.y + current.h / 2, current.w / 2);
        else
          this.view.roundRect(
            current.x,
            current.y,
            current.w,
            current.h,
            Math.min(open ? 4 : plan.radius, current.h / 2),
          );
        const colour = plan.marks.pips[index]!.colour;
        this.view.fill({ color: colour }).stroke({ color: INK, width: 1.5 });
        // A ring rings out from a condition as it's applied.
        const pulse = view.appliedAt === null ? 1 : (now - view.appliedAt) / PULSE_MS;
        if (pulse < 1) {
          this.animating = true;
          const spread = 2 + 12 * (1 - (1 - pulse) ** 3);
          this.view
            .roundRect(
              current.x - spread,
              current.y - spread,
              current.w + spread * 2,
              current.h + spread * 2,
              Math.min(open ? 4 : plan.radius, current.h / 2) + spread,
            )
            .stroke({ color: colour, width: 3 * (1 - pulse) + 1, alpha: (1 - pulse) * 0.9 });
        }
        const scale = Math.max(
          0,
          Math.min(1, (current.w - 16) / view.text.width, (current.h - 8) / view.text.height),
        );
        view.text.scale.set(scale);
        view.text.alpha = Math.min(1, Math.max(0, (scale - 0.4) / 0.6));
        view.text.visible = view.text.alpha > 0;
        view.text.position.set(current.x + 8, current.y + (current.h - view.text.height) / 2);
        if (plan.id === hovered?.id || announceAt >= 0)
          this.texts.setChildIndex(view.text, this.texts.children.length - 1);
      }
      this.drawPinnedName(plan, centre, now, usedNames);
    }
    this.drawnTokens = new Set(plans.map((plan) => plan.id));
    for (const id of this.pinnedNames.keys())
      if (!this.drawnTokens.has(id)) this.pinnedNames.delete(id);
    for (const [id, text] of this.names) {
      if (usedNames.has(id)) continue;
      text.destroy();
      this.names.delete(id);
    }
    for (const [key, view] of this.views) {
      if (used.has(key)) continue;
      view.text.destroy();
      this.views.delete(key);
    }
  }

  /** The name over an off-screen token's conditions, and a pointer toward it, while they're out at the edge. */
  private drawPinnedName(
    plan: { id: string; name: string; views: ConditionView[] },
    token: Point,
    now: number,
    used: Set<string>,
  ) {
    const pinned = this.pinnedNames.get(plan.id);
    if (!pinned) return;
    const { view, offset } = pinned;
    const out =
      plan.views.includes(view) && (view.open || now - view.start < 320) && view.text.alpha > 0;
    const name = out && this.nameText(plan.id, plan.name);
    if (!name) {
      this.pinnedNames.delete(plan.id);
      return;
    }
    used.add(plan.id);
    name.alpha = view.text.alpha;
    name.position.set(Math.round(view.current.x + offset.x), Math.round(view.current.y + offset.y));
    const nameBox = { x: name.x - name.width / 2, y: name.y, w: name.width, h: name.height };
    const pointer = pointerToward(unionRect([nameBox, view.current]), token);
    if (pointer && name.alpha > 0.5) drawPointer(this.view, pointer, name.alpha);
  }

  /** A token's name, to head its conditions shown at the edge; none if it has no name to show. */
  private nameText(tokenId: string, name: string): Text | null {
    if (!name) return null;
    let text = this.names.get(tokenId);
    if (!text) {
      text = new Text({
        text: "",
        style: TOKEN_NAME_STYLE,
        anchor: { x: 0.5, y: 0 },
        resolution: 2,
      });
      this.names.set(tokenId, text);
      this.texts.addChild(text);
    }
    if (text.text !== name) text.text = name;
    return text;
  }

  /** The ring on whoever's turn it is; it closes in on them as their turn starts. */
  private drawTurns(
    turns: Graphics,
    tokens: { id: string; x: number; y: number; r: number }[],
    now: number,
    still: boolean,
  ) {
    const current = tokens[0];
    if (!current) this.turn = null;
    else if (this.turn?.tokenId !== current.id)
      // Only a turn that passes, not one already under way when the token's first drawn.
      this.turn = {
        tokenId: current.id,
        since: this.drawnTokens.has(current.id) && !still ? now : -Infinity,
      };
    for (const token of tokens) {
      const p = token.id === this.turn?.tokenId ? Math.min(1, (now - this.turn.since) / 600) : 1;
      if (p < 1) {
        this.animating = true;
        const eased = 1 - (1 - p) ** 3;
        // A wide ring that closes in, and a flash of the token's outline as it lands.
        turns
          .circle(token.x, token.y, token.r + 40 * (1 - eased))
          .stroke({ color: TURN_COLOUR, width: 3 + 5 * (1 - eased), alpha: 0.3 + 0.65 * eased });
        if (p > 0.6)
          turns
            .circle(token.x, token.y, token.r + 4 + 10 * ((p - 0.6) / 0.4))
            .stroke({ color: TURN_COLOUR, width: 2, alpha: 1 - (p - 0.6) / 0.4 });
      } else
        turns
          .circle(token.x, token.y, token.r)
          .stroke({ color: TURN_COLOUR, width: 3, alpha: 0.95 });
    }
  }
}
