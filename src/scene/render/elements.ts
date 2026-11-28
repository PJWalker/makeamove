import { ColorMatrixFilter } from "pixi.js";
import type { Container } from "pixi.js";
import { downFrame } from "../downed";
import type { DownTurn } from "../downed";
import { kindOf } from "../tools";
import type { SelectKind } from "../tools";
import { LAYERS } from "../types";
import type { Layer, PinElement, TokenElement } from "../types";
import type { PinLook } from "../pins";
import { reducedMotion } from "../../ui/transition";
import { easeOut } from "../barChange";
import { buildView, contentKey, DESTROY_VIEW } from "./elementViews";
import type { View } from "./elementViews";
import type { RenderState } from "./state";

/** How opaque the GM sees what's hidden from players. */
const HIDDEN_ALPHA = 0.45;
/** How long, in ms, an element takes to fade as it's hidden or shown. */
const FADE_MS = 200;

/** A view's opacity on its way from one value to another. */
interface Fade {
  from: number;
  to: number;
  start: number;
}

/** How solid a pin is drawn, by how it looks to this viewer. */
const PIN_ALPHA: Record<PinLook, number> = { open: 1, secret: 0.6, broken: 0.35, hidden: 0 };

/** The scene's elements: a view per element, kept in its layer and in order. */
export default class ElementLayer {
  private readonly views = new Map<string, View>();
  /** Elements given a preview transform at the last sync, to put back once it's gone. */
  private previewed = new Set<string>();
  private order = "";
  private dropHighlightToken: string | null = null;
  private readonly dropFlashFrames = new Map<string, number>();
  private destroyed = false;
  /** Each token falling over, getting up, or lying down. */
  private readonly turns = new Map<string, DownTurn>();
  private readonly greys = new Map<string, ColorMatrixFilter>();
  /** Each view's opacity as it fades, and the opacity it's settled at. */
  private readonly fades = new Map<string, Fade>();
  /** Views of elements just hidden from this player, fading out before they go. */
  private readonly leaving = new Map<string, { view: View; layer: Layer }>();
  /** Elements to fade in or out at the next sync: just shown to this player, or just hidden. */
  private revealed: ReadonlySet<string> = new Set();
  private concealed: ReadonlySet<string> = new Set();
  /** Whether a token's character is down. */
  downed: (token: TokenElement) => boolean = () => false;

  constructor(
    private readonly state: RenderState,
    private readonly layers: Record<Layer, Container>,
  ) {}

  destroy() {
    this.destroyed = true;
    for (const frame of this.dropFlashFrames.values()) cancelAnimationFrame(frame);
    this.dropFlashFrames.clear();
    for (const grey of this.greys.values()) grey.destroy();
    this.greys.clear();
  }

  /** Fade in what's just been shown to this player, and out what's just been hidden, at the next sync. */
  fadeNext(revealed: ReadonlySet<string>, concealed: ReadonlySet<string>) {
    this.revealed = revealed;
    this.concealed = concealed;
  }

  /** Rebuild every view on the next sync, such as once missing images can be fetched. */
  rebuildAll() {
    for (const view of this.views.values()) view.key = "";
  }

  /**
   * Hide what's hidden for now (text being edited), tokens this device can't
   * see (`unseen`: out of sight or under fog), and the GM's helpers from
   * everyone else: walls always show to the GM, lamps, areas, effect and fog
   * outlines only while they can be picked (`shown`).
   */
  syncHidden(
    showHelpers: boolean,
    shown: ReadonlySet<SelectKind>,
    unseen: (token: TokenElement) => boolean,
  ) {
    const s = this.state;
    for (const [id, view] of this.views) {
      const element = s.byId.get(id);
      view.root.visible = !s.hidden.has(id) && !(element?.type === "token" && unseen(element));
      if (!view.helper || !element) continue;
      const kind = kindOf(element);
      view.helper.visible = showHelpers && (kind === "wall" || shown.has(kind));
    }
  }

