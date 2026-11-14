import { Container, Graphics } from "pixi.js";
import { toScreen } from "../camera";
import type { Rect } from "../camera";
import type { Point } from "../grid";
import type { TokenStat } from "../../systems/types";
import { barShards, shardFrame, type BarShard } from "../barBreak";
import { BAR_BREAK_AT, BAR_CHANGE_MS, barChangeFrame, type BarChange } from "../barChange";
import { downs } from "../downed";
import { pinInside, pointerToward, unionRect } from "../edgePin";
import { hoverSpring } from "../conditionLayout";
import { resolveTokenLabelLayout, zoomTokenBars } from "../tokenLabelLayout";
import type { Transform } from "../types";
import { SdfText } from "./sdfText";
import type { RenderState } from "./state";
import {
  drawPointer,
  INK,
  POINTER_ROOM,
  reducedMotion,
  screenViewport,
  TOKEN_NAME,
  cabin,
} from "./style";

/** Token names never get smaller or bigger than this on screen, in px. */
const NAME_MIN = 11;
const NAME_MAX = TOKEN_NAME.size;
/** The size, in px, a token's name grows to at least while one of its bars changes. */
const NAME_GROWN = 20;

/** Tokens smaller than this on screen, in px, only show their name and bars on hover. */
const NAME_TOKEN_MIN = 24;
/**
 * Stat bars under tokens: half again as wide as the token where that clears
 * every other token's bars, else just inside its width; never narrower than this, in px.
 */
const BAR_MIN_W = 36;
/** Bar height grows with the token on screen, within these. */
const BAR_MIN_H = 11;
const BAR_MAX_H = 17;
const BAR_GAP = 2;
/** Bars narrower than this leave out their numbers. */
const BAR_TEXT_MIN_W = 44;
/** Room kept above a bar pinned to the edge, in px, for the number that rises off it. */
const DELTA_ROOM = 68;

/**
 * What sits under each token, in screen space so it stays readable at any
 * zoom: its system's stat bars (HP), then its name.
 */
export class TokenLabelLayer {
  /** Tokens' stat bars, with their values. */
  readonly bars = new Graphics();
  readonly barText = new Container();
  /** Token names. */
  readonly names = new Container();
  private namePool = new Map<string, SdfText>();
  private barTextPool = new Map<string, SdfText>();
  private barHover: { tokenId: string; statId: string } | null = null;
  private barZoom = new Map<
    string,
    { scale: number; from: number; target: number; start: number }
  >();
  /** Each bar's value when last drawn, to catch it changing. */
  private barValues = new Map<string, number>();
  /** Bars playing out a change in value. */
  private barChanges = new Map<string, BarChange>();
  /** Bars broken apart: where each snapped, and its pieces. */
  private breaks = new Map<string, { at: Rect; shards: BarShard[] }>();
  /** The numbers that rise off bars as they change. */
  private deltaPool = new Map<string, SdfText>();
  /** Whether a bar is still zooming, and needs more frames. */
  animating = false;
  /** What a linked token shows, from its character. */
  statsFor: (characterId: string) => TokenStat[] = () => [];

  constructor(private readonly state: RenderState) {}

