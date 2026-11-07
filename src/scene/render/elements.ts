import type { Container } from "pixi.js";
import { LAYERS, type Layer } from "../types";
import { buildView, contentKey, DESTROY_VIEW, type View } from "./elementViews";
import type { RenderState } from "./state";

/** The scene's elements: a view per element, kept in its layer and in order. */
export class ElementLayer {
  private views = new Map<string, View>();
  /** Elements given a preview transform at the last sync, to put back once it's gone. */
  private previewed = new Set<string>();
  private order = "";
  private dropHighlightToken: string | null = null;
  private dropFlashFrames = new Map<string, number>();
  private destroyed = false;

  constructor(
    private readonly state: RenderState,
    private readonly layers: Record<Layer, Container>,
  ) {}

  destroy() {
    this.destroyed = true;
    for (const frame of this.dropFlashFrames.values()) cancelAnimationFrame(frame);
    this.dropFlashFrames.clear();
  }

  /** Rebuild every view on the next sync, such as once missing images can be fetched. */
  rebuildAll() {
    for (const view of this.views.values()) view.key = "";
  }

  /** Hide what's hidden for now (erased strokes), the GM's walls from everyone else, and lamps and areas outside the Lights tool. */
  syncHidden(showHelpers: boolean, lightsShown: boolean) {
    const s = this.state;
    for (const [id, view] of this.views) {
      const type = s.byId.get(id)?.type;
      const helper =
        type === "wall"
          ? showHelpers
          : type === "light" || type === "area"
            ? showHelpers && lightsShown
            : true;
      view.root.visible = !s.hidden.has(id) && helper;
    }
  }

  sync() {
    const s = this.state;
    const seen = new Set<string>();
    for (const el of s.elements) {
      seen.add(el.id);
      const key = contentKey(el);
      let view = this.views.get(el.id);
      if (view && view.key !== key) {
        view.root.destroy(DESTROY_VIEW);
        view = undefined;
      }
      if (!view) {
        view = buildView(el, key, () => s.invalidate(), this.dropHighlightToken);
        this.views.set(el.id, view);
        // A new view isn't in a layer yet, so force a restack.
        this.order = "";
      }
      view.apply(s.previews.get(el.id) ?? el);
    }
    this.previewed = new Set(s.previews.keys());
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.root.destroy(DESTROY_VIEW);
        this.views.delete(id);
      }
    }
    // Restack only when the order (or a layer) actually changed.
    const order = s.elements.map((e) => `${e.layer}:${e.id}`).join();
    if (order !== this.order) {
      this.order = order;
      for (const layer of LAYERS) this.layers[layer].removeChildren();
      for (const el of s.elements) this.layers[el.layer].addChild(this.views.get(el.id)!.root);
    }
  }

  /** Moves just the elements being dragged, and any just let go. */
  syncPreviews() {
    const s = this.state;
    for (const id of this.previewed) {
      if (s.previews.has(id)) continue;
      const el = s.byId.get(id);
      if (el) this.views.get(id)?.apply(el);
    }
    for (const [id, t] of s.previews) this.views.get(id)?.apply(t);
    this.previewed = new Set(s.previews.keys());
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
