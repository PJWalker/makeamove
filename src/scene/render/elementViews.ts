import { Container, Graphics, Matrix, Sprite } from "pixi.js";
import { shapeOutline } from "../geometry";
import { strokeOutline, hasRealPressure } from "../stroke";
import {
  AREA_COLOURS,
  isPlainToken,
  type SceneElement,
  type ShapeKind,
  type Transform,
} from "../types";
import { SdfText } from "./sdfText";
import type { SdfTextOptions } from "./sdfText";
import { ACCENT, cabin, fraunces, INK } from "./style";
import { iconGraphicFor, textureFor } from "./textures";

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
}

/** Graphics only free their own geometry when told to destroy their context. */
export const DESTROY_VIEW = { children: true, context: true } as const;

/** What an element's view is drawn from, apart from its transform: a change means a rebuild. */
export function contentKey(el: SceneElement): string {
  switch (el.type) {
    case "map":
      return `map:${el.image.hash}`;
    case "token":
      return `token:${el.graphic?.kind === "image" ? el.graphic.image.hash : ""}:${el.graphic?.kind === "icon" ? el.graphic.name : ""}:${el.name}:${el.colour}:${isPlainToken(el) ? "plain" : "disc"}`;
    case "drawing":
      return `drawing:${el.points.length}:${el.points[0]}:${el.points[1]}:${el.colour}:${el.width}:${el.bw}:${el.bh}`;
    case "shape":
      return `shape:${el.shape}:${el.colour}:${el.width}`;
    case "text":
      return `text:${el.text}:${el.colour}:${el.size}:${el.bw}:${el.bh}`;
    case "wall":
      return `wall:${!!el.door}:${!!el.open}`;
    case "light":
      return `light:${el.bright}:${el.dim}:${el.colour}`;
    case "area":
      return `area:${el.tone}:${el.points.join(",")}:${el.bw}:${el.bh}`;
  }
}

/** A shape's outline and tinted inside, drawn in its own frame at its size. */
export function drawShape(
  g: Graphics,
  shape: ShapeKind,
  w: number,
  h: number,
  colour: string,
  width: number,
) {
  const pts = shapeOutline(shape, w, h).flatMap((p) => [p.x, p.y]);
  g.clear()
    .poly(pts)
    .fill({ color: colour, alpha: 0.22 })
    .stroke({ color: colour, width, join: "round" });
}

/** Text on the map: a light outline keeps it readable over any map. */
export const mapText = (colour: string, size: number): SdfTextOptions => ({
  font: cabin(700),
  size,
  fill: colour,
  outline: { color: INK, width: Math.max(2, size / 8) },
  align: "center",
});

/**
 * Build an element's view. `invalidate` asks for a redraw once an image
 * loads; `highlighted` is the token showing as a drop target, if any.
 */
export function buildView(
  el: SceneElement,
  key: string,
  invalidate: () => void,
  highlighted: string | null,
): View {
  const root = new Container({ cullable: true });
  switch (el.type) {
    case "map": {
      const placeholder = new Graphics()
        .rect(-0.5, -0.5, 1, 1)
        .fill({ color: 0xffffff, alpha: 0.06 });
      root.addChild(placeholder);
      let sprite: Sprite | null = null;
      let missing: SdfText | null = null;
      let size = { w: el.w, h: el.h };
      void textureFor(el.image.hash).then((tex) => {
        if (root.destroyed) return;
        if (!tex) {
          // Not on this device; from M2 a peer will send it.
          placeholder.clear().rect(-0.5, -0.5, 1, 1).fill({ color: 0xffffff, alpha: 0.12 });
          missing = new SdfText({
            text: "Image not on this device",
            font: cabin(400),
            size: 28,
            fill: 0xffffff,
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
      const image = el.graphic?.kind === "image" ? el.graphic.image : undefined;
      const iconName = el.graphic?.kind === "icon" ? el.graphic.name : undefined;
      if (isPlainToken(el)) {
        // The image as it is, fitted inside the token's square.
        void textureFor(image!.hash).then((tex) => {
          if (root.destroyed) return;
          if (!tex) {
            // Missing image: fall back to a plain disc so the token can be found.
            body.addChild(new Graphics().circle(0, 0, 50).fill({ color: el.colour, alpha: 0.6 }));
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
        const ring = new Graphics().circle(0, 0, 48).stroke({ color: el.colour, width: 5 });
        body.addChild(new Graphics().circle(0, 0, 50).fill({ color: el.colour }), ring);
        const initial = new SdfText({
          text: (el.name.trim()[0] ?? "").toUpperCase(),
          font: fraunces(600),
          size: 52,
          fill: 0xffffff,
          anchor: 0.5,
        });
        body.addChildAt(initial, 1);
        if (iconName) {
          const icon = iconGraphicFor(iconName);
          if (icon) {
            initial.visible = false;
            body.addChildAt(icon, 1);
          }
        }
        if (image) {
          // The initial stands in until the image loads, or if it's missing.
          void textureFor(image.hash).then((tex) => {
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
        .stroke({ color: 0xffffff, width: 3 })
        .circle(0, 0, 45)
        .stroke({ color: ACCENT, width: 4 });
      dropHighlight.visible = el.id === highlighted;
      const dropFlash = new Graphics().circle(0, 0, 50).stroke({ color: 0xffffff, width: 10 });
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
        .poly(strokeOutline(el.points, el.width, hasRealPressure(el.points)))
        .fill({ color: el.colour });
      root.addChild(g);
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          g.scale.set(t.w / el.bw, t.h / el.bh);
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
            drawShape(g, el.shape, t.w, t.h, el.colour, el.width);
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
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          const next = `${t.w}`;
          if (next === size) return;
          size = next;
          const colour = el.door ? 0xe0a33b : 0xd8e0ff;
          g.clear()
            .moveTo(-t.w / 2, 0)
            .lineTo(t.w / 2, 0)
            .stroke({
              color: colour,
              width: el.door ? 8 : 5,
              alpha: el.door && el.open ? 0.4 : 0.9,
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
        apply: (t) => {
          root.position.set(t.x, t.y);
          const r = Math.min(t.w, t.h) / 2;
          // A drag on its reach handles, or picking its colour, previews the whole light, not just its transform.
          const { bright, dim, colour } = { ...el, ...t } as typeof el;
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
      const colour = AREA_COLOURS[el.tone];
      const pts = el.points;
      root.addChild(g);
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          const sx = t.w / el.bw;
          const sy = t.h / el.bh;
          g.clear()
            .poly(pts.map((v, i) => v * (i % 2 ? sy : sx)))
            .fill({ color: colour, alpha: 0.12 })
            .stroke({ color: colour, width: 2, alpha: 0.8 });
        },
      };
    }

    case "text": {
      const text = new SdfText({ ...mapText(el.colour, el.size), text: el.text, anchor: 0.5 });
      root.addChild(text);
      return {
        root,
        key,
        apply: (t) => {
          root.position.set(t.x, t.y);
          root.rotation = t.rot;
          text.scale.set(t.w / el.bw, t.h / el.bh);
        },
      };
    }
  }
}
