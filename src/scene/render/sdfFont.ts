import TinySDF from "@mapbox/tiny-sdf";
import {
  AbstractBitmapFont,
  BufferImageSource,
  Cache,
  CanvasTextMetrics,
  Rectangle,
  Texture,
} from "pixi.js";

/** Glyphs are rasterised at this size; text at any other size is scaled from it. */
const GLYPH_SIZE = 128;
/** How far from a glyph's edge the distance field reaches, in glyph px. */
const RANGE = 16;
const PAGE_SIZE = 2048;

export interface SdfFontSpec {
  family: string;
  weight: number;
}

/** The registry name of an SDF font; BitmapText finds the font by its `fontFamily`. */
export const sdfFontName = (spec: SdfFontSpec, haloRatio: number) =>
  `sdf:${spec.family}:${spec.weight}:${haloRatio.toFixed(2)}`;

/** Wait for the web fonts glyphs are drawn from, so no fallback glyphs get baked into an atlas. */
export const loadSdfFonts = (specs: SdfFontSpec[]) =>
  Promise.all(specs.map((s) => document.fonts.load(`${s.weight} ${GLYPH_SIZE}px ${s.family}`)));

/**
 * A bitmap font whose glyphs are signed distance fields, drawn on demand.
 *
 * With a halo, the field is shifted outward so the glyph reads as that much bolder: drawn
 * behind the plain font it makes an outline, at any scale.
 */
export class SdfFont extends AbstractBitmapFont<SdfFont> {
  private readonly sdf: TinySDF;
  private readonly buffer: number;
  private readonly known = new Set<string>();
  private page: { data: Uint8Array; source: BufferImageSource } | null = null;
  private x = 0;
  private y = 0;
  private rowHeight = 0;

  /** @param halo How far the glyph grows outward, in glyph px. */
  constructor(spec: SdfFontSpec, halo: number) {
    super();
    // The field falls from 1 inside to 0 at (1 - cutoff) * RANGE outside the edge.
    const cutoff = 0.5 - halo / RANGE;
    this.buffer = Math.ceil(RANGE * (1 - cutoff)) + 1;
    this.sdf = new TinySDF({
      fontSize: GLYPH_SIZE,
      buffer: this.buffer,
      radius: RANGE,
      cutoff,
      fontFamily: spec.family,
      fontWeight: String(spec.weight),
    });
    const fontMetrics = CanvasTextMetrics.measureFont(
      `${spec.weight} ${GLYPH_SIZE}px ${spec.family}`,
    );
    // Pixi declares these readonly: they're set once, by the font itself.
    Object.assign(this, {
      fontFamily: sdfFontName(spec, halo / GLYPH_SIZE),
      distanceField: { type: "sdf", range: RANGE },
      baseMeasurementFontSize: GLYPH_SIZE,
      baseRenderedFontSize: GLYPH_SIZE,
      fontMetrics,
      lineHeight: fontMetrics.fontSize,
    });
  }

  /** Called by BitmapText with every string it is about to draw. */
  ensureCharacters(text: string) {
    const fresh = CanvasTextMetrics.graphemeSegmenter(text).filter((c) => !this.known.has(c));
    for (const char of new Set(fresh)) this.addGlyph(char);
    this.page?.source.update();
  }

  private addGlyph(char: string) {
    this.known.add(char);
    const glyph = this.sdf.draw(char);
    this.chars[char] = {
      id: char.codePointAt(0) ?? 0,
      xOffset: glyph.glyphLeft - this.buffer,
      yOffset: this.fontMetrics.ascent - glyph.glyphTop - this.buffer,
      xAdvance: glyph.glyphAdvance,
      kerning: {},
    };
    if (glyph.glyphWidth === 0 || glyph.glyphHeight === 0 || /\s/.test(char)) return;

    const { width, height } = glyph;
    if (this.x + width > PAGE_SIZE) {
      this.x = 0;
      this.y += this.rowHeight;
      this.rowHeight = 0;
    }
    if (!this.page || this.y + height > PAGE_SIZE) this.addPage();
    const { data, source } = this.page!;
    for (let i = 0; i < width * height; i++) {
      const at = ((this.y + Math.floor(i / width)) * PAGE_SIZE + this.x + (i % width)) * 4;
      data.fill(glyph.data[i] ?? 0, at, at + 4);
    }
    this.chars[char].texture = new Texture({
      source,
      frame: new Rectangle(this.x, this.y, width, height),
    });
    this.x += width;
    this.rowHeight = Math.max(this.rowHeight, height);
  }

  private addPage() {
    const data = new Uint8Array(PAGE_SIZE * PAGE_SIZE * 4);
    const source = new BufferImageSource({
      resource: data,
      width: PAGE_SIZE,
      height: PAGE_SIZE,
      alphaMode: "no-premultiply-alpha",
      autoGenerateMipmaps: false,
    });
    this.page?.source.update();
    this.page = { data, source };
    this.pages.push({ texture: new Texture({ source }) });
    this.x = this.y = this.rowHeight = 0;
  }
}

/** The font for this spec and halo, made the first time it's asked for. */
export function sdfFont(spec: SdfFontSpec, haloRatio: number): string {
  const name = sdfFontName(spec, haloRatio);
  if (!Cache.has(`${name}-bitmap`)) {
    const font = new SdfFont(spec, haloRatio * GLYPH_SIZE);
    Cache.set(`${name}-bitmap`, font);
    font.once("destroy", () => Cache.remove(`${name}-bitmap`));
  }
  return name;
}