  /**
   * Show each pin as it looks to this viewer (pins.ts): hidden, faded for the
   * GM's own (leading to a GM page) and fainter still when its target is gone,
   * named for what it leads to. Runs after syncHidden, once sight is known.
   * Returns the pins hidden from this viewer.
   */
  syncPins(lookOf: (pin: PinElement) => PinLook, labelOf: (pin: PinElement) => string) {
    const hidden = new Set<string>();
    for (const [id, view] of this.views) {
      const element = this.state.byId.get(id);
      if (element?.type !== "pin" || !view.pinLabel) continue;
      const look = lookOf(element);
      if (look === "hidden") hidden.add(id);
      view.root.visible &&= look !== "hidden";
      view.root.alpha = PIN_ALPHA[look];
      const label = labelOf(element);
      if (view.pinLabel.text !== label) view.pinLabel.text = label;
    }
    return hidden;
  }

  /** Play out the moving effects; whether they need more frames (not under reduced motion). */
  private animate(): boolean {
    const still = reducedMotion.matches;
    const time = still ? 0 : performance.now() / 1000;
    let animating = false;
    for (const view of this.views.values()) {
      if (!view.animate || !view.root.visible) continue;
      view.animate(time);
      animating = !still;
    }
    return animating;
  }

  sync() {
    const s = this.state;
    const seen = new Set<string>();
    for (const element of s.elements) {
      seen.add(element.id);
      const key = contentKey(element);
      let view = this.views.get(element.id);
      if (view && view.key !== key) {
        view.root.destroy(DESTROY_VIEW);
        view = undefined;
      }
      const fresh = !view;
      // Shown again while still fading out: the new view takes over.
      this.leaving.get(element.id)?.view.root.destroy(DESTROY_VIEW);
      this.leaving.delete(element.id);
      if (!view) {
        view = buildView(
          element,
          key,
          () => {
            s.invalidate();
          },
          this.dropHighlightToken,
          s.peers,
        );
        this.views.set(element.id, view);
        // A new view isn't in a layer yet, so force a restack.
        this.order = "";
      }
      view.apply(s.previews.get(element.id) ?? element);
      this.settle(element.id, element.hidden ? HIDDEN_ALPHA : 1, fresh);
    }
    this.previewed = new Set(s.previews.keys());
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.views.delete(id);
      const layer = this.concealed.has(id) && this.layerOf(view);
      if (layer) {
        this.leaving.set(id, { view, layer });
        this.fadeTo(id, 0);
      } else {
        view.root.destroy(DESTROY_VIEW);
        this.fades.delete(id);
      }
    }
    this.revealed = new Set();
    this.concealed = new Set();
    // Restack only when the order (or a layer) actually changed.
    const order = s.elements.map((e) => `${e.layer}:${e.id}`).join(",");
    if (order !== this.order) {
      this.order = order;
      for (const layer of LAYERS) this.layers[layer].removeChildren();
      for (const element of s.elements)
        this.layers[element.layer].addChild(this.views.get(element.id)!.root);
      // What's fading out stays in its layer until it's gone.
      for (const { view, layer } of this.leaving.values()) this.layers[layer].addChild(view.root);
    }
  }

  /**
   * Fade a view to the opacity it should have: in from nothing if it's new
   * because it's just been shown, at once if it's new for any other reason.
   */
  private settle(id: string, opacity: number, fresh: boolean) {
    if (fresh && this.revealed.has(id)) this.fadeTo(id, opacity, 0);
    else if (fresh) this.fades.set(id, { from: opacity, to: opacity, start: -Infinity });
    else if (this.fades.get(id)?.to !== opacity) this.fadeTo(id, opacity);
  }

  /** Play out falls, fades and moving effects; whether they need more frames. */
  play(): boolean {
    const falling = this.syncDowned();
    const fading = this.syncFades();
    const effects = this.animate();
    return falling || fading || effects;
  }

  /** The layer a view is drawn in, if it's in one. */
  private layerOf(view: View): Layer | undefined {
    return LAYERS.find((layer) => view.root.parent === this.layers[layer]);
  }

  /** Start a view fading from where it is (or `from`) to `to`; at once, under reduced motion. */
  private fadeTo(id: string, to: number, from?: number) {
    const view = this.views.get(id) ?? this.leaving.get(id)?.view;
    const start = reducedMotion.matches ? -Infinity : performance.now();
    this.fades.set(id, { from: from ?? view?.root.alpha ?? to, to, start });
  }

  /** Play out fades, removing what's faded out; whether they need more frames. */
  private syncFades(): boolean {
    const now = performance.now();
    let animating = false;
    for (const [id, fade] of this.fades) {
      const view = this.views.get(id) ?? this.leaving.get(id)?.view;
      if (!view) {
        this.fades.delete(id);
        continue;
      }
      const progress = Math.min(1, (now - fade.start) / FADE_MS);
      view.root.alpha = fade.from + (fade.to - fade.from) * easeOut(progress);
      if (progress < 1) {
        animating = true;
        continue;
      }
      if (this.leaving.delete(id)) {
        view.root.destroy(DESTROY_VIEW);
        this.fades.delete(id);
      }
    }
    return animating;
  }

  /** Moves just the elements being dragged, and any just let go. */
  syncPreviews() {
    const s = this.state;
    for (const id of this.previewed) {
      if (s.previews.has(id)) continue;
      const element = s.byId.get(id);
      if (element) this.views.get(id)?.apply(element);
    }
    for (const [id, t] of s.previews) this.views.get(id)?.apply(t);
    this.previewed = new Set(s.previews.keys());
  }

  /**
   * Turn down tokens upside down and grey them, playing out the fall (or
   * getting back up) as it happens. Returns whether it needs more frames.
   */
  private syncDowned(): boolean {
    const s = this.state;
    const now = performance.now();
    const still = reducedMotion.matches;
    let animating = false;
    for (const [id, view] of this.views) {
      const element = s.byId.get(id);
      if (!view.pose || element?.type !== "token") continue;
      const down = this.downed(element);
      let turn = this.turns.get(id);
      if (!turn) {
        // Already down when first drawn: no fall to play.
        turn = { from: down ? 1 : 0, down, start: -Infinity };
        this.turns.set(id, turn);
      } else if (turn.down !== down) {
        const showing = Math.min(1, Math.max(0, downFrame(turn, now - turn.start).turn));
        turn = { from: still ? (down ? 1 : 0) : showing, down, start: still ? -Infinity : now };
        this.turns.set(id, turn);
      }
      const frame = downFrame(turn, now - turn.start);
      if (!frame.done) animating = true;
      view.pose.rotation = Math.PI * frame.turn;
      view.pose.scale.set(frame.scale);
      let grey = this.greys.get(id);
      if (frame.grey > 0) {
        if (!grey) {
          grey = new ColorMatrixFilter();
          grey.desaturate();
          grey.brightness(0.85, true);
          this.greys.set(id, grey);
        }
        grey.alpha = frame.grey;
        if (view.pose.filters?.[0] !== grey) view.pose.filters = grey;
      } else if (view.pose.filters?.length) view.pose.filters = null;
    }
    for (const id of this.turns.keys()) {
      if (this.views.has(id)) continue;
      this.turns.delete(id);
      this.greys.get(id)?.destroy();
      this.greys.delete(id);
    }
    return animating;
  }

  setDropHighlight(tokenId: string | null) {
    if (this.dropHighlightToken === tokenId) return;
    this.dropHighlightToken = tokenId;
    for (const [id, view] of this.views)
      if (view.dropHighlight) view.dropHighlight.visible = id === tokenId;
    this.state.invalidate("overlay");
  }

  flashToken(tokenId: string) {
    const view = this.views.get(tokenId);
    const ring = view?.dropFlash;
    if (!view || !ring) return;
    const oldFrame = this.dropFlashFrames.get(tokenId);
    if (oldFrame) cancelAnimationFrame(oldFrame);
    const start = performance.now();
    ring.visible = true;
    const animate = (now: number) => {
      if (this.destroyed || this.views.get(tokenId) !== view) {
        this.dropFlashFrames.delete(tokenId);
        return;
      }
      const progress = Math.min(1, (now - start) / 360);
      ring.alpha = Math.sin(progress * Math.PI);
      this.state.invalidate("overlay");
      if (progress < 1) this.dropFlashFrames.set(tokenId, requestAnimationFrame(animate));
      else {
        ring.visible = false;
        ring.alpha = 1;
        this.dropFlashFrames.delete(tokenId);
        this.state.invalidate("overlay");
      }
    };
    this.dropFlashFrames.set(tokenId, requestAnimationFrame(animate));
  }
}
