import { Color, type ColorSource, Container, Graphics, Matrix, Sprite } from "pixi.js";
import { shapeOutline } from "../geometry";
import { strokeOutline, hasRealPressure } from "../stroke";
import {
  AREA_COLOURS,
  isPlainToken,
  type SceneElement,
  type ShapeGeometry,
  type ShapePaint,
  type TextStyle,
  type Transform,
} from "../types";
import { EffectView } from "./effects";
import { SdfText } from "./sdfText";
import type { SdfTextOptions } from "./sdfText";
import { ACCENT, cabin, fraunces, INK, textFont } from "./style";
import type { PeerBlobs } from "../../media/images";
import { iconTextureFor, textureFor } from "./textures";

/** An element's drawing: its root in a layer, and how to move it to a transform. */
export interface View {
  root: Container;
  /** Changes when the element needs rebuilding rather than just moving. */
  key: string;
  apply: (t: Transform) => void;
  dropHighlight?: Graphics;
  dropFlash?: Graphics;
  /** A token's body, turned over and greyed when it's down. */
  pose?: Container;
  /** What only the GM sees: a wall, a lamp or area, an effect's outline. */
  helper?: Container;
  /** Play out a moving effect as it is at `time`, in seconds. */
  animate?: (time: number) => void;
}

/** Graphics only free their own geometry when told to destroy their context. */
export const DESTROY_VIEW = { children: true, context: true } as const;

/** What an element's view is drawn from, apart from its transform: a change means a rebuild. */
export function contentKey(element: SceneElement): string {
  switch (element.type) {
    case "map": {
      return `map:${element.image.hash}`;
    }
    case "token": {
      return `token:${element.graphic?.kind === "image" ? element.graphic.image.hash : ""}:${element.graphic?.kind === "icon" ? element.graphic.name : ""}:${element.name}:${element.colour}:${isPlainToken(element) ? "plain" : "disc"}`;
    }
    case "drawing": {
      return `drawing:${element.points.length}:${element.points[0]}:${element.points[1]}:${element.colour}:${element.width}:${element.bw}:${element.bh}`;
    }
    case "shape": {
      return `shape:${element.shape}:${element.shape === "polygon" ? `${element.points.join(",")}:${element.bw}:${element.bh}` : ""}:${element.stroke}:${element.fill}:${element.width}`;
    }
    case "text": {
      return `text:${element.text}:${element.colour}:${element.size}:${element.font}:${element.bold}:${element.italic}:${element.bw}:${element.bh}`;
    }
    case "wall": {
      return `wall:${!!element.door}:${!!element.open}`;
    }
    case "light": {
      return `light:${element.bright}:${element.dim}:${element.colour}`;
    }
    case "area": {
      return `area:${element.tone}:${element.points.join(",")}:${element.bw}:${element.bh}`;
    }
    case "effect": {
      return `effect:${element.effect}:${element.colour}:${element.shape}:${element.shape === "polygon" ? `${element.points.join(",")}:${element.bw}:${element.bh}` : ""}`;
    }
  }
}

/** A shape's outline and inside, painted and drawn in its own frame at its size. */
export function drawShape(
  g: Graphics,
  geo: ShapeGeometry,
  w: number,
  h: number,
  paint: ShapePaint,
  width: number,
) {
  const pts = shapeOutline(geo, w, h).flatMap((p) => [p.x, p.y]);
  g.clear()
    .poly(pts)
    .fill({ color: paint.fill })
    .stroke({ color: paint.stroke, width, join: "round" });
}

/** The width of the dark outline that keeps text on the map readable over any map, at its size. */
export const mapTextOutline = (size: number) => Math.max(2, size / 8);

/** Text on the map: a dark outline keeps it readable over any map. */
export const mapText = (
  look: TextStyle & { size: number },
  colour: ColorSource,
): SdfTextOptions => ({
  font: textFont(look),
  size: look.size,
  fill: colour,
  outline: { color: INK, width: mapTextOutline(look.size) },
  align: "center",
});

/**
 * Build an element's view. `invalidate` asks for a redraw once an image
 * loads; `highlighted` is the token showing as a drop target, if any;
 * `peers` supplies images this device lacks.
 */
