import { Application, Container, CullerPlugin, extensions } from "pixi.js";
import type { Camera } from "./camera";
import { type Grid, DEFAULT_GRID, type Point } from "./grid";
import type { PeerBlobs } from "../media/images";
import type { PresenceMark } from "./presence";
import type { TokenStat } from "../systems/types";
import type { TokenMarks } from "./tokenMarks";
import type { SelectKind } from "./tools";
import { LAYERS, type Layer, type SceneElement, type Transform } from "./types";
import { ConditionLayer } from "./render/conditions";
import { type Draft, DraftLayer } from "./render/draft";
import { mapText } from "./render/elementViews";
import { loadSdfFonts } from "./render/sdfFont";
import { measureSdfText } from "./render/sdfText";
import { CANVAS_FONTS } from "./render/style";
import { ElementLayer } from "./render/elements";
import { GridLayer } from "./render/grid";
import { type Lighting, LightingLayer } from "./render/lighting";
import { type OverlayState, OverlayLayer } from "./render/overlay";
import { PresenceLayer } from "./render/presence";
import type { RenderPart, RenderState } from "./render/state";
import { releaseTextures } from "./render/textures";
import { TokenLabelLayer } from "./render/tokenLabels";
import { isDowned } from "./downed";

// Skip drawing elements that are off screen.
extensions.add(CullerPlugin);

const CLEAN: Record<RenderPart, boolean> = {
  elements: false,
  previews: false,
  camera: false,
  grid: false,
  overlay: false,
  presence: false,
  lighting: false,
};

/**
 * Draws a scene with PixiJS. It renders on demand rather than every frame:
 * anything that changes the picture calls invalidate(), and the next
 * animation frame redraws once. Each layer of the picture is drawn by its
 * own module in render/; this class holds the state they draw from and
 * decides which of them to redraw.
 */
export class SceneRenderer implements RenderState {
  readonly app = new Application();

  /** `peers` supplies the images this device lacks. */
  constructor(readonly peers: PeerBlobs | null = null) {}

  // A render group, so panning and zooming is one GPU transform.
  readonly world = new Container({ isRenderGroup: true });
  readonly layers = Object.fromEntries(LAYERS.map((l) => [l, new Container()])) as Record<
    Layer,
    Container
  >;
  private readonly gridLayer = new GridLayer();
  private readonly elementLayer = new ElementLayer(this, this.layers);
  private readonly lightingLayer = new LightingLayer(this);
  private readonly draftLayer = new DraftLayer();
  private readonly tokenLabels = new TokenLabelLayer(this);
  private readonly conditions = new ConditionLayer(this);
  private readonly presence = new PresenceLayer(this);
  private readonly overlay = new OverlayLayer(this);

  /** The token under the pointer, whose name always shows. */
  private hoverToken: string | null = null;
  private hoverPointer: Point | null = null;
  private elementList: SceneElement[] = [];
  private elementsById = new Map<string, SceneElement>();
  private frame = 0;
  /**
   * What needs redrawing. previews: only drag transforms moved, not the
   * elements themselves. presence: only cursors, pings, trails and rulers.
   */
  private dirty: Record<RenderPart, boolean> = {
    ...CLEAN,
    camera: true,
    grid: true,
    overlay: true,
    presence: true,
    lighting: true,
  };
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
  /** The sorts of things whose GM helpers (lamps, areas, effect outlines) show: those the active tool can pick. */
  helpersShown: ReadonlySet<SelectKind> = new Set();
  /** The scene's lighting: off, or how dark it is where no light reaches (0 to 1). */
  lighting: Lighting = { enabled: false, darkness: 0 };
  /**
   * The tokens whose sight this device sees by (a player's own characters),
   * or null to see everything (the GM, or a player with no tokens here).
   */
  viewers: string[] | null = null;
  /** Parts of the canvas covered by UI (toolbar, scene bar, sidebar), in screen px. */
  insets: () => { left: number; right: number; top: number } = () => ({
    left: 0,
    right: 0,
    top: 0,
  });
  onCameraChange: ((cam: Camera) => void) | null = null;

  async init(host: HTMLElement) {
    await loadSdfFonts(CANVAS_FONTS);
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
    const lighting = this.lightingLayer;
    this.world.addChild(
      this.layers.map,
      this.gridLayer.view,
      this.layers.under,
      this.layers.token,
      this.layers.over,
      lighting.tintLayer,
      lighting.lightLayer,
      lighting.fogLayer,
    );
    this.app.stage.addChild(
      this.world,
      this.tokenLabels.bars,
      this.tokenLabels.barText,
      this.tokenLabels.names,
      this.overlay.view,
      this.presence.view,
      this.presence.labels,
      this.conditions.view,
      this.conditions.texts,
    );
    this.resizeObserver = new ResizeObserver(() => {
      this.app.renderer.resize(host.clientWidth, host.clientHeight);
      this.invalidate("grid", "overlay");
    });
    this.resizeObserver.observe(host);
    // Images missing before peers connected get another go once they can be fetched.
    this.stopFetcherWatch =
      this.peers?.onAvailable(() => {
        this.elementLayer.rebuildAll();
        this.invalidate("elements");
      }) ?? null;
    this.invalidate("camera");
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.elementLayer.destroy();
    this.resizeObserver?.disconnect();
    this.stopFetcherWatch?.();
    if (this.app.renderer) {
      this.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      releaseTextures();
    }
  }

