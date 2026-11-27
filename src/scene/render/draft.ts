import { Graphics } from "pixi.js";
import type { Container } from "pixi.js";
import type { Point } from "../grid";
import { strokeOutline, hasRealPressure } from "../stroke";
import type { DraggedShapeKind, Layer, ShapePaint, Transform } from "../types";
import type { Segment } from "../vision";
import { drawShape } from "./elementViews";
import { flat } from "./style";

/**
 * What's being drawn, before it's added: a pen stroke, a polygon placed a
 * corner at a time, a shape being dragged out (with its size to show), or
 * walls found on a map.
 */
export type Draft =
  | {
      kind: "polygon";
      points: Point[];
      paint: ShapePaint;
      /** Outline width, in world px. */
      width: number;
      layer: Layer;
    }
  | {
      kind: "shape";
      shape: DraggedShapeKind;
      t: Transform;
      paint: ShapePaint;
      /** Outline width, in screen px. */
      width: number;
      layer: Layer;
      label?: string;
    }
  | {
      kind: "walls";
      walls: Segment[];
      colour: string;
      /** Line width, in screen px. */
      width: number;
      layer: Layer;
    }
  | {
      kind?: "stroke";
      points: number[];
      colour: string;
      width: number;
      layer: Layer;
    };

/** What's being drawn, in the layer it will land in. */
export class DraftLayer {
  private readonly g = new Graphics();

  draw(d: Draft | null, layers: Record<Layer, Container>, zoom: number) {
    const g = this.g.clear();
    if (!d) {
      g.removeFromParent();
      return;
    }
    if (g.parent !== layers[d.layer]) layers[d.layer].addChild(g);
    if (d.kind === "polygon") {
      g.position.set(0, 0);
      g.rotation = 0;
      const { paint } = d;
      if (d.points.length === 0) return;
      if (d.points.length > 2) g.poly(flat(d.points)).fill({ color: paint.fill });
      const first = d.points[0]!;
      g.moveTo(first.x, first.y);
      for (const p of d.points.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ color: paint.stroke, width: d.width, join: "round" });
      // The corners so far, solid so they show whatever the paint.
      for (const p of d.points.slice(0, -1)) g.circle(p.x, p.y, 4 / zoom);
      g.fill({ color: paint.stroke });
      return;
    }
    if (d.kind === "walls") {
      g.position.set(0, 0);
      g.rotation = 0;
      for (const { a, b } of d.walls) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      g.stroke({ color: d.colour, width: d.width / zoom, cap: "round" });
      // Their ends, so where one wall meets the next shows.
      for (const { a, b } of d.walls)
        g.circle(a.x, a.y, d.width / zoom).circle(b.x, b.y, d.width / zoom);
      g.fill({ color: d.colour });
      return;
    }
    if (d.kind === "shape") {
      drawShape(g, d, d.t.w, d.t.h, d.paint, d.width / zoom);
      g.position.set(d.t.x, d.t.y);
      g.rotation = d.t.rot;
      return;
    }
    g.position.set(0, 0);
    g.rotation = 0;
    g.poly(strokeOutline(d.points, d.width, hasRealPressure(d.points))).fill({
      color: d.colour,
    });
  }
}
