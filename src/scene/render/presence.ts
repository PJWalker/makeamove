import { Container, Graphics } from "pixi.js";
import { toScreen } from "../camera";
import { fromLocal as fromLocalPoint } from "../geometry";
import type { Point } from "../grid";
import { formatDistance, measure, tokenDistance } from "../measure";
import { PING_MS, TRAIL_MS, type PresenceMark } from "../presence";
import type { Draft } from "./draft";
import { SdfText } from "./sdfText";
import type { RenderState } from "./state";
import { cabin, INK } from "./style";

/** A remote cursor travelling from one reported position to the next. */
interface CursorMove {
  from: Point;
  to: Point;
  start: number;
}

/** Cursor reports arrive about every 50 ms (~3 frames); glide across that gap. */
const CURSOR_GLIDE_MS = 50;

function cursorAt(m: CursorMove, now: number): Point {
  const k = Math.min(1, (now - m.start) / CURSOR_GLIDE_MS);
  return {
    x: m.from.x + (m.to.x - m.from.x) * k,
    y: m.from.y + (m.to.y - m.from.y) * k,
  };
}

/**
 * Other members' cursors, pings, trails, rulers and targets, plus this
 * device's own, with their labels; and the size of a shape being dragged out.
 */
export class PresenceLayer {
  readonly view = new Graphics();
  readonly labels = new Container();
  private labelPool = new Map<string, SdfText>();
  private marks: PresenceMark[] = [];
  private cursors = new Map<string, CursorMove>();

  constructor(private readonly state: RenderState) {}

  setMarks(marks: PresenceMark[]) {
    this.marks = marks;
    const now = performance.now();
    const live = new Set<string>();
    for (const m of marks) {
      if (m.self || !m.cursor) continue;
      live.add(m.id);
      const t = this.cursors.get(m.id);
      if (!t) {
        this.cursors.set(m.id, { from: m.cursor, to: m.cursor, start: now });
      } else if (t.to.x !== m.cursor.x || t.to.y !== m.cursor.y) {
        // Carry on from wherever the cursor is drawn right now.
        this.cursors.set(m.id, {
          from: cursorAt(t, now),
          to: m.cursor,
          start: now,
        });
      }
    }
    for (const id of this.cursors.keys()) if (!live.has(id)) this.cursors.delete(id);
  }

  private label(
    key: string,
    text: string,
    x: number,
    y: number,
    colour: string,
    used: Set<string>,
    alpha = 1,
  ) {
    let t = this.labelPool.get(key);
    if (!t) {
      t = new SdfText({
        text,
        font: cabin(600),
        size: 13,
        fill: colour,
        outline: { color: INK, width: 3 },
      });
      this.labelPool.set(key, t);
      this.labels.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.fill = colour;
    t.position.set(x, y);
    t.alpha = alpha;
    used.add(key);
  }

  /**
   * Each member's targets, as a ring in their colour around the token; a
   * second member's ring sits just outside the first. This device's own
   * targets show their distance from the token it measures from.
   */
  private drawTargets(g: Graphics, used: Set<string>, rangeFrom: string | null) {
    const s = this.state;
    const cam = s.camera;
    const byId = s.byId;
    const rings = new Map<string, number>();
    const fromEl = rangeFrom ? byId.get(rangeFrom) : undefined;
    const from = fromEl && (s.previews.get(fromEl.id) ?? fromEl);
    for (const m of this.marks) {
      for (const id of m.targets) {
        const el = byId.get(id);
        if (el?.type !== "token") continue;
        const t = s.previews.get(id) ?? el;
        const n = rings.get(id) ?? 0;
        rings.set(id, n + 1);
        const c = toScreen(cam, t);
        const r = (Math.max(t.w, t.h) / 2) * cam.zoom + 8 + n * 6;
        g.circle(c.x, c.y, r).stroke({ color: INK, width: 5, alpha: 0.5 });
        g.circle(c.x, c.y, r).stroke({ color: m.colour, width: 2 });
        // Sight ticks at the four compass points.
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          g.moveTo(c.x + dx * (r - 5), c.y + dy * (r - 5))
            .lineTo(c.x + dx * (r + 5), c.y + dy * (r + 5))
            .stroke({ color: m.colour, width: 2.5 });
        }
        if (m.self && from && fromEl.id !== id) {
          this.label(
            `target:${id}`,
            formatDistance(s.grid, tokenDistance(s.grid, from, t)),
            c.x + r * 0.72 + 6,
            c.y + r * 0.72 - 4,
            m.colour,
            used,
          );
        }
      }
    }
  }

