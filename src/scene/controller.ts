import { newId } from "../lib/ids";
import { store, watch } from "../lib/store";
import type { CampaignDefaults } from "../campaign/campaign";
import { device } from "../platform/device";

import { importImage, imageColour, squareGridOf } from "../media/images";
import type {
  BlobReference,
  EntityGraphic,
  EntityGraphicRef as EntityGraphicReference,
} from "../media/images";
import type { LinkRef as LinkReference } from "../features/notes/links";
import { reducedMotion } from "../ui/transition";
import { colourOf } from "./presence";
import type { Presence } from "./presence";
import { clampZoom, fitCamera, toWorld, visibleWorld, zoomAt } from "./camera";
import type { Camera } from "./camera";
import { readSceneCamera, saveSceneCamera } from "./cameraMemory";
import { clipboardHtml } from "./clipboard";
import { bounds, hits, intersects } from "./geometry";
import { membersOf, regroup, withGroups } from "./groups";
import { cellOr, snapPoint, gridPitch } from "./grid";
import type { Point, Grid } from "./grid";
import { guessCells } from "./alignMap";
import type { Box, Cells, Frame } from "./alignMap";
import { fitBox, fitImageGrid } from "./gridFit";
import { tokenDistance } from "./measure";
import { conversion, imageElement, newPin, newToken, randomTokenColour } from "./newElements";
import type { TokenSpec } from "./newElements";
import type SceneRenderer from "./renderer";
import type { ElementPatch, SceneDoc as SceneDocument } from "./sceneDoc";
import type { Arrangement } from "./stacking";
import { toolCursor } from "./toolCursors";
import { GM_KINDS, kindOf } from "./tools";
import type { SceneTools } from "./tools";
import type {
  NewElement,
  SceneElement,
  TokenElement,
  TokenStyle,
  Transform,
  PinElement,
} from "./types";
import TOOL_PRESS from "./gestures";
import PolygonDraft from "./gestures/polygon";
import alignBox from "./gestures/align";
import { WallDetector } from "./wallDetection";
import { pinch } from "./gestures/pan";
import { hoverCursor } from "./gestures/select";
import { dragShape, placementPlan } from "./gestures/shape";
import { fitPatch, newTextLook, putText } from "./gestures/text";
import type { Gesture, PinRequest, Placement, TextRequest, ToolContext } from "./gestures/types";

/** How soon, and how near in screen px, a press must follow the last to count as a double click. */
const MULTI_CLICK_MS = 500;
const MULTI_CLICK_SLOP = 6;

/** How far copies move off their originals, in world px, on a scene without a grid. */
const DUPLICATE_OFFSET = 20;
/** How far, in world px, a paste may land from a copy already there and still count as on it. */
const SAME_PLACE = 0.5;
/** How many cells a paste moves over at most to come off copies already there. */
const MAX_PASTE_NUDGES = 100;

/** Which way each arrow key nudges the selection. */
const ARROW_NUDGES: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** Just the place, size and rotation of `t`, without the rest of what it holds. */
function transformOf(t: Transform): Transform {
  return { x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot };
}

/** A map whose image has a square grid drawn on it, scaled and placed so that grid lines up with the scene's. */
async function alignedToImageGrid<M extends NewElement & Transform>(
  map: M,
  image: Blob,
  grid: Grid,
): Promise<M> {
  if (grid.type !== "square") return map;
  try {
    const found = await squareGridOf(image);
    const frame = found && fitImageGrid(map, found, grid);
    return frame ? { ...map, ...frame } : map;
  } catch (error) {
    console.error("Couldn't look for a grid on a map image", error);
    return map;
  }
}

/**
 * A map being lined up with the grid. Once a box is drawn over some of its
 * cells: the map as it was then, the box, how many cells it covers, and
 * where that last put the map.
 */
export interface Alignment {
  mapId: string;
  drawn?: { base: Transform; box: Box; cells: Cells; placed?: Frame };
}

const sameFrame = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Turns pointer, wheel and keyboard input into camera moves and scene edits.
 * Each tool's presses and drags are handled in gestures/; this class keeps
 * the selection, camera and cursor, routes input to the tool in use, and
 * offers the edits menus and shortcuts make.
 */
export default class SceneController implements ToolContext {
  readonly selection = store<string[]>([]);
  /** The group open for picking its members one at a time, if any. */
  readonly openGroup = store<string | null>(null);
  /** The token under the pointer, for the palette to act on. */
  readonly hoveredToken = store<string | null>(null);
  /** The selected elements as they are now, kept current as they change. */
  readonly selectedElements = store<readonly SceneElement[]>([]);
  /** Dominant colour of the scene's largest map, for the UI tint. */
  readonly mapColour = store<string | null>(null);
  /**
   * While an action asks for targets: clicking a token targets it (or stops
   * targeting it) instead of selecting it. `max` caps how many; past it the
   * oldest target drops off. `actor` is the acting character, whose token
   * distances are measured from.
   */
  readonly targetMode = store<{ max?: number; actor?: string } | null>(null);
  /** Tokens chosen while targeting, shared with peers through presence. */
  readonly targets = store<string[]>([]);
  /** Bumps whenever the scene's elements change. */
  readonly revision = store(0);

  /** An area to place for an action: the next drag on the map puts it down (see placeArea). */
  readonly placing = store<Placement | null>(null);
  /** A map being lined up with the grid: presses draw a box over its cells. */
  readonly aligning = store<Alignment | null>(null);

  /** The corners of a polygon (a shape, or an area of solid light or dark) being placed, a click at a time. */
  readonly polygon: PolygonDraft = new PolygonDraft(this);

