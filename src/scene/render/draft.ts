import { type Container, Graphics } from "pixi.js";
import type { Point } from "../grid";
import { strokeOutline, hasRealPressure } from "../stroke";
import type { Layer, ShapeKind, Transform } from "../types";
import { drawShape } from "./elementViews";
import { flat } from "./style";

/** What's being drawn, before it's added: a pen stroke, or a shape being dragged out (with its size to show). */
export type Draft =
  | {
      kind?: "stroke";
      points: number[];
      colour: string;
      width: number;
      layer: Layer;
    }
  | { kind: "polygon"; points: Point[]; colour: string; layer: Layer }
  | {
      kind: "shape";
      shape: ShapeKind;
      t: Transform;
      colour: string;
      width: number;
      layer: Layer;
      label?: string;
    };

/** What's being drawn, in the layer it will land in. */
export class DraftLayer {
  private g = new Graphics();

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
      const width = 2 / zoom;
      if (!d.points.length) return;
      if (d.points.length > 2) g.poly(flat(d.points)).fill({ color: d.colour, alpha: 0.15 });
      const first = d.points[0]!;
      g.moveTo(first.x, first.y);
      for (const p of d.points.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ color: d.colour, width });
      for (const p of d.points.slice(0, -1)) g.circle(p.x, p.y, 4 / zoom);
      g.fill({ color: d.colour });
      return;
    }
    if (d.kind === "shape") {
      drawShape(g, d.shape, d.t.w, d.t.h, d.colour, d.width / zoom);
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