  /**
   * Both follow the zoom, but only within set sizes. Where they'd collide with
   * another token's, or a token is too small on screen to label, they're left
   * out, and only the token under the pointer (`hoverToken`) shows them.
   * Tokens out of sight get neither.
   */
  draw(hoverToken: string | null, pointer: Point | null, unseen: (t: Transform) => boolean) {
    const s = this.state;
    const cam = s.camera;
    const g = this.bars.clear();
    const now = performance.now();
    const still = reducedMotion();
    const viewport = screenViewport(s);
    const seen = new Set<string>();
    const usedNames = new Set<string>();
    const usedValues = new Set<string>();
    type Box = { id: string; x: number; y: number; w: number; h: number };
    const plans: {
      id: string;
      t: Transform;
      stats: TokenStat[];
      bars: Box | null;
      /** The bars half again as wide as the token, used where they clear every other token's. */
      wideBars: Box | null;
      barH: number;
      name: (Box & { text: SdfText }) | null;
      small: boolean;
    }[] = [];

    for (const el of s.elements) {
      if (el.type !== "token" || s.hidden.has(el.id)) continue;
      const t = s.previews.get(el.id) ?? el;
      // Out of sight: no name or bars to give it away.
      if (unseen(t)) continue;
      const screenW = t.w * cam.zoom;
      const allStats = !el.hideBars && el.characterId ? this.statsFor(el.characterId) : [];
      for (const stat of allStats) {
        const key = `${el.id}:${stat.id}`;
        seen.add(key);
        this.noteValue(key, stat, now, still);
      }
      // A down token's hit point bar has broken off: gone, once it's done falling.
      const stats = allStats.filter((stat) => {
        if (!downs(stat)) return true;
        const key = `${el.id}:${stat.id}`;
        const change = this.barChanges.get(key);
        if (change && !barChangeFrame(change, now - change.start).done) return true;
        this.barChanges.delete(key);
        this.breaks.delete(key);
        return false;
      });
      const foot = toScreen(cam, { x: t.x, y: t.y + t.h / 2 });
      let y = foot.y + 3;
      let bars: Box | null = null;
      let wideBars: Box | null = null;
      const barH = Math.round(Math.min(BAR_MAX_H, Math.max(BAR_MIN_H, screenW * 0.11)));
      if (stats.length) {
        // The first bar straddles the token's bottom edge.
        const top = Math.round(foot.y - barH / 2);
        const h = stats.length * (barH + BAR_GAP) - BAR_GAP;
        const box = (w: number) => ({
          id: el.id,
          x: Math.round(foot.x - w / 2),
          y: top,
          w: Math.round(w),
          h,
        });
        bars = box(Math.max(BAR_MIN_W, screenW * 0.9));
        wideBars = box(Math.max(BAR_MIN_W, screenW * 1.5));
        y = top + h + 2;
      }
      let name: (Box & { text: SdfText }) | null = null;
      const label = el.hideName ? "" : el.name.trim();
      if (label) {
        let text = this.namePool.get(el.id);
        if (!text) {
          text = new SdfText({ ...TOKEN_NAME, anchor: { x: 0.5, y: 0 } });
          this.namePool.set(el.id, text);
          this.names.addChild(text);
        }
        if (text.text !== label) text.text = label;
        text.scale.set(Math.min(NAME_MAX, Math.max(NAME_MIN, screenW * 0.2)) / NAME_MAX);
        text.position.set(Math.round(foot.x), Math.round(y));
        usedNames.add(el.id);
        name = {
          id: el.id,
          x: foot.x - text.width / 2,
          y,
          w: text.width,
          h: text.height,
          text,
        };
      }
      plans.push({
        id: el.id,
        t,
        stats,
        bars,
        wideBars,
        barH,
        name,
        small: screenW < NAME_TOKEN_MIN,
      });
    }

    const initialLayout = resolveTokenLabelLayout(plans, hoverToken);
    let hoveredBar: typeof this.barHover = null;
    if (pointer) {
      for (const plan of plans) {
        const box = initialLayout.bars.get(plan.id);
        if (!box || (!initialLayout.showBars.has(plan.id) && plan.id !== this.barHover?.tokenId))
          continue;
        const zoomed = zoomTokenBars(
          box,
          plan.barH,
          BAR_GAP,
          plan.stats.map((stat) => this.barZoom.get(`${plan.id}:${stat.id}`)?.scale ?? 1),
        );
        for (const [index, bar] of zoomed.bars.entries()) {
          if (
            pointer.x >= bar.x &&
            pointer.x <= bar.x + bar.w &&
            pointer.y >= bar.y &&
            pointer.y <= bar.y + bar.h
          )
            hoveredBar = { tokenId: plan.id, statId: plan.stats[index]!.id };
        }
      }
    }
    this.barHover = hoveredBar;
    const hover = hoveredBar?.tokenId ?? hoverToken;
    const { bars, showBars, showName } =
      hover === hoverToken ? initialLayout : resolveTokenLabelLayout(plans, hover);
    // A changing bar shows, and sits on top, whatever would hide it.
    const changing = new Set(
      plans.flatMap((p) =>
        p.stats.some((stat) => this.barChanges.has(`${p.id}:${stat.id}`)) ? [p.id] : [],
      ),
    );
    for (const id of changing) showBars.add(id);
    const usedZooms = new Set<string>();
    const usedDeltas = new Set<string>();
    this.animating = false;

    // Draw, the hovered token's last so it sits on top.
    const ordered = [
      ...plans.filter((p) => p.id !== hover && !changing.has(p.id)),
      ...plans.filter((p) => p.id !== hover && changing.has(p.id)),
      ...plans.filter((p) => p.id === hover),
    ];
    for (const p of ordered) {
      if (p.name) p.name.text.visible = showName.has(p.id);
      const barBox = bars.get(p.id);
      if (!barBox || !showBars.has(p.id)) continue;
      const frames = p.stats.map((stat) => {
        const change = this.barChanges.get(`${p.id}:${stat.id}`);
        if (!change) return null;
        const frame = barChangeFrame(change, now - change.start);
        if (frame.done) {
          this.barChanges.delete(`${p.id}:${stat.id}`);
          this.breaks.delete(`${p.id}:${stat.id}`);
          return null;
        }
        this.animating = true;
        return { change, frame };
      });
      const scales = p.stats.map((stat, i) => {
        const key = `${p.id}:${stat.id}`;
        usedZooms.add(key);
        let zoom = this.barZoom.get(key);
        if (!zoom) {
          zoom = { scale: 1, from: 1, target: 1, start: now - 320 };
          this.barZoom.set(key, zoom);
        }
        const active = hoveredBar?.tokenId === p.id && hoveredBar.statId === stat.id;
        const target = active ? Math.max(1.3, Math.min(2, 72 / barBox.w), 22 / p.barH) : 1;
        if (zoom.target !== target) {
          zoom.from = zoom.scale;
          zoom.target = target;
          zoom.start = now;
        }
        const progress = still ? 1 : Math.min(1, (now - zoom.start) / 320);
        zoom.scale = Math.max(1, zoom.from + (zoom.target - zoom.from) * hoverSpring(progress));
        if (progress < 1) this.animating = true;
        const frame = frames[i]?.frame;
        // A change grows the bar big enough to read, at least.
        const grown = frame
          ? 1 + (Math.max(1.6, Math.min(2.4, 96 / barBox.w), 26 / p.barH) - 1) * frame.grow
          : 1;
        return Math.max(zoom.scale, grown) * (frame?.slot ?? 1);
      });
      const zoomed = zoomTokenBars(barBox, p.barH, BAR_GAP, scales);
      if (p.name) {
        const name = p.name.text;
        name.y += zoomed.nameOffset;
        // The name grows with a changing bar, so it's clear whose it is.
        const grow = Math.max(0, ...frames.map((f) => f?.frame.grow ?? 0));
        if (grow > 0) {
          const base = name.scale.x;
          const grown = Math.max(base * 1.35, NAME_GROWN / NAME_MAX);
          name.scale.set(base + (grown - base) * grow);
          name.visible = true;
          this.names.setChildIndex(name, this.names.children.length - 1);
        }
      }
      // It flies out to the edge as the bar grows, and back as it settles.
      const fly = Math.max(0, ...frames.map((f) => f?.frame.grow ?? 0));
      if (frames.some(Boolean)) this.pinToEdge(p, zoomed.bars, viewport, fly);
      p.stats.forEach((s, i) => {
        const changed = frames[i];
        const frame = changed?.frame;
        const { y, w, h: barH } = zoomed.bars[i]!;
        const x = zoomed.bars[i]!.x + (frame?.shakeX ?? 0);
        const key = `${p.id}:${s.id}`;
        if (frame?.broken && changed) {
          this.drawShards(key, changed.change, { x, y, w, h: barH }, now);
          this.drawDelta(key, changed.change.delta, frame, x + w / 2, y, barH);
          usedDeltas.add(key);
          return;
        }
        const frac = frame ? frame.fill : fillOf(s);
        g.roundRect(x, y, w, barH, 3).fill({ color: INK, alpha: frame ? 0.95 : 0.85 });
        const inner = (from: number, to: number) =>
          g.roundRect(x + 1.5 + (w - 3) * from, y + 1.5, (w - 3) * (to - from), barH - 3, 2);
        if (frame && changed && frame.ghost > frac) {
          const hurt = changed.change.delta < 0;
          inner(frac, frame.ghost).fill(
            hurt
              ? { color: frame.ghostHot ? 0xffffff : 0xff5c4d }
              : { color: 0xb8f5c2, alpha: 0.75 },
          );
        }
        if (frac > 0) inner(0, frac).fill({ color: s.colour });
        if (frame && changed) {
          if (frame.flash > 0)
            g.roundRect(x, y, w, barH, 3).fill({ color: 0xffffff, alpha: frame.flash * 0.7 });
          // Cracks spread across a bar about to break.
          if (frame.crack > 0) {
            for (const shard of this.breakFor(key, changed.change, {
              x,
              y,
              w,
              h: barH,
            }).shards.slice(1)) {
              const [top, , , bottom, , mid] = shard.outline;
              const at = (q: Point) => ({ x: x + q.x * w, y: y + q.y * barH });
              const m = at(mid!);
              const reach = frame.crack;
              const a = at(top!);
              const b = at(bottom!);
              g.moveTo(m.x + (a.x - m.x) * reach, m.y + (a.y - m.y) * reach)
                .lineTo(m.x, m.y)
                .lineTo(m.x + (b.x - m.x) * reach, m.y + (b.y - m.y) * reach)
                .stroke({
                  color: 0xffffff,
                  width: 1.5,
                  alpha: 0.5 + 0.5 * frame.crack,
                  join: "miter",
                });
            }
          }
          // A rim that burns in the colour of the change, then fades.
          const hurt = changed.change.delta < 0;
          g.roundRect(x - 1, y - 1, w + 2, barH + 2, 4).stroke({
            color: hurt ? 0xff5c4d : 0x6ee07a,
            width: 2,
            alpha: Math.min(1, frame.alpha * 1.5) * (1 - frame.rise * 0.5),
          });
          this.drawDelta(`${p.id}:${s.id}`, changed.change.delta, frame, x + w / 2, y, barH);
          usedDeltas.add(`${p.id}:${s.id}`);
        }
        // The value, when the bar is wide enough to read it.
        if (w < BAR_TEXT_MIN_W) return;
        let text = this.barTextPool.get(key);
        if (!text) {
          text = new SdfText({
            font: cabin(700),
            size: BAR_MAX_H - 2,
            fill: 0xffffff,
            anchor: 0.5,
          });
          this.barTextPool.set(key, text);
          this.barText.addChild(text);
        }
        const value = `${s.value}/${s.max}`;
        if (text.text !== value) text.text = value;
        text.scale.set(1);
        text.scale.set(Math.min((barH - 2) / text.height, (w - 8) / text.width));
        text.position.set(Math.round(x + w / 2), Math.round(y + barH / 2));
        usedValues.add(key);
        if (p.id === hover) this.barText.setChildIndex(text, this.barText.children.length - 1);
      });
    }

    for (const [key, text] of this.deltaPool) {
      if (usedDeltas.has(key)) continue;
      text.destroy();
      this.deltaPool.delete(key);
    }
    for (const key of this.barValues.keys()) {
      if (seen.has(key)) continue;
      this.barValues.delete(key);
      this.barChanges.delete(key);
      this.breaks.delete(key);
    }
    for (const key of this.barZoom.keys()) {
      if (!usedZooms.has(key)) this.barZoom.delete(key);
    }

    const hovered = hover && this.namePool.get(hover);
    if (hovered && hovered.parent)
      this.names.setChildIndex(hovered, this.names.children.length - 1);
    for (const [id, text] of this.namePool) {
      if (usedNames.has(id)) continue;
      text.destroy();
      this.namePool.delete(id);
    }
    for (const [key, text] of this.barTextPool) {
      if (usedValues.has(key)) continue;
      text.destroy();
      this.barTextPool.delete(key);
    }
  }