  get size() {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  /** The scene's elements, bottom to top. */
  get elements(): readonly SceneElement[] {
    return this.elementList;
  }

  get byId(): ReadonlyMap<string, SceneElement> {
    return this.elementsById;
  }

  invalidate(...what: RenderPart[]) {
    for (const w of what) this.dirty[w] = true;
    if (!this.frame && !this.destroyed) this.frame = requestAnimationFrame(() => this.render());
  }

  setElements(elements: SceneElement[]) {
    this.elementList = elements;
    this.elementsById = new Map(elements.map((e) => [e.id, e]));
    this.invalidate("elements", "overlay");
  }

  setCamera(cam: Camera) {
    this.camera = cam;
    this.invalidate("camera");
    this.onCameraChange?.(cam);
  }

  /** Other members' cursors, pings and rulers, plus this device's own ping and ruler. */
  setPresence(marks: PresenceMark[]) {
    this.presence.setMarks(marks);
    this.invalidate("presence");
  }

  setGrid(grid: Grid) {
    this.grid = grid;
    this.gridLayer.reset();
    this.invalidate("grid");
  }

  private render() {
    this.frame = 0;
    if (this.destroyed || !this.app.renderer) return;
    const d = this.dirty;
    if (d.elements) this.elementLayer.sync();
    else if (d.previews) this.elementLayer.syncPreviews();
    this.elementLayer.syncHidden(this.showHelpers, this.helpersShown);
    const falling = this.elementLayer.syncDowned();
    const effects = this.elementLayer.animate();
    if (d.camera) {
      this.world.position.set(this.camera.x, this.camera.y);
      this.world.scale.set(this.camera.zoom);
      d.grid = d.overlay = true;
    }
    if (d.elements || d.previews) d.overlay = true;
    if (d.grid) this.gridLayer.draw(this);
    if (d.elements || d.previews || d.camera || d.lighting)
      this.lightingLayer.draw(this.lighting, this.viewers);
    if (d.overlay) {
      const unseen = (t: Transform) => this.lightingLayer.unseen(t);
      this.draftLayer.draw(this.draft, this.layers, this.camera.zoom);
      this.overlay.draw(this.overlayState);
      this.tokenLabels.draw(this.hoverToken, this.hoverPointer, unseen);
      this.conditions.draw(this.tokenLabels.bars, this.hoverPointer, unseen);
    }
    // Targets ride on tokens, so presence redraws with anything else.
    const flickering = this.lightingLayer.flicker();
    const animating = this.presence.draw(this.draft, this.overlayState.rangeFrom) || flickering;
    this.dirty = { ...CLEAN };
    this.app.render();
    if (animating) this.invalidate("presence");
    if (this.conditions.animating) this.invalidate("overlay");
    if (this.tokenLabels.animating) this.invalidate("overlay");
    if (falling || effects) this.invalidate();
  }

  /** The size text takes when drawn on the map, in world px. */
  measureText(text: string, colour: string, size: number): { w: number; h: number } {
    const m = measureSdfText(text, mapText(colour, size));
    return { w: Math.ceil(m.w), h: Math.ceil(m.h) };
  }

  // Elements

  /** What marks each token: a pip per condition, and a ring on the one whose turn it is. */
  setTokenMarks(marksFor: (tokenId: string, characterId?: string) => TokenMarks) {
    this.conditions.marksFor = marksFor;
    this.invalidate("overlay");
  }

  setTokenStats(statsFor: (characterId: string) => TokenStat[]) {
    this.tokenLabels.statsFor = statsFor;
    this.elementLayer.downed = (token) =>
      !!token.characterId && isDowned(statsFor(token.characterId));
    this.invalidate("overlay");
  }

  setDropHighlight(tokenId: string | null) {
    this.elementLayer.setDropHighlight(tokenId);
  }

  flashToken(tokenId: string) {
    this.elementLayer.flashToken(tokenId);
  }

  // Light and sight

  /** Set the scene's lighting, who sees, and whether the GM's walls and lights show. */
  setLighting(lighting: Lighting, viewers: string[] | null, showHelpers: boolean) {
    this.lighting = lighting;
    this.viewers = viewers;
    this.showHelpers = showHelpers;
    this.invalidate("lighting", "overlay");
  }

  setHoverToken(id: string | null, pointer: Point | null = null) {
    if (
      id === this.hoverToken &&
      pointer?.x === this.hoverPointer?.x &&
      pointer?.y === this.hoverPointer?.y
    )
      return;
    this.hoverToken = id;
    this.hoverPointer = pointer;
    this.invalidate("overlay");
  }
}
