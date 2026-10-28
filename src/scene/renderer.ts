import { AlphaFilter, Application, CanvasTextMetrics, Container, CullerPlugin, extensions, Graphics, ImageSource, Matrix, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { type Camera, type Rect, toScreen, visibleWorld } from './camera'
import { areaPolygon, corners, fromLocal as fromLocalPoint, shapeOutline } from './geometry'
import { type Grid, DEFAULT_GRID, type Point, hexCellsIn, hexCentre, hexCorners, squareLines } from './grid'
import { formatDistance, measure, tokenDistance } from './measure'
import { forgetBitmaps, loadBitmap, onBlobFetcher } from "./images";
import { PING_MS, TRAIL_MS, type PresenceMark } from "./presence";
import type { TokenStat } from '../systems/types'
import { strokeOutline, hasRealPressure } from './stroke'
import { blocked, blockingSegments, distanceToSegment, lightReach, type Segment, TOKEN_SHADE, tokenBlocker } from './vision'
import { type Blocker, Lamp } from './lampShader'
import { AREA_COLOURS, isPlainToken, LAYERS, type Layer, type SceneElement, type ShapeKind, type Transform } from './types'

/** The UI accent, oklch(82% 0.15 85), as sRGB for the canvas. */
const ACCENT = 0xf0bb3b
const INK = 0x14161c

/** Token names never get smaller or bigger than this on screen, in px. */
const NAME_MIN = 11;
const NAME_MAX = 15;
/** A scene's lighting: whether it's on, and how dark it is where no light reaches (0 to 1). */
export interface Lighting {
  enabled: boolean;
  darkness: number;
}

/** An angle from an id, so each flickering light keeps its own rhythm. */
function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 6283) / 1000;
}

/** Points as Pixi's flat [x, y, x, y…]. */
const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** A token's condition pips and whether it's that token's turn. */
export interface TokenMarks {
  /** One colour per condition. */
  pips: string[];
  turn: boolean;
}
const NO_MARKS: TokenMarks = { pips: [], turn: false };
const PIP_MIN_R = 3;
const PIP_MAX_R = 6;
/** More conditions than this show only this many pips. */
const PIP_MAX = 6;
const TURN_COLOUR = 0xf0c23b;

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

/** Screen px between a selection's top edge and its rotate handle. */
export const ROTATE_HANDLE_GAP = 28
export const HANDLE_SIZE = 10

/** What's being drawn, before it's added: a pen stroke, or a shape being dragged out (with its size to show). */
export type Draft =
  | { kind?: 'stroke'; points: number[]; colour: string; width: number; layer: Layer }
  | { kind: 'polygon'; points: Point[]; colour: string; layer: Layer }
  | { kind: 'shape'; shape: ShapeKind; t: Transform; colour: string; width: number; layer: Layer; label?: string }

export interface OverlayState {
  selected: SceneElement[]
  /** Show resize and rotate handles (one unlocked element selected). */
  handles: boolean
  /** Frame around a multi-selection, with a knob to rotate it as a group. */
  group: Transform | null
  marquee: Rect | null
  /** The eraser's reach, in world coordinates. */
  eraser: { p: Point; r: number } | null
  /** The token this device's targets are measured from, if any. */
  rangeFrom: string | null
}

interface View {
  root: Container
  /** Changes when the element needs rebuilding rather than just moving. */
  key: string
  apply: (t: Transform) => void
}

// Skip drawing elements that are off screen.
extensions.add(CullerPlugin)

/** A remote cursor travelling from one reported position to the next. */
interface CursorMove {
  from: Point;
  to: Point;
  start: number;
}

/** Cursor reports arrive about every 50 ms (~3 frames); glide across that gap. */
const CURSOR_GLIDE_MS = 50;

function cursorAt(m: CursorMove, now: number): Point {
  const k = Math.min(1, (now - m.start) / CURSOR_GLIDE_MS);
  return {
    x: m.from.x + (m.to.x - m.from.x) * k,
    y: m.from.y + (m.to.y - m.from.y) * k,
  };
}

const textures = new Map<string, Promise<Texture | null>>()

/** Free every texture; call when the last renderer goes away. */
function releaseTextures() {
  for (const p of textures.values()) p.then((t) => t?.destroy(true))
  textures.clear()
  forgetBitmaps()
}

function textureFor(hash: string): Promise<Texture | null> {
  let p = textures.get(hash)
  if (!p) {
    p = loadBitmap(hash).then((bitmap) =>
      bitmap
        ? new Texture({
            source: new ImageSource({
              resource: bitmap,
              autoGenerateMipmaps: true,
            }),
          })
        : null,
    );
    textures.set(hash, p);
    // A miss isn't final; a peer may supply it later.
    p.then((t) => t || textures.get(hash) !== p || textures.delete(hash));
  }
  return p
}

/** Graphics only free their own geometry when told to destroy their context. */
const DESTROY_VIEW = { children: true, context: true } as const

function contentKey(el: SceneElement): string {
  switch (el.type) {
    case 'map':
      return `map:${el.image.hash}`
    case 'token':
      return `token:${el.image?.hash ?? ''}:${el.name}:${el.colour}:${isPlainToken(el) ? 'plain' : 'disc'}`
    case 'drawing':
      return `drawing:${el.points.length}:${el.points[0]}:${el.points[1]}:${el.colour}:${el.width}:${el.bw}:${el.bh}`
    case 'shape':
      return `shape:${el.shape}:${el.colour}:${el.width}`
    case 'text':
      return `text:${el.text}:${el.colour}:${el.size}:${el.bw}:${el.bh}`
    case 'wall':
      return `wall:${!!el.door}:${!!el.open}`
    case 'light':
      return `light:${el.bright}:${el.dim}:${el.colour}`
    case 'area':
      return `area:${el.tone}:${el.points.join(',')}:${el.bw}:${el.bh}`
  }
}

/** A shape's outline and tinted inside, drawn in its own frame at its size. */
export function drawShape(g: Graphics, shape: ShapeKind, w: number, h: number, colour: string, width: number) {
  const pts = shapeOutline(shape, w, h).flatMap((p) => [p.x, p.y])
  g.clear().poly(pts).fill({ color: colour, alpha: 0.22 }).stroke({ color: colour, width, join: 'round' })
}

