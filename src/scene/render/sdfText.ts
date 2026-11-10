import { BitmapFontManager, BitmapText, Container, TextStyle } from "pixi.js";
import type { ColorSource, PointData } from "pixi.js";
import { sdfFont } from "./sdfFont";
import type { SdfFontSpec } from "./sdfFont";

export interface SdfTextOptions {
  font: SdfFontSpec;
  size: number;
  fill: ColorSource;
  /** Drawn behind the text; `width` is the stroke's full width, in px at `size`. */
  outline?: { color: ColorSource; width: number };
  align?: "left" | "center" | "right";
  /** Wrap lines wider than this, in px at `size`. */
  wrapWidth?: number;
}

/** Outlines are quantised so text of differing sizes shares a few fonts. */
const haloRatio = (o: SdfTextOptions) =>
  o.outline ? Math.round((o.outline.width / 2 / o.size) * 100) / 100 : 0;

const wrapStyle = (o: SdfTextOptions) => ({
  fontSize: o.size,
  align: o.align ?? "left",
  ...(o.wrapWidth !== undefined && {
    wordWrap: true,
    breakWords: true,
    wordWrapWidth: o.wrapWidth,
  }),
});

const layerStyle = (o: SdfTextOptions, ratio: number, fill: ColorSource) => ({
  ...wrapStyle(o),
  fontFamily: sdfFont(o.font, ratio),
  fill,
});

/** The size text takes up, outline included, in px. */
export function measureSdfText(text: string, o: SdfTextOptions) {
  const m = BitmapFontManager.measureText(text, new TextStyle(layerStyle(o, 0, o.fill)));
  const pad = o.outline?.width ?? 0;
  return { w: m.width * m.scale + pad, h: m.height * m.scale + pad };
}

/** Text drawn from signed distance fields: sharp at any scale, with an optional outline. */
export class SdfText extends Container {
  private readonly body: BitmapText;
  private readonly halo: BitmapText | null;

  constructor(o: SdfTextOptions & { text?: string; anchor?: number | PointData }) {
    super();
    const text = o.text ?? "";
    const anchor = o.anchor ?? 0;
    this.halo = o.outline
      ? new BitmapText({
          text,
          anchor,
          style: layerStyle(o, haloRatio(o), o.outline.color),
        })
      : null;
    this.body = new BitmapText({ text, anchor, style: layerStyle(o, 0, o.fill) });
    if (this.halo) this.addChild(this.halo);
    this.addChild(this.body);
  }

  get text() {
    return this.body.text;
  }

  set text(text: string) {
    this.body.text = text;
    if (this.halo) this.halo.text = text;
  }

  set fill(fill: ColorSource) {
    this.body.style.fill = fill;
  }

  /** Lines wider than this wrap, in px at the font size. */
  set wrapWidth(width: number) {
    for (const layer of [this.body, this.halo]) if (layer) layer.style.wordWrapWidth = width;
  }
}