  /** Starts a bar playing out its change, when its value isn't what it was. */
  private noteValue(key: string, stat: TokenStat, now: number, still: boolean) {
    const last = this.barValues.get(key);
    this.barValues.set(key, stat.value);
    if (last === undefined || last === stat.value || still) return;
    // Already down: nothing left to lose.
    if (last <= 0 && downs(stat)) return;
    const running = this.barChanges.get(key);
    const frame = running && barChangeFrame(running, now - running.start);
    const live = running && frame && !frame.done;
    const delta = stat.value - last;
    // Changed again mid-change: carry on from what's showing, still grown, and
    // add up a run of hits (or heals).
    const same = live && Math.sign(running.delta) === Math.sign(delta);
    this.barChanges.set(key, {
      from: live
        ? same && delta < 0
          ? frame.ghost
          : frame.fill
        : fillOf({ ...stat, value: last }),
      to: fillOf(stat),
      delta: same ? running.delta + delta : delta,
      start: now,
      grownFrom: live ? frame.grow : 0,
      breaks: downs(stat),
    });
    this.breaks.delete(key);
  }

  /**
   * A changing bar whose token is off screen flies out to the edge, with the
   * token's name and a pointer toward it, so the change isn't missed; `fly`
   * is how far out it is, 0 (at the token) to 1 (at the edge).
   */
  private pinToEdge(
    plan: { t: Transform; name: { text: SdfText } | null },
    bars: Rect[],
    viewport: Rect,
    fly: number,
  ) {
    const name = plan.name?.text;
    const nameBox = name && {
      x: name.x - name.width / 2,
      y: name.y,
      w: name.width,
      h: name.height,
    };
    const group = unionRect([...bars, ...(nameBox ? [nameBox] : [])]);
    // Room above for the number that rises off the bar.
    const room = { ...group, y: group.y - DELTA_ROOM, h: group.h + DELTA_ROOM };
    const pin = pinInside(
      {
        x: room.x - POINTER_ROOM,
        y: room.y - POINTER_ROOM,
        w: room.w + POINTER_ROOM * 2,
        h: room.h + POINTER_ROOM * 2,
      },
      viewport,
    );
    if (!pin.x && !pin.y) return;
    const shift = { x: pin.x * fly, y: pin.y * fly };
    for (const bar of bars) {
      bar.x += shift.x;
      bar.y += shift.y;
    }
    name?.position.set(name.x + shift.x, name.y + shift.y);
    const pinned = { ...group, x: group.x + shift.x, y: group.y + shift.y };
    const pointer = pointerToward(pinned, toScreen(this.state.camera, plan.t));
    if (pointer && fly > 0.5) drawPointer(this.bars, pointer, Math.min(1, (fly - 0.5) * 2));
  }