  /** Walls being found on a map, for the GM to tune before adding them. */
  readonly wallDetection: WallDetector = new WallDetector(this);

  /** Whether this device is the GM's: only the GM sees and edits walls and lights. */
  gm = false;

  setGm(gm: boolean) {
    if (this.gm === gm) return;
    this.gm = gm;
    // What's hidden from players comes and goes with it.
    this.refresh();
  }

  /** Asks the canvas for text to put on the map, or to change: set by SceneCanvas. */
  onTextRequest: ((request: TextRequest) => void) | null = null;

  /** Send text requests to `handler` until the returned function is called. */
  handleTextRequests(handler: (request: TextRequest) => void): () => void {
    this.onTextRequest = handler;
    return () => {
      if (this.onTextRequest === handler) this.onTextRequest = null;
    };
  }
  /** Lets the table show eligible destinations while dragging a scene item token. */
  onItemTokenDragMove: ((token: TokenElement | null, event: PointerEvent) => void) | null = null;
  /** Handles transferring an item token out of the scene on pointer release. */
  onItemTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null = null;
  onTokenClick: ((token: TokenElement) => void) | null = null;
  /** Opens what a clicked pin leads to. */
  onPinClick: ((pin: PinElement) => void) | null = null;
  /** Asks what a new pin at `at` (in screen px) should lead to: set by SceneCanvas. */
  onPinRequest: ((request: PinRequest) => void) | null = null;
  onTokenDragMove: ((token: TokenElement | null, event?: PointerEvent) => void) | null = null;
  onTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null = null;

  private elements: SceneElement[] = [];
  /** The scene's elements as they are now, bottom to top. */
  allElements(): readonly SceneElement[] {
    return this.elements;
  }
  private byId = new Map<string, SceneElement>();
  /** What's on the scene but hidden from this player. */
  private hiddenFromMe = new Set<string>();
  private current: Gesture | null = null;
  /** What a press is doing: a drag, a marquee, a pinch. */
  private get gesture() {
    return this.current;
  }
  private set gesture(g: Gesture | null) {
    this.current = g;
    this.pressing.value = Boolean(g);
  }
  /** Whether a press is under way, so chrome over the scene can keep out of its way. */
  readonly pressing = store(false);
  /** Where the camera is, for chrome that follows things on the scene. */
  readonly camera = store<Camera>({ x: 0, y: 0, zoom: 1 });
  readonly pointers = new Map<number, Point>();
  /**
   * Which press in a quick run of them this is: 2 for a double click.
   * Counted here, since a pointer event's `detail` is always 0.
   */
  pressCount = 0;
  private lastPress = { time: -Infinity, x: 0, y: 0 };
  private spaceHeld = false;
  private hover: Point | null = null;
  private disposers: (() => void)[] = [];
  private saveTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private itemTokenDropFrame = 0;

  readonly scene: SceneDocument;
  readonly renderer: SceneRenderer;
  readonly host: HTMLElement;
  readonly sceneId: string;
  readonly tools: SceneTools;
  /** The campaign's current defaults for new things. */
  readonly defaults: () => CampaignDefaults;
  readonly presence: Presence | null;
  private lastCursor = 0;

  constructor(
    scene: SceneDocument,
    renderer: SceneRenderer,
    host: HTMLElement,
    sceneId: string,
    tools: SceneTools,
    defaults: () => CampaignDefaults,
    presence: Presence | null = null,
  ) {
    this.tools = tools;
    this.presence = presence;
    this.scene = scene;
    this.renderer = renderer;
    this.host = host;
    this.sceneId = sceneId;
    this.defaults = defaults;
  }