export function buildView(
  element: SceneElement,
  key: string,
  invalidate: () => void,
  highlighted: string | null,
  peers: PeerBlobs | null,
): View {
  const root = new Container({ cullable: true });
  switch (element.type) {
    case "map": {
      const placeholder = new Graphics()
        .rect(-0.5, -0.5, 1, 1)
        .fill({ color: 0xFF_FF_FF, alpha: 0.06 });
      root.addChild(placeholder);
      let sprite: Sprite | null = null;
      let missing: SdfText | null = null;
      let size = { w: element.w, h: element.h };
      void textureFor(element.image.hash, peers).then((tex) => {
        if (root.destroyed) return;
        if (!tex) {
          // Not on this device; from M2 a peer will send it.
          placeholder.clear().rect(-0.5, -0.5, 1, 1).fill({ color: 0xFF_FF_FF, alpha: 0.12 });
          missing = new SdfText({
            text: "Image not on this device",
            font: cabin(400),
            size: 28,
            fill: 0xFF_FF_FF,
            anchor: 0.5,
          });
          missing.alpha = 0.7;
          missing.scale.set(Math.min(size.w, size.h) / 900);
          root.addChild(missing);
          invalidate();
          return;
        }
        sprite = new Sprite({ texture: tex, anchor: 0.5 });
        sprite.setSize(size.w, size.h);
        root.addChild(sprite);
        placeholder.visible = false;
        invalidate();
      });
      return {
        root,
        key,
        apply: (t) => {
          size = t;
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          placeholder.scale.set(t.w, t.h);
          sprite?.setSize(t.w, t.h);
          missing?.scale.set(Math.min(t.w, t.h) / 900);
        },
      };
    }

    case "token": {
      // The body is drawn 100 px across and scaled; the label stays upright.
      const body = new Container();
      const image = element.graphic?.kind === "image" ? element.graphic.image : undefined;
      const iconName = element.graphic?.kind === "icon" ? element.graphic.name : undefined;
      if (isPlainToken(element)) {
        // The image as it is, fitted inside the token's square.
        void textureFor(image!.hash, peers).then((tex) => {
          if (root.destroyed) return;
          if (!tex) {
            // Missing image: fall back to a plain disc so the token can be found.
            body.addChild(new Graphics().circle(0, 0, 50).fill({ color: element.colour, alpha: 0.6 }));
            invalidate();
            return;
          }
          const sprite = new Sprite({ texture: tex, anchor: 0.5 });
          sprite.scale.set(100 / Math.max(tex.width, tex.height));
          body.addChild(sprite);
          invalidate();
        });
      } else {
        // A disc: coloured background, the image or an initial, and a ring.
        // The background stops at the ring, so a see-through colour doesn't show darker under it.
        const ring = new Graphics().circle(0, 0, 48).stroke({ color: element.colour, width: 5 });
        body.addChild(new Graphics().circle(0, 0, 45.5).fill({ color: element.colour }), ring);
        const initial = new SdfText({
          text: (element.name.trim()[0] ?? "").toUpperCase(),
          font: fraunces(600),
          size: 52,
          fill: 0xFF_FF_FF,
          anchor: 0.5,
        });
        body.addChildAt(initial, 1);
        if (iconName)
          void iconTextureFor(iconName).then((tex) => {
            if (!tex || root.destroyed) return;
            initial.visible = false;
            const icon = new Sprite({ texture: tex, anchor: 0.5, width: 64, height: 64 });
            body.addChildAt(icon, 1);
          });
        if (image) {
          // The initial stands in until the image loads, or if it's missing.
          void textureFor(image.hash, peers).then((tex) => {
            if (!tex || root.destroyed) return;
            initial.visible = false;
            // Fill a circle with the image, cropping its longer side. A
            // texture fill avoids a stencil mask per token.
            const k = 92 / Math.min(tex.width, tex.height);
            const matrix = new Matrix()
              .scale(k, k)
              .translate((-tex.width * k) / 2, (-tex.height * k) / 2);
            const portrait = new Graphics()
              .circle(0, 0, 46)
              .fill({ texture: tex, matrix, textureSpace: "global" });
            body.addChildAt(portrait, 1);
            invalidate();
          });
        }
      }
      const dropHighlight = new Graphics()
        .circle(0, 0, 49)
        .stroke({ color: 0xFF_FF_FF, width: 3 })
        .circle(0, 0, 45)
        .stroke({ color: ACCENT, width: 4 });
      dropHighlight.visible = element.id === highlighted;
      const dropFlash = new Graphics().circle(0, 0, 50).stroke({ color: 0xFF_FF_FF, width: 10 });
      dropFlash.visible = false;
      body.addChild(dropHighlight, dropFlash);
      const pose = new Container();
      pose.addChild(body);
      root.addChild(pose);

      return {
        root,
        key,
        dropHighlight,
        dropFlash,
        pose,
        apply: (t) => {
          root.position.set(t.x, t.y);
          body.rotation = t.rot;
          body.scale.set(t.w / 100, t.h / 100);
        },
      };
    }

    case "drawing": {
      const g = new Graphics()
        .poly(strokeOutline(element.points, element.width, hasRealPressure(element.points)))
        .fill({ color: element.colour });
      root.addChild(g);
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          g.scale.set(t.w / element.bw, t.h / element.bh);
        },
      };
    }

    case "shape": {
      // Redrawn at its size, so the outline keeps its width when resized.
      const g = new Graphics();
      root.addChild(g);
      let size = "";
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          const next = `${t.w}x${t.h}`;
          if (next !== size) {
            size = next;
            drawShape(g, element, t.w, t.h, element, element.width);
          }
        },
      };
    }

    case "wall": {
      // Walls and lights are the GM's: players see only their effect.
      const g = new Graphics();
      root.addChild(g);
      let size = "";
      return {
        root,
        key,
        helper: g,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          const next = `${t.w}`;
          if (next === size) return;
          size = next;
          const colour = element.door ? 0xE0_A3_3B : 0xD8_E0_FF;
          g.clear()
            .moveTo(-t.w / 2, 0)
            .lineTo(t.w / 2, 0)
            .stroke({
              color: colour,
              width: element.door ? 8 : 5,
              alpha: element.door && element.open ? 0.4 : 0.9,
              cap: "round",
            })
            .circle(-t.w / 2, 0, 4)
            .circle(t.w / 2, 0, 4)
            .fill({ color: colour });
        },
      };
    }

    case "light": {
      const g = new Graphics();
      root.addChild(g);
      return {
        root,
        key,
        helper: g,
        apply: (t) => {
          root.position.set(t.x, t.y);
          const r = Math.min(t.w, t.h) / 2;
          // A drag on its reach handles, or picking its colour, previews the whole light, not just its transform.
          const { bright, dim, colour } = { ...element, ...t } as typeof element;
          g.clear()
            .circle(0, 0, dim)
            .stroke({ color: colour, width: 1.5, alpha: 0.35 })
            .circle(0, 0, bright)
            .stroke({ color: colour, width: 1.5, alpha: 0.6 })
            .circle(0, 0, r)
            .fill({ color: colour })
            .stroke({ color: INK, width: 2 });
        },
      };
    }

    case "area": {
      const g = new Graphics();
      const colour = AREA_COLOURS[element.tone];
      const pts = element.points;
      root.addChild(g);
      return {
        root,
        key,
        helper: g,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          const sx = t.w / element.bw;
          const sy = t.h / element.bh;
          g.clear()
            .poly(pts.map((v, index) => v * (index % 2 ? sy : sx)))
            .fill({ color: colour, alpha: 0.12 })
            .stroke({ color: colour, width: 2, alpha: 0.8 });
        },
      };
    }

    case "effect": {
      const view = new EffectView(element);
      return {
        root: view.root,
        key,
        helper: view.outline,
        apply: (t) => view.apply(t),
        animate: (time) => view.animate(time),
      };
    }

    case "text": {
      // A see-through colour fades the text and its outline together.
      const colour = new Color(element.colour);
      const text = new SdfText({
        ...mapText(element, colour.toNumber()),
        text: element.text,
        anchor: 0.5,
      });
      text.alpha = colour.alpha;
      root.addChild(text);
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          text.scale.set(t.w / element.bw, t.h / element.bh);
        },
      };
    }
  }
}