  /** How a breaking bar comes apart; where it is when it snaps holds it there as it falls. */
  private breakFor(key: string, change: BarChange, bar: Rect) {
    let broken = this.breaks.get(key);
    if (!broken) {
      broken = { at: bar, shards: barShards(`${key}:${change.start}`) };
      this.breaks.set(key, broken);
    }
    if (performance.now() - change.start < BAR_BREAK_AT) broken.at = bar;
    return broken;
  }

  /** A broken bar's pieces, thrown off and falling away. */
  private drawShards(key: string, change: BarChange, bar: Rect, now: number) {
    const g = this.bars;
    const { at, shards } = this.breakFor(key, change, bar);
    const since = now - change.start - BAR_BREAK_AT;
    // What was lost was still hanging on, in red, when it snapped.
    const lost = Math.max(change.from, 0);
    for (const shard of shards) {
      const f = shardFrame(shard, since, BAR_CHANGE_MS - BAR_BREAK_AT);
      if (f.alpha <= 0) continue;
      const cx = shard.centre.x * at.w;
      const cy = shard.centre.y * at.h;
      const cos = Math.cos(f.rotation);
      const sin = Math.sin(f.rotation);
      const place = (shrinkX: number, shrinkY: number) =>
        shard.outline.flatMap((q) => {
          const lx = (q.x * at.w - cx) * shrinkX;
          const ly = (q.y * at.h - cy) * shrinkY;
          return [at.x + cx + f.dx + lx * cos - ly * sin, at.y + cy + f.dy + lx * sin + ly * cos];
        });
      g.poly(place(1, 1)).fill({ color: INK, alpha: 0.95 * f.alpha });
      if (shard.centre.x < lost)
        g.poly(place(0.8, Math.max(0, 1 - 3 / at.h))).fill({ color: 0xff5c4d, alpha: f.alpha });
      g.poly(place(1, 1)).stroke({ color: 0xff5c4d, width: 1.5, alpha: 0.8 * f.alpha });
    }
  }

