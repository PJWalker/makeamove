import { Graphics } from "pixi.js";
import { type Rect, visibleWorld } from "../camera";
import { hexCellsIn, hexCentre, hexCorners, squareLines } from "../grid";
import type { RenderState } from "./state";

/**
 * The grid's lines. Graphics are expensive to rebuild, so the grid is drawn
 * over twice the visible area and only redrawn once the view moves outside
 * that. Lines are pixelLine (always 1 px), so zooming in needs no redraw either.
 */
export class GridLayer {
  readonly view = new Graphics();
  /** World area the grid lines currently cover. */
  private covers: Rect | null = null;

  /** Redraw on the next draw, wherever the view is: the grid itself changed. */
  reset() {
    this.covers = null;
  }

  draw(s: RenderState) {
    const g = this.view;
    const grid = s.grid;
    // Fade the grid out as cells get too small to read; hexes sooner, as
    // they're busier.
    const cell = grid.size * s.camera.zoom;
    const [from, to] = grid.type === "hex" ? [12, 28] : [6, 20];
    const fade = grid.type === "none" ? 0 : Math.min(1, Math.max(0, (cell - from) / (to - from)));
    g.alpha = fade;
    if (!fade) return;

    const { width, height } = s.size;
    const visible = visibleWorld(s.camera, width, height);
    const c = this.covers;
    if (
      c &&
      visible.x >= c.x &&
      visible.y >= c.y &&
      visible.x + visible.w <= c.x + c.w &&
      visible.y + visible.h <= c.y + c.h
    ) {
      return;
    }
    const view = {
      x: visible.x - visible.w / 2,
      y: visible.y - visible.h / 2,
      w: visible.w * 2,
      h: visible.h * 2,
    };
    this.covers = view;
    g.clear();
    if (grid.type === "square") {
      const { xs, ys } = squareLines(grid, view);
      for (const x of xs) g.moveTo(x, view.y).lineTo(x, view.y + view.h);
      for (const y of ys) g.moveTo(view.x, y).lineTo(view.x + view.w, y);
    } else {
      // Each hex draws its three upper edges; neighbours supply the rest.
      for (const { q, r } of hexCellsIn(grid, view)) {
        const c = hexCorners(hexCentre(grid, q, r), grid.size);
        const c0 = c[0]!;
        const c3 = c[3]!;
        const c4 = c[4]!;
        const c5 = c[5]!;
        g.moveTo(c3.x, c3.y).lineTo(c4.x, c4.y).lineTo(c5.x, c5.y).lineTo(c0.x, c0.y);
      }
    }
    // A dark line and a light one on the same pixels read on maps of any
    // brightness.
    g.stroke({ color: 0x000000, alpha: 0.3, pixelLine: true });
    g.stroke({ color: 0xffffff, alpha: 0.14, pixelLine: true });
  }
}