  start() {
    const refresh = () => {
      this.refresh();
    };
    const regrid = () => {
      this.renderer.setGrid(this.scene.grid());
      this.renderer.invalidate("overlay");
      // Walls being found snap to the grid.
      if (this.wallDetection.state.value) void this.wallDetection.refresh();
    };
    // A selected pin that goes out of sight, or whose target goes, drops out of the selection.
    this.renderer.onPinsHidden = (ids) => {
      const sel = this.selection.value.filter((id) => !ids.has(id));
      if (sel.length !== this.selection.value.length) this.selection.value = sel;
    };
    this.disposers.push(
      () => {
        this.renderer.onPinsHidden = null;
      },
      this.scene.elements.observe(refresh),
      this.scene.settings.observe(regrid),
      watch([this.selection], () => {
        const open = this.openGroup.value;
        if (open && !this.selected().some((element) => element.group === open))
          this.openGroup.value = null;
        const detecting = this.wallDetection.state.value;
        const sel = this.selection.value;
        if (detecting && (sel.length !== 1 || sel[0] !== detecting.mapId))
          this.wallDetection.stop();
        const aligning = this.aligning.value;
        if (aligning && (sel.length !== 1 || sel[0] !== aligning.mapId)) this.stopAligning();
        this.selectedElements.value = this.selected();
        this.updateOverlay();
      }),
      // Only a tool change should cancel a gesture, not the selection
      // changes that a marquee makes as it goes.
      watch(
        [
          this.tools.activeTool,
          this.tools.lightTool,
          this.tools.shapeTool,
          this.tools.effectTool,
          this.tools.fogTool,
          this.tools.selectable,
        ],
        () => {
          // The GM's lamps, areas and effect outlines show wherever they can be picked.
          this.renderer.helpersShown = new Set(this.tools.pickingKinds());
          const keep = this.selection.value.filter((id) => {
            const element = this.byId.get(id);
            return element && this.pickable(element);
          });
          if (keep.length !== this.selection.value.length) this.selection.value = keep;
          if (this.tools.activeTool.value !== "select") this.wallDetection.stop();
          if (this.tools.activeTool.value !== "select") this.stopAligning();
          this.cancelGesture();
          this.updateCursor();
          this.updateOverlay();
        },
      ),
    );
    this.renderer.insets = () => {
      const host = this.host.getBoundingClientRect();
      // Autohiding chrome doesn't cover the scene.
      if (this.host.closest(".table")?.getAttribute("data-autohide") === "true")
        return { left: 0, right: 0, top: 0 };
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const tools = rect(".toolbar");
      const leftRail = rect('.sidebar[data-side="left"] .sidebar-rail');
      const rightRail = rect('.sidebar[data-side="right"] .sidebar-rail');
      return {
        left: leftRail ? Math.max(0, leftRail.right - host.left) : 0,
        right: rightRail ? Math.max(0, host.right - rightRail.left) : 0,
        top: tools ? Math.max(0, tools.bottom - host.top) : 0,
      };
    };
    if (this.presence) {
      const { presence } = this;
      const show = () => {
        this.renderer.setPresence(
          presence.marks(this.sceneId, device.value.id, device.value.name, colourOf(device.value)),
        );
      };
      presence.setScene(this.sceneId);
      this.disposers.push(
        presence.subscribe(show),
        () => {
          presence.setScene(null);
        },
        () => {
          this.renderer.setPresence([]);
        },
      );
      this.disposers.push(watch([device], show));
      show();
    }
    regrid();
    this.refresh();
    this.restoreCamera();
    this.camera.value = this.renderer.camera;
    this.renderer.onCameraChange = (cam) => {
      this.camera.value = cam;
      this.scheduleSaveCamera();
    };

    const element = this.host;
    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      function_: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      element.addEventListener(type, function_ as EventListener, options);
      this.disposers.push(() => {
        element.removeEventListener(type, function_ as EventListener, options);
      });
    };
    listen("pointerdown", (e) => {
      this.onPointerDown(e);
    });
    listen("pointermove", (e) => {
      this.onPointerMove(e);
    });
    listen("pointerup", (e) => {
      this.onPointerUp(e);
    });
    listen("pointercancel", (e) => {
      this.onPointerUp(e, true);
    });
    listen("pointerleave", () => {
      this.presence?.setCursor(null);
      this.hover = null;
      this.renderer.setHoverToken(null);
      this.hoveredToken.value = null;
      this.updateOverlay();
    });
    listen(
      "wheel",
      (e) => {
        this.onWheel(e);
      },
      { passive: false },
    );
  }

  stop() {
    this.cancelGesture();
    this.wallDetection.stop();
    this.stopAligning();
    cancelAnimationFrame(this.itemTokenDropFrame);
    this.itemTokenDropFrame = 0;
    this.renderer.previews.clear();
    this.renderer.onCameraChange = null;
    clearTimeout(this.saveTimer);
    this.saveCamera();
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  // State

  private refresh() {
    this.revision.value++;
    // Players never get what's hidden from them; the GM sees it faded.
    const all = this.scene.views();
    const hidden = new Set(
      this.gm ? [] : all.flatMap((element) => (element.hidden ? [element.id] : [])),
    );
    const before = this.byId;
    this.elements = all.filter((element) => !hidden.has(element.id));
    // What a player has just been shown fades in, and what's just been hidden fades out.
    const fade = {
      revealed: new Set(this.elements.flatMap((e) => (this.hiddenFromMe.has(e.id) ? [e.id] : []))),
      concealed: new Set([...hidden].filter((id) => before.has(id))),
    };
    this.hiddenFromMe = hidden;
    this.byId = new Map(this.elements.map((e) => [e.id, e]));
    this.renderer.setElements(this.elements, fade);
    void this.wallDetection.follow();
    const targets = this.targets.value.filter((id) => this.byId.get(id)?.type === "token");
    if (targets.length !== this.targets.value.length) this.setTargets(targets);
    const sel = this.selection.value.filter((id) => this.byId.has(id));
    if (sel.length === this.selection.value.length) {
      this.selectedElements.value = this.selected();
      this.updateOverlay();
    } else {
      this.selection.value = sel;
    }
    this.updateMapColour();
    this.checkAligning();
  }

  /**
   * Stop lining a map up once it can't be, or once something else has
   * moved it (undo, a peer), so stale counts are never applied over that:
   * it's gone, no longer a map, or locked.
   */
  private checkAligning() {
    const aligning = this.aligning.value;
    if (!aligning) return;
    const map = this.byId.get(aligning.mapId);
    const placed = aligning.drawn?.placed;
    if (map?.type !== "map" || map.locked || (placed && !sameFrame(map, placed)))
      this.stopAligning();
  }

  private updateMapColour() {
    let main: SceneElement | null = null;
    for (const element of this.elements)
      if (element.type === "map" && (!main || element.w * element.h > main.w * main.h))
        main = element;
    if (main?.type !== "map") {
      this.mapColour.value = null;
      return;
    }
    void imageColour(main.image.hash, this.renderer.peers).then((c) => (this.mapColour.value = c));
  }

  /** Select elements; with `open`, open that group (or close any, with null) to pick its members alone. */
  select(ids: string[], { open }: { open?: string | null } = {}) {
    if (open !== undefined) this.openGroup.value = open;
    this.selection.value = ids;
  }

  /** `ids` with the rest of their groups, but for the group that's open. */
  withGroups(ids: readonly string[]): string[] {
    return withGroups(this.elements, ids, this.openGroup.value);
  }

  /** Make the selected elements a group of their own, together in the layer of the topmost. */
  group(ids: string[]) {
    if (ids.length < 2) return;
    const group = newId();
    this.scene.transact(() => {
      this.scene.update(ids.map((id) => [id, { group }]));
      this.scene.arrange(ids, { to: "together" });
    });
    this.openGroup.value = null;
  }

  /** Take apart the groups of the elements named, keeping them selected. */
  ungroup(ids: string[]) {
    const groups = new Set(ids.flatMap((id) => this.byId.get(id)?.group ?? []));
    const members = this.elements.filter((element) => element.group && groups.has(element.group));
    this.scene.update(members.map((element) => [element.id, { group: undefined }]));
    this.openGroup.value = null;
    this.selection.value = members.map((element) => element.id);
  }

  selected(): SceneElement[] {
    return this.selection.value
      .map((id) => this.byId.get(id))
      .filter((e): e is SceneElement => Boolean(e));
  }

  element(id: string) {
    return this.byId.get(id) ?? null;
  }

  updateOverlay() {
    // What's hidden, such as text being edited, has no outline or handles.
    const selected = this.selecting()
      ? this.selected().filter((element) => !this.renderer.hidden.has(element.id))
      : [];
    const g = this.gesture;
    const movable = selected.filter((element) => !element.locked);
    const groupBounds = movable.length > 1 && !g ? bounds(movable) : null;
    this.renderer.overlayState = {
      selected,
      handles: selected.length === 1 && !selected[0]!.locked && (!g || Boolean(g.keepsHandles)),
      group: g
        ? (g.groupFrame?.() ?? null)
        : groupBounds && {
            x: groupBounds.x + groupBounds.w / 2,
            y: groupBounds.y + groupBounds.h / 2,
            w: groupBounds.w,
            h: groupBounds.h,
            rot: 0,
          },
      marquee: g?.marqueeRect && this.hover ? g.marqueeRect(this.hover) : null,
      rangeFrom: this.rangeFrom(),
    };
    this.renderer.invalidate("overlay");
  }

  /** The token distances to targets are measured from: the acting character's first token. */
  rangeFrom(): string | null {
    const actor = this.targetMode.value?.actor;
    if (!actor) return null;
    return (
      this.elements.find((element) => element.type === "token" && element.characterId === actor)
        ?.id ?? null
    );
  }

  /** Target a token, or stop targeting it. */
  toggleTarget(id: string) {
    const t = this.targets.value;
    const max = this.targetMode.value?.max;
    const next = t.includes(id) ? t.filter((x) => x !== id) : [...t, id];
    this.setTargets(max === undefined ? next : next.slice(-max));
  }

  /** The chosen targets, with each one's distance from the actor's token (null without one). */
  targetDetails(): {
    id: string;
    name: string;
    characterId?: string;
    distance: number | null;
  }[] {
    const fromId = this.rangeFrom();
    const from = fromId ? this.byId.get(fromId) : undefined;
    return this.targets.value.flatMap((id) => {
      const element = this.byId.get(id);
      if (element?.type !== "token") return [];
      return [
        {
          id,
          name: element.name || "Unnamed token",
          ...(element.characterId ? { characterId: element.characterId } : {}),
          distance: from ? tokenDistance(this.renderer.grid, from, element) : null,
        },
      ];
    });
  }

  /** Start or stop asking for targets; stopping clears them. */
  setTargetMode(mode: { max?: number; actor?: string } | null) {
    this.targetMode.value = mode;
    if (!mode) this.setTargets([]);
    this.updateOverlay();
    this.updateCursor();
  }

  setTargets(ids: string[]) {
    this.targets.value = ids;
    this.presence?.setTargets(ids);
    this.updateOverlay();
  }

  private updateCursor(cursor?: string) {
    this.host.style.cursor = cursor ?? this.gesture?.cursor ?? this.idleCursor();
  }

  /** The cursor for the tool in use, between gestures. */
  private idleCursor(): string {
    const tool = this.tools.activeTool.value;
    if (this.spaceHeld) return "grab";
    if (this.placing.value || this.aligning.value || (tool === "select" && this.targetMode.value))
      return "crosshair";
    return toolCursor(tool, {
      shape: tool === "fog" ? this.tools.fogTool.value.shape : this.tools.shapeTool.value,
      effect: this.tools.effectTool.value.effect,
    });
  }

  // Camera

  private restoreCamera() {
    const saved = readSceneCamera(this.sceneId);
    if (saved) {
      this.renderer.setCamera(saved);
      return;
    }
    this.fit();
  }

  private scheduleSaveCamera() {
    clearTimeout(this.saveTimer);
    this.saveTimer = globalThis.setTimeout(() => {
      this.saveCamera();
    }, 300);
  }

  private saveCamera() {
    saveSceneCamera(this.sceneId, this.renderer.camera);
  }

  /** Show everything in the scene, or the origin at 100% if it's empty, in the space the chrome leaves clear. */
  fit() {
    const { width, height } = this.renderer.size;
    const inset = this.renderer.insets();
    const w = Math.max(1, width - inset.left - inset.right);
    const h = Math.max(1, height - inset.top);
    const b = bounds(this.elements);
    const camera = b ? fitCamera(b, w, h) : { x: w / 2, y: h / 2, zoom: 1 };
    this.renderer.setCamera({ ...camera, x: camera.x + inset.left, y: camera.y + inset.top });
  }

  zoomBy(factor: number, at?: Point) {
    const { width, height } = this.renderer.size;
    this.renderer.setCamera(
      zoomAt(this.renderer.camera, at ?? { x: width / 2, y: height / 2 }, factor),
    );
    this.updateOverlay();
  }

  zoomTo(zoom: number) {
    this.zoomBy(clampZoom(zoom) / this.renderer.camera.zoom);
  }

  /** World point under a client (viewport) point. */
  toWorld(clientX: number, clientY: number): Point {
    return toWorld(this.renderer.camera, this.toScreen(clientX, clientY));
  }

  private toScreen(clientX: number, clientY: number): Point {
    const r = this.host.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  centre(): Point {
    const { width, height } = this.renderer.size;
    return toWorld(this.renderer.camera, { x: width / 2, y: height / 2 });
  }

  // Hit testing

  /** Whether the tool in use selects. */
  private selecting(): boolean {
    return this.tools.activeTool.value === "select";
  }

  /**
   * Whether an element can be picked with the tool in use: the sorts the
   * Select tool's options turn on, or in the Lights or Effects tool what it
   * makes. Only the GM picks walls, lights and effects, and no one picks a
   * pin hidden from them.
   */
  pickable(element: SceneElement): boolean {
    return this.picker()(element);
  }

  /** `pickable`, with the active tool's kinds looked up once, for testing many elements. */
  private picker(): (element: SceneElement) => boolean {
    const kinds = this.tools.pickingKinds();
    return (element) => {
      const kind = kindOf(element);
      return (
        !this.hiddenPin(element) && (this.gm || !GM_KINDS.includes(kind)) && kinds.includes(kind)
      );
    };
  }

  /** Whether an element is a pin hidden from this device: never picked, hit or kept selected. */
  private hiddenPin(element: SceneElement): boolean {
    return element.type === "pin" && this.renderer.pinLookOf(element) === "hidden";
  }

  /** Topmost element under p. Locked elements only count when asked. */
  hitTest(p: Point, includeLocked = false, ignoreTool = false): SceneElement | null {
    const tolerance = 4 / this.renderer.camera.zoom;
    const pickable = ignoreTool ? () => true : this.picker();
    for (let index = this.elements.length - 1; index >= 0; index--) {
      const element = this.elements[index];
      if (!element) continue;
      if (element.locked && !includeLocked) continue;
      if (!pickable(element) || this.hiddenPin(element)) continue;
      if (hits(element, p, tolerance)) return element;
    }
    return null;
  }

  // Pointer input

  private onPointerDown(e: PointerEvent) {
    if (e.button === 2) return;
    const screen = this.toScreen(e.clientX, e.clientY);
    const world = toWorld(this.renderer.camera, screen);
    this.countPress(e, screen);
    this.pointers.set(e.pointerId, screen);
    this.host.setPointerCapture(e.pointerId);
    this.hover = world;

    // A second finger turns whatever was happening into a pinch.
    if (this.pointers.size === 2) {
      this.cancelGesture();
      this.gesture = pinch(this);
      return;
    }
    if (this.pointers.size > 2) return;

    // Placing an action's area: the press is its origin (or centre), the drag aims it.
    const placing = this.placing.value;
    if (placing && e.button === 0 && !this.spaceHeld) {
      this.gesture = dragShape(this, e, world, placing.shape, placementPlan(this, placing));
      this.updateCursor();
      return;
    }

    if (this.aligning.value && e.button === 0 && !this.spaceHeld) {
      this.gesture = alignBox(this, world, (box) => {
        this.alignDrawn(box);
      });
      this.updateCursor();
      return;
    }

    const tool = e.button === 1 || this.spaceHeld ? "pan" : this.tools.activeTool.value;
    this.gesture = TOOL_PRESS[tool](this, e, world, screen);
    this.updateCursor();
    this.updateOverlay();
  }

  private countPress(e: PointerEvent, screen: Point) {
    const last = this.lastPress;
    const again =
      e.timeStamp - last.time <= MULTI_CLICK_MS &&
      Math.hypot(screen.x - last.x, screen.y - last.y) <= MULTI_CLICK_SLOP;
    this.pressCount = again ? this.pressCount + 1 : 1;
    this.lastPress = { time: e.timeStamp, ...screen };
  }

  private onPointerMove(e: PointerEvent) {
    const screen = this.toScreen(e.clientX, e.clientY);
    const world = toWorld(this.renderer.camera, screen);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    this.hover = world;
    const g = this.gesture;
    const under = this.hitTest(world, true);
    const hovered = under?.type === "token" ? under.id : null;
    this.renderer.setHoverToken(hovered, screen);
    if (this.hoveredToken.value !== hovered) this.hoveredToken.value = hovered;

    // Share the cursor at about 20 Hz.
    const now = performance.now();
    if (this.presence && now - this.lastCursor > 50) {
      this.lastCursor = now;
      this.presence.setCursor(world);
    }

    if (g) {
      g.move?.(e, world, screen);
      return;
    }
    if (this.selecting() && !this.spaceHeld) this.updateCursor(hoverCursor(this, world, screen));
    this.polygon.preview(world, e);
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    // Lifting one finger of a pinch ends it; the other can't start a new gesture.
    if (g.kind === "pinch") {
      if (this.pointers.size === 0) this.gesture = null;
      this.updateCursor();
      return;
    }
    if (cancelled) {
      this.cancelGesture(e);
      return;
    }
    this.gesture = null;
    g.end?.(e);
    this.updateCursor();
    this.updateOverlay();
  }

  commitPreviews() {
    const { previews } = this.renderer;
    if (previews.size === 0) return;
    this.scene.update([...previews].map(([id, t]) => [id, transformOf(t)]));
    previews.clear();
    this.renderer.invalidate("elements", "overlay");
  }

  /** Shrink a scene item token into its drop point before transferring it. */
  animateItemTokenDrop(id: string, clientX: number, clientY: number, complete: () => void) {
    const original = this.byId.get(id);
    if (original?.type !== "token") {
      complete();
      return;
    }
    const current = this.renderer.previews.get(id) ?? original;
    cancelAnimationFrame(this.itemTokenDropFrame);
    const from = transformOf(current);
    const point = this.toWorld(clientX, clientY);
    const to = {
      ...from,
      x: point.x,
      y: point.y,
      w: Math.max(1, from.w * 0.06),
      h: Math.max(1, from.h * 0.06),
    };
    const finish = () => {
      this.renderer.previews.delete(id);
      this.itemTokenDropFrame = 0;
      this.renderer.invalidate("previews", "overlay");
      complete();
    };
    if (reducedMotion.matches) {
      finish();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 180);
      const eased = 1 - (1 - progress) ** 3;
      this.renderer.previews.set(id, {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        w: from.w + (to.w - from.w) * eased,
        h: from.h + (to.h - from.h) * eased,
        rot: from.rot,
      });
      this.renderer.invalidate("previews", "overlay");
      if (progress < 1) this.itemTokenDropFrame = requestAnimationFrame(tick);
      else finish();
    };
    this.itemTokenDropFrame = requestAnimationFrame(tick);
  }

  /** Drop an in-progress gesture without changing the scene; `e` is the pointercancel, if that's why. */
  cancelGesture(e?: PointerEvent) {
    this.polygon.cancel();
    const g = this.gesture;
    if (!g) return;
    g.cancel?.(e);
    this.gesture = null;
    this.renderer.previews.clear();
    this.renderer.draft = null;
    this.renderer.invalidate("elements", "overlay");
    this.updateCursor();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const at = this.toScreen(e.clientX, e.clientY);
    const lines = e.deltaMode === WheelEvent.DOM_DELTA_LINE;
    // Pinching a trackpad sends ctrl + wheel; a mouse wheel sends big whole
    // steps. Both zoom. Two-finger trackpad scrolling pans.
    const mouseWheel =
      lines || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const dy = lines ? e.deltaY * 40 : e.deltaY;
      this.zoomBy(Math.exp(-dy * (e.ctrlKey && !mouseWheel ? 0.01 : 0.0015)), at);
    } else {
      const cam = this.renderer.camera;
      this.renderer.setCamera({
        ...cam,
        x: cam.x - e.deltaX,
        y: cam.y - e.deltaY,
      });
    }
    this.hover = toWorld(this.renderer.camera, at);
    this.updateOverlay();
  }

  // Keyboard

  /**
   * Handle a key press aimed at the canvas; returns true if it was used.
   * Undo, Duplicate, Delete and Fit are commands, with their own keys (workspace/commands).
   */
  onKeyDown(e: KeyboardEvent): boolean {
    const module_ = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (key === " " && !module_) {
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.updateCursor();
      }
      return true;
    }
    if (module_ && key === "a") {
      if (!this.selecting()) this.tools.activeTool.value = "select";
      this.selection.value = this.elements.flatMap((element) =>
        !element.locked && this.pickable(element) ? [element.id] : [],
      );
      return true;
    }
    if (module_) return false;

    switch (e.key) {
      case "Enter": {
        if (!this.polygon.active) return false;
        this.polygon.finish();
        return true;
      }
      case "Escape": {
        this.wallDetection.stop();
        if (this.aligning.value) {
          this.cancelGesture();
          this.stopAligning();
        } else if (this.gesture || this.polygon.active) this.cancelGesture();
        else if (this.openGroup.value) {
          // Out of an open group, to the whole group.
          const group = this.openGroup.value;
          this.openGroup.value = null;
          this.selection.value = membersOf(this.elements, group);
        } else this.selection.value = [];
        return true;
      }
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        const step = e.shiftKey ? cellOr(this.renderer.grid, 10) : 1;
        const nudge = ARROW_NUDGES[e.key]!;
        const sel = this.selected().filter((element) => !element.locked);
        if (sel.length === 0) return false;
        this.scene.update(
          sel.map((element) => [
            element.id,
            { x: element.x + nudge.x * step, y: element.y + nudge.y * step },
          ]),
        );
        return true;
      }
      case "=":
      case "+": {
        this.zoomBy(1.25);
        return true;
      }
      case "-":
      case "_": {
        this.zoomBy(0.8);
        return true;
      }
    }
    // By key position, so Shift + digit works on any keyboard layout.
    if (e.shiftKey && e.code === "Digit0") {
      this.zoomTo(1);
      return true;
    }
    return false;
  }

  onKeyUp(e: KeyboardEvent) {
    if (e.key === " ") {
      this.spaceHeld = false;
      this.updateCursor();
    }
  }

  /** The window lost focus, so keys may have been released unseen. */
  onBlur() {
    this.spaceHeld = false;
    this.updateCursor();
  }

  // Edits, for menus and shortcuts

  remove(ids: string[]) {
    const removable = ids.filter((id) => this.byId.get(id)?.locked === false);
    if (removable.length === 0) return;
    this.scene.remove(removable);
    const removableIds = new Set(removable);
    this.selection.value = this.selection.value.filter((id) => !removableIds.has(id));
  }

  duplicate(ids: string[]) {
    if (ids.length === 0) return;
    const copies = this.scene.duplicate(ids, cellOr(this.renderer.grid, DUPLICATE_OFFSET));
    this.afterCopy(copies);
    this.selection.value = copies;
  }

  /** Called with new copies, duplicated or pasted, so the table can give a template's token a copy of its own. */
  afterCopy: (ids: string[]) => void = () => {};

  /**
   * Clipboard HTML for the elements named that this player can pick, or
   * null if there are none. Cutting also removes them (all but locked ones).
   */
  copy(ids: string[], { cut = false } = {}): string | null {
    const named = new Set(ids);
    const copied = this.elements.filter(
      (element) => named.has(element.id) && this.pickable(element),
    );
    if (copied.length === 0) return null;
    if (cut) this.remove(copied.map((element) => element.id));
    return clipboardHtml(copied);
  }

  /**
   * Put copied elements on the scene, unlocked and selected: centred on
   * `at`, or else where they were copied from if that's in view (nudged a
   * cell at a time off copies already there), or else in the middle of the view.
   */
  paste(copies: readonly NewElement[], at?: Point) {
    const usable = copies.filter((copy) => this.gm || !GM_KINDS.includes(kindOf(copy)));
    const box = bounds(usable);
    if (!box) return;
    const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const { width, height } = this.renderer.size;
    const inView = intersects(visibleWorld(this.renderer.camera, width, height), box);
    const target = at ?? (inView ? null : this.centre());
    let shift = target ? { x: target.x - middle.x, y: target.y - middle.y } : { x: 0, y: 0 };
    if (!target) {
      const step = cellOr(this.renderer.grid, DUPLICATE_OFFSET);
      const first = usable[0]!;
      const landsOnCopy = () =>
        this.elements.some(
          (element) =>
            element.type === first.type &&
            Math.abs(element.x - first.x - shift.x) < SAME_PLACE &&
            Math.abs(element.y - first.y - shift.y) < SAME_PLACE,
        );
      for (let tries = 0; tries < MAX_PASTE_NUDGES && landsOnCopy(); tries++)
        shift = { x: shift.x + step, y: shift.y + step };
    }
    const ids = this.scene.add(
      ...regroup(usable).map((copy) => ({
        ...copy,
        x: copy.x + shift.x,
        y: copy.y + shift.y,
        locked: false,
      })),
    );
    this.afterCopy(ids);
    this.tools.activeTool.value = "select";
    this.selection.value = ids;
  }

  setLocked(ids: string[], locked: boolean) {
    this.scene.update(ids.map((id) => [id, { locked }]));
  }

  /** Hide elements from players, or show them again. */
  setHidden(ids: string[], hidden: boolean) {
    this.scene.update(ids.map((id) => [id, { hidden: hidden || undefined }]));
  }

  /** Restack elements, or move them to another layer. */
  arrange(ids: string[], how: Arrangement) {
    this.scene.arrange(ids, how);
  }

  /**
   * Change elements' properties as one undo step; text is resized to fit.
   * Turning a door back into a wall forgets whether it was open.
   */
  setProps(ids: string[], patch: ElementPatch) {
    const fixed = "door" in patch && patch.door === false ? { ...patch, open: undefined } : patch;
    this.scene.update(
      ids.flatMap((id) => {
        const element = this.byId.get(id);
        return element ? [[id, fitPatch(this, element, fixed)] as [string, ElementPatch]] : [];
      }),
    );
  }

  /** Show elements with changed properties without changing them yet; null to stop. */
  previewProps(ids: string[], patch: ElementPatch | null) {
    for (const id of ids) {
      const element = this.byId.get(id);
      if (!element) continue;
      if (patch) this.renderer.previews.set(id, { ...element, ...patch } as Transform);
      else this.renderer.previews.delete(id);
    }
    this.renderer.invalidate("previews");
  }

  /** Start finding the walls on map `id`, to tune and then add. */
  detectWalls(id: string) {
    this.cancelGesture();
    this.tools.activeTool.value = "select";
    this.selection.value = [id];
    this.stopAligning();
    void this.wallDetection.start(id);
  }

  /** Start lining map `id` up with the grid: a drag over some of its cells then sizes and places it. */
  alignMap(id: string) {
    this.cancelGesture();
    this.tools.activeTool.value = "select";
    this.selection.value = [id];
    this.wallDetection.stop();
    this.aligning.value = { mapId: id };
    this.updateCursor();
  }

  stopAligning() {
    if (!this.aligning.value) return;
    this.aligning.value = null;
    this.updateCursor();
  }

  /** Say how many cells the drawn box covers, and line the map up again from how it was when the box was drawn. */
  setAlignCells(cells: Cells) {
    const aligning = this.aligning.value;
    if (!aligning?.drawn) return;
    this.aligning.value = { ...aligning, drawn: { ...aligning.drawn, cells } };
    this.applyAlignment();
  }

  /** A box has been drawn over the map's cells: guess how many it covers, and line the map up. */
  private alignDrawn(box: Box) {
    const map = this.aligning.value && this.byId.get(this.aligning.value.mapId);
    const pitch = gridPitch(this.renderer.grid);
    if (!map || !pitch) return;
    this.aligning.value = {
      mapId: map.id,
      drawn: {
        base: transformOf(map),
        box,
        cells: guessCells(box, pitch),
      },
    };
    this.applyAlignment();
  }

  /** Scale the map so the box covers its cells of the grid, with its corner on a grid point. */
  private applyAlignment() {
    const aligning = this.aligning.value;
    if (!aligning?.drawn) return;
    const frame = fitBox(aligning.drawn.base, aligning.drawn, this.renderer.grid);
    if (!frame) return;
    // Noted first: the update comes straight back through refresh, which checks it.
    this.aligning.value = { ...aligning, drawn: { ...aligning.drawn, placed: frame } };
    this.scene.update([[aligning.mapId, frame]]);
  }

  /**
   * Ask for an action's area to be placed: the next press puts it down and
   * a drag aims it. Calls back with the new shape and the tokens it covers;
   * null if cancelled.
   */
  placeArea(p: Placement | null) {
    this.placing.value?.onPlaced(null);
    this.placing.value = p;
    this.updateCursor();
  }

  /** How new text with these words would look. */
  newTextLook(text: string) {
    return newTextLook(this, text);
  }

  /** Leave an element undrawn, such as text while it's edited, until the returned function is called. */
  hide(id: string): () => void {
    this.renderer.hidden.add(id);
    this.updateOverlay();
    return () => {
      this.renderer.hidden.delete(id);
      this.updateOverlay();
    };
  }

  /** Put text on the map, or change existing text's words, measured at the size it's drawn. */
  putText(at: Point, text: string, id?: string) {
    putText(this, at, text, id);
  }

  /**
   * Change a token's name, style and colour as one undo step; with `cells`,
   * also make it that many cells across, snapped to the grid.
   */
  updateToken(
    id: string,
    patch: {
      [
        K in
          | "characterId"
          | "colour"
          | "hideBars"
          | "hideName"
          | "image"
          | "itemDefId"
          | "name"
          | "style"
      ]?: TokenElement[K] | undefined;
    },
    cells?: number,
  ) {
    const element = this.byId.get(id);
    const { grid } = this.renderer;
    const size = cells && element ? cells * grid.size : 0;
    const resize =
      size && element && (Math.abs(element.w - size) > 0.5 || Math.abs(element.h - size) > 0.5);
    this.scene.update([
      [id, resize ? { ...patch, ...snapPoint(grid, element, cells), w: size, h: size } : patch],
    ]);
  }

  /** The names of every token on the scene, for naming new ones apart. */
  tokenNames(): string[] {
    return this.elements.flatMap((element) => (element.type === "token" ? [element.name] : []));
  }

  /** Swap an image between being a map and being a token. */
  convert(id: string, to: "map" | "token") {
    const element = this.byId.get(id);
    const patch = element && conversion(element, to, this.renderer.grid, this.newTokenLook(true));
    if (!patch) return;
    this.scene.update([[id, patch]]);
    this.scene.arrange([id], { to: "layer", layer: to });
  }

  /** A new token's colour and style, unless told otherwise: an image token takes the campaign's style. */
  private newTokenLook(image: boolean, look: { colour?: string; style?: TokenStyle } = {}) {
    return {
      colour: look.colour ?? randomTokenColour(),
      style: look.style ?? (image ? this.defaults().tokenStyle : ("disc" as const)),
    };
  }

  addToken(
    at: Point,
    name = "",
    options: {
      image?: BlobReference;
      icon?: string;
      itemDefId?: string;
      style?: TokenStyle;
      colour?: string;
      graphic?: EntityGraphic;
      entityRef?: EntityGraphicReference;
    } = {},
  ) {
    return this.placeToken(at, { ...options, name });
  }

  /** A token standing for a character, at a world point. */
  addCharacterToken(
    at: Point,
    spec: {
      characterId: string;
      name: string;
      image?: BlobReference;
      style?: TokenStyle;
      colour?: string;
      graphic?: EntityGraphic;
      entityRef?: EntityGraphicReference;
    },
  ) {
    return this.placeToken(at, spec);
  }

  /** Put down a pin leading to `link`, its point at `at`, and select it. */
  addPin(at: Point, link: LinkReference) {
    const id = this.scene.add(newPin(this.renderer.grid, at, link))[0]!;
    this.selection.value = [id];
    return id;
  }

  private placeToken(
    at: Point,
    spec: Omit<TokenSpec, "colour" | "style"> & { colour?: string; style?: TokenStyle },
  ) {
    const look = this.newTokenLook(Boolean(spec.image) || spec.graphic?.kind === "image", spec);
    const id = this.scene.add(newToken(this.renderer.grid, at, { ...spec, ...look }))[0]!;
    this.tools.activeTool.value = "select";
    this.selection.value = [id];
    return id;
  }

  /**
   * Import image files at a world point. Small, squarish images become
   * tokens; anything else is placed as a map at its own size.
   */
  async importFiles(files: Iterable<File>, at: Point) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    this.host.style.cursor = "progress";
    const { grid } = this.renderer;
    const added: NewElement[] = [];
    try {
      const imported = await Promise.all(
        images.map(async (file) => {
          try {
            return await importImage(file);
          } catch (error) {
            console.error(`Couldn't import ${file.name}`, error);
            return null;
          }
        }),
      );
      const placed = await Promise.all(
        imported.map(async (image, index) => {
          if (!image) return null;
          const file = images[index]!;
          const shift = index * cellOr(grid, 40);
          const p = { x: at.x + shift, y: at.y + shift };
          const element = imageElement(grid, image, file.name, p, this.newTokenLook(true));
          return element.type === "map" ? alignedToImageGrid(element, file, grid) : element;
        }),
      );
      added.push(...placed.filter((element) => element !== null));
    } finally {
      this.updateCursor();
    }
    if (added.length === 0) return;
    this.tools.activeTool.value = "select";
    this.selection.value = this.scene.add(...added);
  }
}
