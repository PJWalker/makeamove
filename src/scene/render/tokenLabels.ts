import { Container, Graphics, Text } from "pixi.js";
import { toScreen } from "../camera";
import type { Point } from "../grid";
import type { TokenStat } from "../../systems/types";
import { hoverSpring } from "../conditionLayout";
import { resolveTokenLabelLayout, zoomTokenBars } from "../tokenLabelLayout";
import type { Transform } from "../types";
import type { RenderState } from "./state";
import { INK, reducedMotion } from "./style";

/** Token names never get smaller or bigger than this on screen, in px. */
const NAME_MIN = 11;
const NAME_MAX = 15;

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
  private namePool = new Map<string, Text>();
  private barTextPool = new Map<string, Text>();
  private barHover: { tokenId: string; statId: string } | null = null;
  private barZoom = new Map<
    string,
    { scale: number; from: number; target: number; start: number }
  >();
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
      name: (Box & { text: Text }) | null;
      small: boolean;
    }[] = [];

    for (const el of s.elements) {
      if (el.type !== "token" || s.hidden.has(el.id)) continue;
      const t = s.previews.get(el.id) ?? el;
      // Out of sight: no name or bars to give it away.
      if (unseen(t)) continue;
      const screenW = t.w * cam.zoom;
      const stats = !el.hideBars && el.characterId ? this.statsFor(el.characterId) : [];
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
      let name: (Box & { text: Text }) | null = null;
      const label = el.hideName ? "" : el.name.trim();
      if (label) {
        let text = this.namePool.get(el.id);
        if (!text) {
          text = new Text({
            text: "",
            style: {
              fontFamily: "Cabin, sans-serif",
              fontSize: NAME_MAX,
              fontWeight: "600",
              fill: 0xffffff,
              stroke: { color: INK, width: 4, join: "round" },
            },
            anchor: { x: 0.5, y: 0 },
            resolution: 2,
          });
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
    const now = performance.now();
    const still = reducedMotion();
    const usedZooms = new Set<string>();
    this.animating = false;

    // Draw, the hovered token's last so it sits on top.
    const ordered = [
      ...plans.filter((p) => p.id !== hover),
      ...plans.filter((p) => p.id === hover),
    ];
    for (const p of ordered) {
      if (p.name) p.name.text.visible = showName.has(p.id);
      const barBox = bars.get(p.id);
      if (!barBox || !showBars.has(p.id)) continue;
      const scales = p.stats.map((stat) => {
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
        return zoom.scale;
      });
      const zoomed = zoomTokenBars(barBox, p.barH, BAR_GAP, scales);
      if (p.name) p.name.text.y += zoomed.nameOffset;
      p.stats.forEach((s, i) => {
        const { x, y, w, h: barH } = zoomed.bars[i]!;
        const frac = s.max > 0 ? Math.min(1, Math.max(0, s.value / s.max)) : 0;
        g.roundRect(x, y, w, barH, 3).fill({ color: INK, alpha: 0.85 });
        if (frac > 0)
          g.roundRect(x + 1.5, y + 1.5, (w - 3) * frac, barH - 3, 2).fill({
            color: s.colour,
          });
        // The value, when the bar is wide enough to read it.
        if (w < BAR_TEXT_MIN_W) return;
        const key = `${p.id}:${s.id}`;
        let text = this.barTextPool.get(key);
        if (!text) {
          text = new Text({
            text: "",
            style: {
              fontFamily: "Cabin, sans-serif",
              fontSize: BAR_MAX_H - 2,
              fontWeight: "700",
              fill: 0xffffff,
            },
            anchor: 0.5,
            resolution: 2,
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
}