/** Text on the map: a light outline keeps it readable over any map. */
export const textStyle = (colour: string, size: number) => ({
  fontFamily: 'Cabin, sans-serif',
  fontSize: size,
  fontWeight: '700' as const,
  fill: colour,
  stroke: { color: INK, width: Math.max(2, size / 8), join: 'round' as const },
  align: 'center' as const,
})

/**
 * Draws a scene with PixiJS. It renders on demand rather than every frame:
 * anything that changes the picture calls invalidate(), and the next
 * animation frame redraws once.
 */
export class SceneRenderer {
  readonly app = new Application();
  // A render group, so panning and zooming is one GPU transform.
  readonly world = new Container({ isRenderGroup: true });
  readonly layers = Object.fromEntries(
    LAYERS.map((l) => [l, new Container()]),
  ) as Record<Layer, Container>;
  private gridLines = new Graphics();
  /** World area the grid lines currently cover; redrawn only when the view leaves it. */
  private gridCovers: Rect | null = null;
  private draftG = new Graphics();
  private overlay = new Graphics();
  private presenceG = new Graphics();
  private labels = new Container();
  private labelPool = new Map<string, Text>();
  /** Token names, drawn in screen space so they stay readable at any zoom. */
  private names = new Container();
  private namePool = new Map<string, Text>();
  /** Tokens' stat bars, also in screen space, with their values. */
  private barsG = new Graphics();
  private barText = new Container();
  private barTextPool = new Map<string, Text>();
  /** The token under the pointer, whose name always shows. */
  private hoverToken: string | null = null;
  private marks: PresenceMark[] = [];
  private cursors = new Map<string, CursorMove>();
  private views = new Map<string, View>();
  /** What a linked token shows, from its character. */
  private statsFor: (characterId: string) => TokenStat[] = () => [];
  /** Condition pips and the turn marker, by token (see setTokenMarks). */
  private marksFor: (tokenId: string, characterId?: string) => TokenMarks = () => NO_MARKS;
  private elements: SceneElement[] = [];
  private byId = new Map<string, SceneElement>();
  /** Elements given a preview transform at the last render, to put back once it's gone. */
  private previewed = new Set<string>();
  private order = "";
  private frame = 0;
  /**
   * What needs redrawing. previews: only drag transforms moved, not the
   * elements themselves. presence: only cursors, pings, trails and rulers.
   */
  private dirty = { elements: false, previews: false, camera: true, grid: true, overlay: true, presence: true, lighting: true };
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private stopFetcherWatch: (() => void) | null = null;

  camera: Camera = { x: 0, y: 0, zoom: 1 };
  grid: Grid = DEFAULT_GRID;
  /** Live transforms while dragging; committed to the CRDT on release. */
  readonly previews = new Map<string, Transform>();
  /** Elements to hide for now, such as strokes the eraser has passed over. */
  readonly hidden = new Set<string>();
  overlayState: OverlayState = {
    selected: [],
    handles: false,
    group: null,
    marquee: null,
    eraser: null,
    rangeFrom: null,
  };
  draft: Draft | null = null;
  /** Show the GM's walls and lights (only the GM sees them). */
  showHelpers = false;
  /** Whether the Lights tool is in use: only then do the GM's lamps and areas show. */
  lightsShown = false;
  /** The scene's lighting: off, or how dark it is where no light reaches (0 to 1). */
  lighting: Lighting = { enabled: false, darkness: 0 };
  /**
   * The tokens whose sight this device sees by (a player's own characters),
   * or null to see everything (the GM, or a player with no tokens here).
   */
  viewers: string[] | null = null;
  /** Darkness where lights don't reach, with lights erased out of it. */
  private lightLayer = new Container();
  private lightG = new Graphics();
  /** Each light's reach, erased from the darkness by the lamp shader. */
  private lampLayer = new Container();
  private lamps = new Map<string, Lamp>();
  /** Each light's colour, washed over what it lights, under the darkness. */
  private tintLayer = new Container();
  private tints = new Map<string, Lamp>();
  /** The lights that flicker, with an offset so no two waver together. */
  private flickering: { lamps: Lamp[]; phase: number }[] = [];
  /** Areas of solid light, erased from the darkness. */
  private lightErase = new Graphics({ blendMode: "erase" });
  /** Areas of solid dark, over everything else. */
  private lightDark = new Graphics();
  /** Everything outside the viewers' sight, with what they see erased out of it. */
  private fogLayer = new Container();
  private fogG = new Graphics();
  private sights = new Map<string, Lamp>();
  /** Where the viewers see from and the walls in the way, for hiding the names of tokens they can't see. */
  private sight: { from: Point[]; walls: Segment[] } | null = null;
  /** Parts of the canvas covered by UI (toolbar, scene bar, sidebar), in screen px. */
  insets: () => { left: number; right: number; top: number } = () => ({
    left: 0,
    right: 0,
    top: 0,
  });
  onCameraChange: ((cam: Camera) => void) | null = null;