  /** Returns true while a ping is still rippling and needs more frames. */
  draw(draft: Draft | null, rangeFrom: string | null): boolean {
    const s = this.state;
    const g = this.view.clear();
    const cam = s.camera;
    const used = new Set<string>();
    const now = performance.now();
    let animating = false;
    let insets: ReturnType<RenderState["insets"]> | undefined;

    this.drawTargets(g, used, rangeFrom);

    // A shape being dragged out shows its size by the pointer's end.
    const d = draft;
    if (d?.kind === "shape" && d.label) {
      const end = fromLocalPoint(d.t, { x: d.t.w / 2, y: 0 });
      const at = toScreen(cam, d.shape === "circle" ? { x: d.t.x, y: d.t.y } : end);
      this.label("draft", d.label, at.x + 10, at.y - 18, "#ffffff", used);
    }

    for (const m of this.marks) {
      if (m.cursor) {
        const move = m.self ? undefined : this.cursors.get(m.id);
        if (move && now - move.start < CURSOR_GLIDE_MS) animating = true;
        const c = toScreen(cam, move ? cursorAt(move, now) : m.cursor);
        g.circle(c.x, c.y, 6).fill(m.colour).stroke({ color: 0xffffff, width: 2 });
      }

      if (m.ruler) {
        // On a grid, measure cell to cell, so draw between cell centres.
        const r = measure(s.grid, m.ruler.a, m.ruler.b);
        const a = toScreen(cam, r.a);
        const b = toScreen(cam, r.b);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: INK, width: 5, alpha: 0.6 });
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: m.colour, width: 2.5 });
        g.circle(a.x, a.y, 4).fill(m.colour).stroke({ color: INK, width: 1.5 });
        g.circle(b.x, b.y, 4).fill(m.colour).stroke({ color: INK, width: 1.5 });
        this.label(
          `ruler:${m.id}`,
          formatDistance(s.grid, r.distance),
          (a.x + b.x) / 2 + 8,
          (a.y + b.y) / 2 + 8,
          m.colour,
          used,
        );
      }

      if (m.trail?.length) {
        const pts = m.trail
          .map((q) => ({ ...toScreen(cam, q), f: 1 - (now - q.t) / TRAIL_MS }))
          .filter((q) => q.f > 0);
        if (pts.length) animating = true;
        for (let i = 1; i < pts.length; i++) {
          const previous = pts[i - 1]!;
          const current = pts[i]!;
          const f = (current.f + previous.f) / 2;
          g.moveTo(previous.x, previous.y)
            .lineTo(current.x, current.y)
            .stroke({
              color: m.colour,
              width: 3 + 7 * f,
              alpha: 0.25 * f,
              cap: "round",
            });
          g.moveTo(previous.x, previous.y)
            .lineTo(current.x, current.y)
            .stroke({
              color: 0xffffff,
              width: 1 + 2 * f,
              alpha: f,
              cap: "round",
            });
        }
        const head = pts[pts.length - 1];
        if (head) {
          g.circle(head.x, head.y, 4 + 3 * head.f).fill({
            color: m.colour,
            alpha: head.f,
          });
          if (!m.self)
            this.label(`trail:${m.id}`, m.name, head.x + 12, head.y - 26, m.colour, used, head.f);
        }
      }

      if (m.ping) {
        const age = (now - m.ping.startedAt) / PING_MS;
        if (age < 1) {
          animating = true;
          const c = toScreen(cam, m.ping.p);
          // Reading the UI's layout is costly; once a frame is enough.
          const cover = (insets ??= s.insets());
          const L = cover.left;
          const R = Math.max(L + 1, s.size.width - cover.right);
          const T = cover.top;
          const B = Math.max(T + 1, s.size.height);
          const inset = 28;
          const off = c.x < L || c.y < T || c.x > R || c.y > B;
          if (!off) {
            for (const phase of [0, 0.25]) {
              // Each ring finishes expanding and fading exactly as the ping ends.
              const k = (age - phase) / (1 - phase);
              if (k <= 0) continue;
              const fade = (1 - k) * (1 - k);
              g.circle(c.x, c.y, 8 + 55 * (1 - (1 - k) ** 2)).stroke({
                color: m.colour,
                width: 3,
                alpha: fade,
              });
            }
            g.circle(c.x, c.y, 5).fill({
              color: m.colour,
              alpha: (1 - age) ** 2,
            });
            if (!m.self)
              this.label(
                `ping:${m.id}`,
                m.name,
                c.x + 14,
                c.y - 30,
                m.colour,
                used,
                (1 - age) ** 2,
              );
          } else {
            // Point at the ping from the nearest edge of the view.
            const mid = { x: (L + R) / 2, y: (T + B) / 2 };
            const dx = c.x - mid.x;
            const dy = c.y - mid.y;
            const k = Math.min(
              Math.max(1, (R - L) / 2 - inset) / Math.abs(dx || 1e-6),
              Math.max(1, (B - T) / 2 - inset) / Math.abs(dy || 1e-6),
            );
            const e = { x: mid.x + dx * k, y: mid.y + dy * k };
            const ang = Math.atan2(dy, dx);
            const tip = {
              x: e.x + Math.cos(ang) * 14,
              y: e.y + Math.sin(ang) * 14,
            };
            const wing = (a: number) => ({
              x: e.x + Math.cos(ang + a) * 12,
              y: e.y + Math.sin(ang + a) * 12,
            });
            const l = wing(2.4);
            const r = wing(-2.4);
            g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y])
              .fill({ color: m.colour, alpha: (1 - age) ** 0.7 })
              .stroke({ color: INK, width: 1.5 });
            const lx = Math.min(Math.max(e.x - Math.cos(ang) * 24 - 20, L + 4), R - 80);
            const ly = Math.min(Math.max(e.y - Math.sin(ang) * 24 - 8, T + 4), B - 22);
            this.label(`ping:${m.id}`, m.name, lx, ly, m.colour, used, (1 - age) ** 0.7);
          }
        }
      }
    }

    for (const [key, t] of this.labelPool) {
      if (used.has(key)) continue;
      this.labels.removeChild(t);
      t.destroy();
      this.labelPool.delete(key);
    }
    return animating;
  }
}