  /** The number that rises off a changing bar. */
  private drawDelta(
    key: string,
    delta: number,
    frame: ReturnType<typeof barChangeFrame>,
    x: number,
    y: number,
    barH: number,
  ) {
    let text = this.deltaPool.get(key);
    if (!text) {
      text = new SdfText({
        font: cabin(800),
        size: 36,
        fill: 0xffffff,
        outline: { color: INK, width: 5 },
        anchor: { x: 0.5, y: 1 },
      });
      this.deltaPool.set(key, text);
      this.barText.addChild(text);
    }
    const label = delta > 0 ? `+${delta}` : `${delta}`.replace("-", "\u2212");
    if (text.text !== label) text.text = label;
    text.fill = delta < 0 ? 0xff7a6b : 0x8cf09a;
    const size = Math.max(26, Math.min(36, barH * 1.6));
    text.scale.set((size / 36) * frame.pop);
    text.alpha = frame.alpha;
    text.position.set(Math.round(x), Math.round(y - 2 - frame.rise * 30));
    this.barText.setChildIndex(text, this.barText.children.length - 1);
  }
}

/** How full a stat's bar is, 0 to 1. */
const fillOf = (stat: Pick<TokenStat, "value" | "max">) =>
  stat.max > 0 ? Math.min(1, Math.max(0, stat.value / stat.max)) : 0;