  async init(host: HTMLElement) {
    await this.app.init({
      width: host.clientWidth,
      height: host.clientHeight,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: devicePixelRatio,
      autoStart: false,
      preference: "webgpu",
      // By default the culler tests last frame's transforms, so a just-drawn
      // stroke (or anything just moved) can be culled at a stale position,
      // and with on-demand rendering it would stay hidden until the next
      // redraw. Fresh transforms cost little at our element counts.
      culler: { updateTransform: true },
    });
    if (this.destroyed) return;
    this.app.ticker.stop();
    // The controller handles input from DOM events. Left attached, Pixi's
    // event system hit-tests the stage on every pointer move and keeps
    // Ticker.system running a frame loop even when nothing is drawn.
    this.app.renderer.events.setTargetElement(null as unknown as HTMLElement);
    this.app.stage.eventMode = "none";
    host.appendChild(this.app.canvas);
    this.world.addChild(
      this.layers.map,
      this.gridLines,
      this.layers.under,
      this.layers.token,
      this.layers.over,
      this.tintLayer,
      this.lightLayer,
      this.fogLayer,
    );
    // Each draws dark over the view and erases what's lit or seen; a filter
    // renders it apart, so the erasing only cuts its own darkness.
    this.lightLayer.addChild(this.lightG, this.lampLayer, this.lightErase, this.lightDark);
    this.lightLayer.filters = [new AlphaFilter()];
    this.fogLayer.addChild(this.fogG);
    this.fogLayer.filters = [new AlphaFilter()];
    this.app.stage.addChild(
      this.world,
      this.barsG,
      this.barText,
      this.names,
      this.overlay,
      this.presenceG,
      this.labels,
    );
    this.resizeObserver = new ResizeObserver(() => {
      this.app.renderer.resize(host.clientWidth, host.clientHeight);
      this.invalidate("grid", "overlay");
    });
    this.resizeObserver.observe(host);
    // Images missing before peers connected get another go once they can be fetched.
    this.stopFetcherWatch = onBlobFetcher(() => {
      for (const view of this.views.values()) view.key = "";
      this.invalidate("elements");
    });
    this.invalidate("camera");
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.stopFetcherWatch?.();
    if (this.app.renderer) {
      this.app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      );
      releaseTextures();
    }
  }

  get size() {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  invalidate(...what: (keyof SceneRenderer["dirty"])[]) {
    for (const w of what) this.dirty[w] = true;
    if (!this.frame && !this.destroyed)
      this.frame = requestAnimationFrame(() => this.render());
  }

  setElements(elements: SceneElement[]) {
    this.elements = elements;
    this.byId = new Map(elements.map((e) => [e.id, e]));
    this.invalidate("elements", "overlay");
  }

  setCamera(cam: Camera) {
    this.camera = cam;
    this.invalidate("camera");
    this.onCameraChange?.(cam);
  }

  /** Other members' cursors, pings and rulers, plus this device's own ping and ruler. */
  setPresence(marks: PresenceMark[]) {
    this.marks = marks;
    const now = performance.now();
    const live = new Set<string>();
    for (const m of marks) {
      if (m.self || !m.cursor) continue;
      live.add(m.id);
      const t = this.cursors.get(m.id);
      if (!t) {
        this.cursors.set(m.id, { from: m.cursor, to: m.cursor, start: now });
      } else if (t.to.x !== m.cursor.x || t.to.y !== m.cursor.y) {
        // Carry on from wherever the cursor is drawn right now.
        this.cursors.set(m.id, {
          from: cursorAt(t, now),
          to: m.cursor,
          start: now,
        });
      }
    }
    for (const id of this.cursors.keys())
      if (!live.has(id)) this.cursors.delete(id);
    this.invalidate("presence");
  }

  setGrid(grid: Grid) {
    this.grid = grid;
    this.gridCovers = null;
    this.invalidate("grid");
  }

  private render() {
    this.frame = 0;
    if (this.destroyed || !this.app.renderer) return;
    const d = this.dirty;
    if (d.elements) this.syncElements();
    else if (d.previews) this.syncPreviews();
    this.hiddenSync();
    if (d.camera) {
      this.world.position.set(this.camera.x, this.camera.y);
      this.world.scale.set(this.camera.zoom);
      d.grid = d.overlay = true;
    }
    if (d.elements || d.previews) d.overlay = true;
    if (d.grid) this.drawGrid();
    if (d.elements || d.previews || d.camera || d.lighting) this.drawLighting();
    if (d.overlay) {
      this.drawDraft();
      this.drawOverlay();
      this.drawTokenLabels();
    }
    // Targets ride on tokens, so presence redraws with anything else.
    const flickering = this.flicker();
    const animating = this.drawPresence() || flickering;
    this.dirty = {
      elements: false,
      previews: false,
      camera: false,
      grid: false,
      overlay: false,
      presence: false,
      lighting: false,
    };
    this.app.render();
    if (animating) this.invalidate("presence");
  }

  /** The size text takes when drawn on the map, in world px. */
  measureText(text: string, colour: string, size: number): { w: number; h: number } {
    const m = CanvasTextMetrics.measureText(text, new TextStyle(textStyle(colour, size)));
    return { w: Math.ceil(m.width), h: Math.ceil(m.height) };
  }

  // Elements

  /** What marks each token: a pip per condition, and a ring on the one whose turn it is. */
  setTokenMarks(marksFor: (tokenId: string, characterId?: string) => TokenMarks) {
    this.marksFor = marksFor;
    this.invalidate("overlay");
  }

  setTokenStats(statsFor: (characterId: string) => TokenStat[]) {
    this.statsFor = statsFor;
    this.invalidate("overlay");
  }

  /** Hide what's hidden for now (erased strokes), the GM's walls from everyone else, and lamps and areas outside the Lights tool. */
  private hiddenSync() {
    for (const [id, view] of this.views) {
      const type = this.byId.get(id)?.type;
      const helper = type === "wall" ? this.showHelpers : type === "light" || type === "area" ? this.showHelpers && this.lightsShown : true;
      view.root.visible = !this.hidden.has(id) && helper;
    }
  }

  private syncElements() {
    const seen = new Set<string>();
    for (const el of this.elements) {
      seen.add(el.id);
      const key = contentKey(el);
      let view = this.views.get(el.id);
      if (view && view.key !== key) {
        view.root.destroy(DESTROY_VIEW);
        view = undefined;
      }
      if (!view) {
        view = this.build(el, key);
        this.views.set(el.id, view);
        // A new view isn't in a layer yet, so force a restack.
        this.order = "";
      }
      view.apply(this.previews.get(el.id) ?? el);
    }
    this.previewed = new Set(this.previews.keys());
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.root.destroy(DESTROY_VIEW);
        this.views.delete(id);
      }
    }
    // Restack only when the order (or a layer) actually changed.
    const order = this.elements.map((e) => `${e.layer}:${e.id}`).join();
    if (order !== this.order) {
      this.order = order;
      for (const layer of LAYERS) this.layers[layer].removeChildren();
      for (const el of this.elements)
        this.layers[el.layer].addChild(this.views.get(el.id)!.root);
    }
  }

  /** Moves just the elements being dragged, and any just let go. */
  private syncPreviews() {
    for (const id of this.previewed) {
      if (this.previews.has(id)) continue;
      const el = this.byId.get(id);
      if (el) this.views.get(id)?.apply(el);
    }
    for (const [id, t] of this.previews) this.views.get(id)?.apply(t);
    this.previewed = new Set(this.previews.keys());
  }

  private build(el: SceneElement, key: string): View {
    const root = new Container({ cullable: true });
    switch (el.type) {
      case "map": {
        const placeholder = new Graphics()
          .rect(-0.5, -0.5, 1, 1)
          .fill({ color: 0xffffff, alpha: 0.06 });
        root.addChild(placeholder);
        let sprite: Sprite | null = null;
        let missing: Text | null = null;
        let size = { w: el.w, h: el.h };
        textureFor(el.image.hash).then((tex) => {
          if (root.destroyed) return;
          if (!tex) {
            // Not on this device; from M2 a peer will send it.
            placeholder
              .clear()
              .rect(-0.5, -0.5, 1, 1)
              .fill({ color: 0xffffff, alpha: 0.12 });
            missing = new Text({
              text: "Image not on this device",
              style: {
                fontFamily: "Cabin, sans-serif",
                fontSize: 28,
                fill: 0xffffff,
              },
              anchor: 0.5,
              alpha: 0.7,
            });
            missing.scale.set(Math.min(size.w, size.h) / 900);
            root.addChild(missing);
            this.invalidate();
            return;
          }
          sprite = new Sprite({ texture: tex, anchor: 0.5 });
          sprite.setSize(size.w, size.h);
          root.addChild(sprite);
          placeholder.visible = false;
          this.invalidate();
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
        if (isPlainToken(el)) {
          // The image as it is, fitted inside the token's square.
          textureFor(el.image!.hash).then((tex) => {
            if (root.destroyed) return;
            if (!tex) {
              // Missing image: fall back to a plain disc so the token can be found.
              body.addChild(
                new Graphics()
                  .circle(0, 0, 50)
                  .fill({ color: el.colour, alpha: 0.6 }),
              );
              this.invalidate();
              return;
            }
            const sprite = new Sprite({ texture: tex, anchor: 0.5 });
            sprite.scale.set(100 / Math.max(tex.width, tex.height));
            body.addChild(sprite);
            this.invalidate();
          });
        } else {
          // A disc: coloured background, the image or an initial, and a ring.
          const ring = new Graphics()
            .circle(0, 0, 48)
            .stroke({ color: el.colour, width: 5 });
          body.addChild(
            new Graphics().circle(0, 0, 50).fill({ color: el.colour }),
            ring,
          );
          const initial = new Text({
            text: (el.name.trim()[0] ?? "").toUpperCase(),
            style: {
              fontFamily: "Fraunces, serif",
              fontSize: 52,
              fontWeight: "600",
              fill: 0xffffff,
            },
            anchor: 0.5,
          });
          body.addChildAt(initial, 1);
          if (el.image) {
            // The initial stands in until the image loads, or if it's missing.
            textureFor(el.image.hash).then((tex) => {
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
              this.invalidate();
            });
          }
        }
        root.addChild(body);

        return {
          root,
          key,
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
              .stroke({ color: colour, width: el.door ? 8 : 5, alpha: el.door && el.open ? 0.4 : 0.9, cap: "round" })
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
        const text = new Text({ text: el.text, style: textStyle(el.colour, el.size), anchor: 0.5, resolution: 2 });
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

  // Light and sight

  /** Set the scene's lighting, who sees, and whether the GM's walls and lights show. */
  setLighting(lighting: Lighting, viewers: string[] | null, showHelpers: boolean) {
    this.lighting = lighting;
    this.viewers = viewers;
    this.showHelpers = showHelpers;
    this.invalidate("lighting", "overlay");
  }

  /**
   * Darkness, with each light's reach erased out of it by the lamp shader
   * (scene/lampShader.ts), its walls and tokens casting soft shadows; then,
   * for a player, black over everything their tokens can't see, by the same
   * shader with a lamp a pixel across. The GM sees the darkness at half strength.
   */
  private drawLighting() {
    const view = visibleWorld(this.camera, this.size.width, this.size.height);
    const margin = Math.max(view.w, view.h);
    const box = { x: view.x - margin, y: view.y - margin, w: view.w + 2 * margin, h: view.h + 2 * margin };
    const at = (el: SceneElement) => this.previews.get(el.id) ?? el;
    const walls = blockingSegments(this.elements.map((el) => ({ ...el, ...at(el) }) as SceneElement));

    const lg = this.lightG.clear();
    const erase = this.lightErase.clear();
    const dark = this.lightDark.clear();
    const { enabled, darkness } = this.lighting;
    const strength = this.viewers ? 1 : 0.5;
    const areas = this.elements.filter((el) => el.type === "area" && !this.hidden.has(el.id));
    this.lightLayer.visible = enabled && (darkness > 0 || areas.some((el) => el.type === "area" && el.tone === "dark"));
    const lit = new Set<string>();
    const tinted = new Set<string>();
    this.flickering = [];
    this.tintLayer.visible = enabled;
    if (enabled) {
      lg.rect(box.x, box.y, box.w, box.h).fill({ color: 0x000000, alpha: darkness * strength });
      const tokens = this.elements.filter((el) => el.type === "token" && !this.hidden.has(el.id)).map(at);
      for (const el of this.elements) {
        if (el.type !== "light" || this.hidden.has(el.id)) continue;
        const t = at(el);
        const centre = { x: t.x, y: t.y };
        const reach = lightReach(el.bright, el.dim);
        // Tokens in reach cast short shadows; one the lamp sits on (a torch carried) casts none.
        const blockers: Blocker[] = [];
        for (const k of tokens) {
          if (Math.hypot(k.x - t.x, k.y - t.y) >= reach + k.w) continue;
          const b = tokenBlocker(centre, k, Math.min(k.w, k.h));
          if (b) blockers.push({ ...b, strength: TOKEN_SHADE });
        }
        const state = {
          at: centre,
          radius: Math.min(t.w, t.h) / 2,
          falloff: { bright: el.bright, dim: el.dim },
          box: { x: t.x - reach, y: t.y - reach, w: reach * 2, h: reach * 2 },
          walls: walls.filter((w) => distanceToSegment(centre, w) < reach),
          blockers,
          colour: ({ ...el, ...t } as typeof el).colour,
        };
        const drawn: Lamp[] = [];
        if (this.lightLayer.visible) {
          lit.add(el.id);
          drawn.push(this.lampFor(this.lamps, el.id, this.lampLayer));
        }
        tinted.add(el.id);
        drawn.push(this.lampFor(this.tints, el.id, this.tintLayer, true));
        for (const lamp of drawn) lamp.update(state);
        if (el.flicker) this.flickering.push({ lamps: drawn, phase: hashPhase(el.id) });
      }
      for (const el of this.lightLayer.visible ? areas : []) {
        if (el.type !== "area") continue;
        const poly = flat(areaPolygon({ ...el, ...at(el) }));
        if (el.tone === "light") erase.poly(poly).fill({ color: 0xffffff, alpha: 1 });
        else dark.poly(poly).fill({ color: 0x000000, alpha: strength });
      }
    }
    this.dropLamps(this.lamps, lit);
    this.dropLamps(this.tints, tinted);

    const fg = this.fogG.clear();
    const viewers = this.viewers?.map((id) => this.byId.get(id)).filter((el) => !!el) ?? null;
    this.fogLayer.visible = !!viewers?.length;
    this.sight = null;
    const seeing = new Set<string>();
    if (viewers?.length) {
      fg.rect(box.x, box.y, box.w, box.h).fill({ color: 0x05070c, alpha: 1 });
      const from = viewers.map((el) => {
        const t = at(el);
        return { id: el.id, at: { x: t.x, y: t.y } };
      });
      this.sight = { from: from.map((v) => v.at), walls };
      for (const v of from) {
        seeing.add(v.id);
        // An eye a pixel across, so the edge of sight is smooth but sharp.
        this.lampFor(this.sights, v.id, this.fogLayer).update({ at: v.at, radius: 0.75 / this.camera.zoom, falloff: null, box, walls });
      }
    }
    this.dropLamps(this.sights, seeing);
  }

  /** The lamp drawn for a light or a viewer, made the first time it's needed. */
  private lampFor(lamps: Map<string, Lamp>, id: string, layer: Container, tint = false): Lamp {
    let lamp = lamps.get(id);
    if (!lamp) {
      lamp = new Lamp(tint);
      layer.addChild(lamp.mesh);
      lamps.set(id, lamp);
    }
    return lamp;
  }

  /**
   * Waver the flickering lights, by a few sines out of step with each other,
   * so it never quite repeats. Whether there are any, to draw the next frame.
   * Steady under reduced motion.
   */
  private flicker(): boolean {
    if (!this.flickering.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const t = performance.now() / 1000;
    for (const { lamps, phase: p } of this.flickering) {
      const wave = 0.5 * Math.sin(7.3 * t + p) + 0.3 * Math.sin(13.7 * t + 2.1 * p) + 0.2 * Math.sin(23.1 * t + 3.7 * p);
      const n = Math.min(1, Math.max(0, 0.55 + 0.45 * wave));
      for (const lamp of lamps) lamp.setFlicker(n);
    }
    return true;
  }

  /** Destroy the lamps not drawn this time. */
  private dropLamps(lamps: Map<string, Lamp>, keep: Set<string>) {
    for (const [id, lamp] of lamps) {
      if (keep.has(id)) continue;
      lamp.destroy();
      lamps.delete(id);
    }
  }

  /** Whether a token is out of the viewers' sight (always false when they see everything). */
  private unseen(t: Transform): boolean {
    const sight = this.sight;
    return !!sight && sight.from.every((p) => blocked(p, t, sight.walls));
  }

  // Grid

  /**
   * Graphics are expensive to rebuild, so the grid is drawn over twice the
   * visible area and only redrawn once the view moves outside that. Lines
   * are pixelLine (always 1 px), so zooming in needs no redraw either.
   */
  private drawGrid() {
    const g = this.gridLines;
    const grid = this.grid;
    // Fade the grid out as cells get too small to read; hexes sooner, as
    // they're busier.
    const cell = grid.size * this.camera.zoom;
    const [from, to] = grid.type === "hex" ? [12, 28] : [6, 20];
    const fade =
      grid.type === "none"
        ? 0
        : Math.min(1, Math.max(0, (cell - from) / (to - from)));
    g.alpha = fade;
    if (!fade) return;

    const { width, height } = this.size;
    const visible = visibleWorld(this.camera, width, height);
    const c = this.gridCovers;
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
    this.gridCovers = view;
    g.clear();
    if (grid.type === "square") {
      const { xs, ys } = squareLines(grid, view);
      for (const x of xs) g.moveTo(x, view.y).lineTo(x, view.y + view.h);
      for (const y of ys) g.moveTo(view.x, y).lineTo(view.x + view.w, y);
    } else {
      // Each hex draws its three upper edges; neighbours supply the rest.
      for (const { q, r } of hexCellsIn(grid, view)) {
        const c = hexCorners(hexCentre(grid, q, r), grid.size);
        g.moveTo(c[3].x, c[3].y)
          .lineTo(c[4].x, c[4].y)
          .lineTo(c[5].x, c[5].y)
          .lineTo(c[0].x, c[0].y);
      }
    }
    // A dark line and a light one on the same pixels read on maps of any
    // brightness.
    g.stroke({ color: 0x000000, alpha: 0.3, pixelLine: true });
    g.stroke({ color: 0xffffff, alpha: 0.14, pixelLine: true });
  }

  // Drafts and overlay

  private drawDraft() {
    const g = this.draftG.clear();
    const d = this.draft;
    if (!d) {
      g.removeFromParent();
      return;
    }
    if (g.parent !== this.layers[d.layer]) this.layers[d.layer].addChild(g);
    if (d.kind === "polygon") {
      g.position.set(0, 0);
      g.rotation = 0;
      const width = 2 / this.camera.zoom;
      if (d.points.length > 2) g.poly(flat(d.points)).fill({ color: d.colour, alpha: 0.15 });
      g.moveTo(d.points[0].x, d.points[0].y);
      for (const p of d.points.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ color: d.colour, width });
      for (const p of d.points.slice(0, -1)) g.circle(p.x, p.y, 4 / this.camera.zoom);
      g.fill({ color: d.colour });
      return;
    }
    if (d.kind === "shape") {
      drawShape(g, d.shape, d.t.w, d.t.h, d.colour, d.width / this.camera.zoom);
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

  private label(
    key: string,
    text: string,
    x: number,
    y: number,
    colour: string,
    used: Set<string>,
    alpha = 1,
  ) {
    let t = this.labelPool.get(key);
    if (!t) {
      t = new Text({
        text,
        style: {
          fontFamily: "Cabin, sans-serif",
          fontSize: 13,
          fontWeight: "600",
          fill: colour,
          stroke: { color: INK, width: 3 },
        },
      });
      this.labelPool.set(key, t);
      this.labels.addChild(t);
    }
    if (t.text !== text) t.text = text;
    if (t.style.fill !== colour) t.style.fill = colour;
    t.position.set(x, y);
    t.alpha = alpha;
    used.add(key);
  }

  /**
   * Each member's targets, as a ring in their colour around the token; a
   * second member's ring sits just outside the first. This device's own
   * targets show their distance from the token it measures from.
   */
  private drawTargets(g: Graphics, used: Set<string>) {
    const cam = this.camera;
    const byId = this.byId;
    const rings = new Map<string, number>();
    const fromEl = this.overlayState.rangeFrom ? byId.get(this.overlayState.rangeFrom) : undefined;
    const from = fromEl && (this.previews.get(fromEl.id) ?? fromEl);
    for (const m of this.marks) {
      for (const id of m.targets) {
        const el = byId.get(id);
        if (el?.type !== "token") continue;
        const t = this.previews.get(id) ?? el;
        const n = rings.get(id) ?? 0;
        rings.set(id, n + 1);
        const c = toScreen(cam, t);
        const r = (Math.max(t.w, t.h) / 2) * cam.zoom + 8 + n * 6;
        g.circle(c.x, c.y, r).stroke({ color: INK, width: 5, alpha: 0.5 });
        g.circle(c.x, c.y, r).stroke({ color: m.colour, width: 2 });
        // Sight ticks at the four compass points.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(c.x + dx * (r - 5), c.y + dy * (r - 5))
            .lineTo(c.x + dx * (r + 5), c.y + dy * (r + 5))
            .stroke({ color: m.colour, width: 2.5 });
        }
        if (m.self && from && fromEl.id !== id) {
          this.label(
            `target:${id}`,
            formatDistance(this.grid, tokenDistance(this.grid, from, t)),
            c.x + r * 0.72 + 6,
            c.y + r * 0.72 - 4,
            m.colour,
            used,
          );
        }
      }
    }
  }

  setHoverToken(id: string | null) {
    if (id === this.hoverToken) return;
    this.hoverToken = id;
    this.invalidate("overlay");
  }

  /**
   * What sits under each token, in screen space so it stays readable at any
   * zoom: its system's stat bars (HP), then its name. Both follow the zoom,
   * but only within set sizes. Where they'd collide with another token's, or
   * a token is too small on screen to label, they're left out, and only the
   * token under the pointer shows them.
   */
  private drawTokenLabels() {
    const cam = this.camera;
    const g = this.barsG.clear();
    const usedNames = new Set<string>();
    const usedValues = new Set<string>();
    type Box = { id: string; x: number; y: number; w: number; h: number };
    const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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

    for (const el of this.elements) {
      if (el.type !== "token" || this.hidden.has(el.id)) continue;
      const t = this.previews.get(el.id) ?? el;
      // Out of sight: no name or bars to give it away.
      if (this.unseen(t)) continue;
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
        const box = (w: number) => ({ id: el.id, x: Math.round(foot.x - w / 2), y: top, w: Math.round(w), h });
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
        name = { id: el.id, x: foot.x - text.width / 2, y, w: text.width, h: text.height, text };
      }
      plans.push({ id: el.id, t, stats, bars, wideBars, barH, name, small: screenW < NAME_TOKEN_MIN });
    }

    // Decide what shows: bars give way only to other bars; names give way to both.
    const hover = this.hoverToken;
    const showBars = new Set<string>();
    const showName = new Set<string>();
    const shown = plans.filter((p) => !p.small);
    // Wide bars where they'd touch no other token's wide bars.
    const wide = new Set(
      shown.filter((p) => p.wideBars && !shown.some((q) => q !== p && q.wideBars && overlaps(p.wideBars!, q.wideBars))).map((p) => p.id),
    );
    for (const p of plans) if (wide.has(p.id)) p.bars = p.wideBars;
    for (const p of shown) {
      if (p.bars && !shown.some((q) => q !== p && q.bars && overlaps(p.bars!, q.bars))) showBars.add(p.id);
    }
    for (const p of shown) {
      if (!p.name) continue;
      const clash = shown.some(
        (q) => q !== p && ((q.name && overlaps(p.name!, q.name)) || (q.bars && showBars.has(q.id) && overlaps(p.name!, q.bars))),
      );
      if (!clash) showName.add(p.id);
    }
    if (hover) {
      showBars.add(hover);
      showName.add(hover);
    }

    // Draw, the hovered token's last so it sits on top.
    const ordered = [...plans.filter((p) => p.id !== hover), ...plans.filter((p) => p.id === hover)];
    for (const p of ordered) {
      if (p.name) p.name.text.visible = showName.has(p.id);
      if (!p.bars || !showBars.has(p.id)) continue;
      const { x, w } = p.bars;
      const barH = p.barH;
      p.stats.forEach((s, i) => {
        const y = p.bars!.y + i * (barH + BAR_GAP);
        const frac = s.max > 0 ? Math.min(1, Math.max(0, s.value / s.max)) : 0;
        g.roundRect(x, y, w, barH, 3).fill({ color: INK, alpha: 0.85 });
        if (frac > 0) g.roundRect(x + 1.5, y + 1.5, (w - 3) * frac, barH - 3, 2).fill({ color: s.colour });
        // The value, when the bar is wide enough to read it.
        if (w < BAR_TEXT_MIN_W) return;
        const key = `${p.id}:${s.id}`;
        let text = this.barTextPool.get(key);
        if (!text) {
          text = new Text({
            text: "",
            style: { fontFamily: "Cabin, sans-serif", fontSize: BAR_MAX_H - 2, fontWeight: "700", fill: 0xffffff },
            anchor: 0.5,
            resolution: 2,
          });
          this.barTextPool.set(key, text);
          this.barText.addChild(text);
        }
        const value = `${s.value}/${s.max}`;
        if (text.text !== value) text.text = value;
        text.scale.set((barH - 1) / (BAR_MAX_H - 2));
        text.position.set(Math.round(x + w / 2), Math.round(y + barH / 2));
        usedValues.add(key);
        if (p.id === hover) this.barText.setChildIndex(text, this.barText.children.length - 1);
      });
    }

    // Condition pips along each token's top edge, and a ring round the token whose turn it is.
    for (const el of this.elements) {
      if (el.type !== "token" || this.hidden.has(el.id) || this.unseen(this.previews.get(el.id) ?? el)) continue;
      const marks = this.marksFor(el.id, el.characterId);
      if (!marks.pips.length && !marks.turn) continue;
      const t = this.previews.get(el.id) ?? el;
      const c = toScreen(cam, { x: t.x, y: t.y });
      const half = (Math.max(t.w, t.h) * cam.zoom) / 2;
      if (marks.turn) g.circle(c.x, c.y, half + 5).stroke({ color: TURN_COLOUR, width: 3, alpha: 0.95 });
      const r = Math.round(Math.min(PIP_MAX_R, Math.max(PIP_MIN_R, half * 0.12)));
      const shown = marks.pips.slice(0, PIP_MAX);
      const span = shown.length * (r * 2 + 2) - 2;
      const top = toScreen(cam, { x: t.x, y: t.y - t.h / 2 }).y;
      shown.forEach((colour, i) => {
        const x = c.x - span / 2 + r + i * (r * 2 + 2);
        g.circle(x, top, r).fill({ color: colour }).stroke({ color: INK, width: 1.5 });
      });
    }

    const hovered = hover && this.namePool.get(hover);
    if (hovered && hovered.parent) this.names.setChildIndex(hovered, this.names.children.length - 1);
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

  /** Returns true while a ping is still rippling and needs more frames. */
  private drawPresence(): boolean {
    const g = this.presenceG.clear();
    const cam = this.camera;
    const used = new Set<string>();
    const now = performance.now();
    let animating = false;
    let insets: ReturnType<SceneRenderer["insets"]> | undefined;

    this.drawTargets(g, used);

    // A shape being dragged out shows its size by the pointer's end.
    const d = this.draft;
    if (d?.kind === "shape" && d.label) {
      const end = fromLocalPoint(d.t, { x: d.t.w / 2, y: 0 });
      const at = toScreen(cam, d.shape === "circle" ? { x: d.t.x, y: d.t.y } : end);
      this.label("draft", d.label, at.x + 10, at.y - 18, "#ffffff", used);
    }

    for (const m of this.marks) {
      if (m.cursor) {
        const move = m.self ? undefined : this.cursors.get(m.id);
        if (move && now - move.start < CURSOR_GLIDE_MS) animating = true;
        const c = toScreen(cam, move ? cursorAt(move, now) : m.cursor);
        g.circle(c.x, c.y, 6)
          .fill(m.colour)
          .stroke({ color: 0xffffff, width: 2 });
      }

      if (m.ruler) {
        // On a grid, measure cell to cell, so draw between cell centres.
        const r = measure(this.grid, m.ruler.a, m.ruler.b);
        const a = toScreen(cam, r.a);
        const b = toScreen(cam, r.b);
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ color: INK, width: 5, alpha: 0.6 });
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ color: m.colour, width: 2.5 });
        g.circle(a.x, a.y, 4).fill(m.colour).stroke({ color: INK, width: 1.5 });
        g.circle(b.x, b.y, 4).fill(m.colour).stroke({ color: INK, width: 1.5 });
        this.label(
          `ruler:${m.id}`,
          formatDistance(this.grid, r.distance),
          (a.x + b.x) / 2 + 8,
          (a.y + b.y) / 2 + 8,
          m.colour,
          used,
        );
      }

      if (m.trail?.length) {
        const pts = m.trail
          .map((q) => ({ ...toScreen(cam, q), f: 1 - (now - q.t) / TRAIL_MS }))
          .filter((q) => q.f > 0);
        if (pts.length) animating = true;
        for (let i = 1; i < pts.length; i++) {
          const f = (pts[i].f + pts[i - 1].f) / 2;
          g.moveTo(pts[i - 1].x, pts[i - 1].y)
            .lineTo(pts[i].x, pts[i].y)
            .stroke({
              color: m.colour,
              width: 3 + 7 * f,
              alpha: 0.25 * f,
              cap: "round",
            });
          g.moveTo(pts[i - 1].x, pts[i - 1].y)
            .lineTo(pts[i].x, pts[i].y)
            .stroke({
              color: 0xffffff,
              width: 1 + 2 * f,
              alpha: f,
              cap: "round",
            });
        }
        const head = pts[pts.length - 1];
        if (head) {
          g.circle(head.x, head.y, 4 + 3 * head.f).fill({
            color: m.colour,
            alpha: head.f,
          });
          if (!m.self)
            this.label(
              `trail:${m.id}`,
              m.name,
              head.x + 12,
              head.y - 26,
              m.colour,
              used,
              head.f,
            );
        }
      }

      if (m.ping) {
        const age = (now - m.ping.startedAt) / PING_MS;
        if (age < 1) {
          animating = true;
          const c = toScreen(cam, m.ping.p);
          // Reading the UI's layout is costly; once a frame is enough.
          const cover = (insets ??= this.insets());
          const L = cover.left;
          const R = Math.max(L + 1, this.size.width - cover.right);
          const T = cover.top;
          const B = Math.max(T + 1, this.size.height);
          const inset = 28;
          const off = c.x < L || c.y < T || c.x > R || c.y > B;
          if (!off) {
            for (const phase of [0, 0.25]) {
              // Each ring finishes expanding and fading exactly as the ping ends.
              const k = (age - phase) / (1 - phase);
              if (k <= 0) continue;
              const fade = (1 - k) * (1 - k);
              g.circle(c.x, c.y, 8 + 55 * (1 - (1 - k) ** 2)).stroke({
                color: m.colour,
                width: 3,
                alpha: fade,
              });
            }
            g.circle(c.x, c.y, 5).fill({
              color: m.colour,
              alpha: (1 - age) ** 2,
            });
            if (!m.self)
              this.label(
                `ping:${m.id}`,
                m.name,
                c.x + 14,
                c.y - 30,
                m.colour,
                used,
                (1 - age) ** 2,
              );
          } else {
            // Point at the ping from the nearest edge of the view.
            const mid = { x: (L + R) / 2, y: (T + B) / 2 };
            const dx = c.x - mid.x;
            const dy = c.y - mid.y;
            const k = Math.min(
              Math.max(1, (R - L) / 2 - inset) / Math.abs(dx || 1e-6),
              Math.max(1, (B - T) / 2 - inset) / Math.abs(dy || 1e-6),
            );
            const e = { x: mid.x + dx * k, y: mid.y + dy * k };
            const ang = Math.atan2(dy, dx);
            const tip = {
              x: e.x + Math.cos(ang) * 14,
              y: e.y + Math.sin(ang) * 14,
            };
            const wing = (a: number) => ({
              x: e.x + Math.cos(ang + a) * 12,
              y: e.y + Math.sin(ang + a) * 12,
            });
            const l = wing(2.4);
            const r = wing(-2.4);
            g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y])
              .fill({ color: m.colour, alpha: (1 - age) ** 0.7 })
              .stroke({ color: INK, width: 1.5 });
            const lx = Math.min(
              Math.max(e.x - Math.cos(ang) * 24 - 20, L + 4),
              R - 80,
            );
            const ly = Math.min(
              Math.max(e.y - Math.sin(ang) * 24 - 8, T + 4),
              B - 22,
            );
            this.label(
              `ping:${m.id}`,
              m.name,
              lx,
              ly,
              m.colour,
              used,
              (1 - age) ** 0.7,
            );
          }
        }
      }
    }

    for (const [key, t] of this.labelPool) {
      if (used.has(key)) continue;
      this.labels.removeChild(t);
      t.destroy();
      this.labelPool.delete(key);
    }
    return animating;
  }

  private drawOverlay() {
    const g = this.overlay.clear();
    const { selected, handles, group, marquee, eraser } = this.overlayState;
    const cam = this.camera;

    for (const el of selected) {
      const t = this.previews.get(el.id) ?? el;
      if ((el.type === "token" && !isPlainToken(el)) || el.type === "light") {
        const c = toScreen(cam, t);
        g.circle(c.x, c.y, (Math.min(t.w, t.h) / 2) * cam.zoom + 3);
      } else {
        g.poly(corners(t).map((p) => toScreen(cam, p)));
      }
      g.stroke({
        color: el.locked ? 0xffffff : ACCENT,
        alpha: el.locked ? 0.5 : 1,
        width: 2,
      });
    }

    if (handles && selected.length === 1 && selected[0].type === "light") {
      const el = selected[0];
      const light = { ...el, ...this.previews.get(el.id) } as typeof el;
      const c = toScreen(cam, light);
      for (const r of [light.bright, light.dim]) {
        g.circle(c.x, c.y, r * cam.zoom).stroke({ color: ACCENT, alpha: 0.8, width: 1.5 });
      }
      for (const { at } of lightHandles(light, cam)) g.circle(at.x, at.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    } else if (handles && selected.length === 1) {
      const el = selected[0];
      const t = this.previews.get(el.id) ?? el;
      const [tl, tr, br, bl] = corners(t).map((p) => toScreen(cam, p));
      const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const knob = rotateHandlePosition(t, cam);
      g.moveTo(top.x, top.y)
        .lineTo(knob.x, knob.y)
        .stroke({ color: ACCENT, width: 2 });
      for (const p of [tl, tr, br, bl]) {
        g.rect(
          p.x - HANDLE_SIZE / 2,
          p.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE,
        );
      }
      g.circle(knob.x, knob.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    }

    if (group) {
      const [tl, tr, br, bl] = corners(group).map((p) => toScreen(cam, p));
      const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const knob = rotateHandlePosition(group, cam);
      g.poly([tl, tr, br, bl]).stroke({
        color: ACCENT,
        alpha: 0.6,
        width: 1.5,
      });
      g.moveTo(top.x, top.y)
        .lineTo(knob.x, knob.y)
        .stroke({ color: ACCENT, width: 2 });
      g.circle(knob.x, knob.y, HANDLE_SIZE / 2 + 1);
      g.fill(ACCENT).stroke({ color: INK, width: 1.5 });
    }

    if (marquee) {
      const a = toScreen(cam, marquee);
      g.rect(a.x, a.y, marquee.w * cam.zoom, marquee.h * cam.zoom)
        .fill({ color: ACCENT, alpha: 0.08 })
        .stroke({ color: ACCENT, alpha: 0.7, width: 1.5 });
    }

    if (eraser) {
      const c = toScreen(cam, eraser.p);
      g.circle(c.x, c.y, eraser.r * cam.zoom).stroke({
        color: 0xffffff,
        alpha: 0.7,
        width: 1.5,
      });
    }
  }
}

export type LightPart = 'lamp' | 'bright' | 'dim'

/**
 * A selected light's handles, in screen coordinates: one on the lamp's rim (its
 * size) to the right, and one on each of the bright and dim rings, up and down
 * the diagonal so they stay apart when the two radii match.
 */
export function lightHandles(light: Transform & { bright: number; dim: number }, cam: Camera): { part: LightPart; at: Point }[] {
  const c = toScreen(cam, light)
  const on = (r: number, angle: number) => ({ x: c.x + Math.cos(angle) * r * cam.zoom, y: c.y + Math.sin(angle) * r * cam.zoom })
  return [
    { part: 'lamp', at: on(Math.min(light.w, light.h) / 2, 0) },
    { part: 'bright', at: on(light.bright, -Math.PI / 4) },
    { part: 'dim', at: on(light.dim, Math.PI / 4) },
  ]
}

/** Where the rotate knob sits, in screen coordinates. */
export function rotateHandlePosition(t: Transform, cam: Camera): Point {
  const [tl, tr] = corners(t).map((p) => toScreen(cam, p))
  const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }
  return { x: top.x + Math.sin(t.rot) * ROTATE_HANDLE_GAP, y: top.y - Math.cos(t.rot) * ROTATE_HANDLE_GAP }
}
