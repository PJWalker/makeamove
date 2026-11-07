import { store, watch } from "../lib/store";
import type { CampaignDefaults } from "../campaign/campaign";
import { device } from "../platform/device";

import { colourOf, type Presence } from "./presence";
import { clampZoom, fitCamera, toWorld, zoomAt } from "./camera";
import { readSceneCamera, saveSceneCamera } from "./cameraMemory";
import { bounds, hits } from "./geometry";
import { type Point, snapPoint } from "./grid";
import { importImage, imageColour } from "./images";
import { tokenDistance } from "./measure";
import { conversion, imageElement, newToken, type TokenSpec } from "./newElements";
import type { SceneRenderer } from "./renderer";
import type { SceneDoc } from "./sceneDoc";
import { activeTool, ERASER_RADIUS, lightTool } from "./tools";
import {
  LAYERS,
  type BlobRef,
  type Layer,
  type AreaTone,
  type NewElement,
  type SceneElement,
  type TokenElement,
  type TokenStyle,
  type Transform,
} from "./types";
import { TOOL_PRESS } from "./gestures";
import { AreaDraft } from "./gestures/light";
import { pinch } from "./gestures/pan";
import { hoverCursor } from "./gestures/select";
import { dragShape, type Placement } from "./gestures/shape";
import { putText } from "./gestures/text";
import type { Gesture, ToolContext } from "./gestures/types";

/** This member's token colour, from their device id. */
const memberColour = () => colourOf(device.value);

/**
 * Turns pointer, wheel and keyboard input into camera moves and scene edits.
 * Each tool's presses and drags are handled in gestures/; this class keeps
 * the selection, camera and cursor, routes input to the tool in use, and
 * offers the edits menus and shortcuts make.
 */
export class SceneController implements ToolContext {
  readonly selection = store<string[]>([]);
  /** Dominant colour of the scene's largest map, for the UI tint. */
  readonly mapColour = store<string | null>(null);
  readonly canUndo = store(false);
  readonly canRedo = store(false);
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

  /** The corners of an area of solid light or dark being placed, a click at a time. */
  readonly area: AreaDraft = new AreaDraft(this);

  /** Whether this device is the GM's: only the GM sees and edits walls and lights. */
  gm = false;

  /** Asks the canvas for text to put on the map, or to change: set by SceneCanvas. */
  onTextRequest: ((req: { at: Point; screen: Point; id?: string; text?: string }) => void) | null =
    null;
  /** Lets the table show eligible destinations while dragging a scene item token. */
  onItemTokenDragMove: ((token: TokenElement | null, event: PointerEvent) => void) | null = null;
  /** Handles transferring an item token out of the scene on pointer release. */
  onItemTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null = null;
  onTokenClick: ((token: TokenElement) => void) | null = null;
  onTokenDragMove: ((token: TokenElement | null, event?: PointerEvent) => void) | null = null;
  onTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null = null;

  private elements: SceneElement[] = [];
  /** The scene's elements as they are now, bottom to top. */
  allElements(): readonly SceneElement[] {
    return this.elements;
  }
  private byId = new Map<string, SceneElement>();
  private gesture: Gesture | null = null;
  readonly pointers = new Map<number, Point>();
  private spaceHeld = false;
  private hover: Point | null = null;
  private disposers: (() => void)[] = [];
  private saveTimer = 0;
  private itemTokenDropFrame = 0;

  readonly scene: SceneDoc;
  readonly renderer: SceneRenderer;
  readonly host: HTMLElement;
  readonly sceneId: string;
  /** The campaign's current defaults for new things. */
  readonly defaults: () => CampaignDefaults;
  readonly presence: Presence | null;
  private lastCursor = 0;

  constructor(
    scene: SceneDoc,
    renderer: SceneRenderer,
    host: HTMLElement,
    sceneId: string,
    defaults: () => CampaignDefaults,
    presence: Presence | null = null,
  ) {
    this.presence = presence;
    this.scene = scene;
    this.renderer = renderer;
    this.host = host;
    this.sceneId = sceneId;
    this.defaults = defaults;
  }

  start() {
    const refresh = () => this.refresh();
    const regrid = () => {
      this.renderer.setGrid(this.scene.grid());
      this.renderer.invalidate("overlay");
    };
    const history = () => {
      this.canUndo.value = this.scene.undo.canUndo();
      this.canRedo.value = this.scene.undo.canRedo();
    };
    this.scene.elements.observeDeep(refresh);
    this.scene.settings.observe(regrid);
    this.scene.undo.on("stack-item-added", history);
    this.scene.undo.on("stack-item-popped", history);
    this.disposers.push(
      () => this.scene.elements.unobserveDeep(refresh),
      () => this.scene.settings.unobserve(regrid),
      () => this.scene.undo.off("stack-item-added", history),
      () => this.scene.undo.off("stack-item-popped", history),
      watch([this.selection], () => this.updateOverlay()),
      // Only a tool change should cancel a gesture, not the selection
      // changes that a marquee makes as it goes.
      watch([activeTool, lightTool], () => {
        // Lamps and areas show, and stay selected, only in the Lights tool.
        this.renderer.lightsShown = activeTool.value === "light";
        const keep = this.selection.value.filter((id) => {
          const el = this.byId.get(id);
          return el && this.pickable(el);
        });
        if (keep.length !== this.selection.value.length) this.selection.value = keep;
        this.cancelGesture();
        this.updateCursor();
        this.updateOverlay();
      }),
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
      const presence = this.presence;
      const show = () =>
        this.renderer.setPresence(
          presence.marks(this.sceneId, device.value.id, device.value.name, colourOf(device.value)),
        );
      presence.setScene(this.sceneId);
      this.disposers.push(
        presence.subscribe(show),
        () => presence.setScene(null),
        () => this.renderer.setPresence([]),
      );
      this.disposers.push(
        watch([device], show),
      );
      show();
    }
    regrid();
    this.refresh();
    this.restoreCamera();
    this.renderer.onCameraChange = () => this.scheduleSaveCamera();

    const el = this.host;
    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    listen("pointerdown", (e) => this.onPointerDown(e));
    listen("pointermove", (e) => this.onPointerMove(e));
    listen("pointerup", (e) => this.onPointerUp(e));
    listen("pointercancel", (e) => this.onPointerUp(e, true));
    listen("pointerleave", () => {
      this.presence?.setCursor(null);
      this.hover = null;
      this.renderer.setHoverToken(null);
      this.updateOverlay();
    });
    listen("wheel", (e) => this.onWheel(e), { passive: false });
  }

  stop() {
    this.cancelGesture();
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
    this.elements = this.scene.views();
    this.byId = new Map(this.elements.map((e) => [e.id, e]));
    this.renderer.setElements(this.elements);
    const targets = this.targets.value.filter((id) => this.byId.get(id)?.type === "token");
    if (targets.length !== this.targets.value.length) this.setTargets(targets);
    const sel = this.selection.value.filter((id) => this.byId.has(id));
    if (sel.length !== this.selection.value.length) this.selection.value = sel;
    else this.updateOverlay();
    this.updateMapColour();
  }

  private updateMapColour() {
    let main: SceneElement | null = null;
    for (const el of this.elements)
      if (el.type === "map" && (!main || el.w * el.h > main.w * main.h)) main = el;
    if (!main || main.type !== "map") {
      this.mapColour.value = null;
      return;
    }
    imageColour(main.image.hash).then((c) => (this.mapColour.value = c));
  }

  selected(): SceneElement[] {
    return this.selection.value
      .map((id) => this.byId.get(id))
      .filter((e): e is SceneElement => !!e);
  }

  element(id: string) {
    return this.byId.get(id) ?? null;
  }

  updateOverlay() {
    const tool = activeTool.value;
    const selected = this.selecting() ? this.selected() : [];
    const g = this.gesture;
    const movable = selected.filter((el) => !el.locked);
    const groupBounds = movable.length > 1 && !g ? bounds(movable) : null;
    this.renderer.overlayState = {
      selected,
      handles: selected.length === 1 && !selected[0]!.locked && (!g || !!g.keepsHandles),
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
      eraser:
        tool === "erase" && this.hover
          ? { p: this.hover, r: ERASER_RADIUS / this.renderer.camera.zoom }
          : null,
      rangeFrom: this.rangeFrom(),
    };
    this.renderer.invalidate("overlay");
  }

  /** The token distances to targets are measured from: the acting character's first token. */
  rangeFrom(): string | null {
    const actor = this.targetMode.value?.actor;
    if (!actor) return null;
    return this.elements.find((el) => el.type === "token" && el.characterId === actor)?.id ?? null;
  }

  /** Target a token, or stop targeting it. */
  toggleTarget(id: string) {
    const t = this.targets.value;
    const max = this.targetMode.value?.max;
    const next = t.includes(id) ? t.filter((x) => x !== id) : [...t, id];
    this.setTargets(max !== undefined ? next.slice(-max) : next);
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
      const el = this.byId.get(id);
      if (el?.type !== "token") return [];
      return [
        {
          id,
          name: el.name || "Unnamed token",
          ...(el.characterId ? { characterId: el.characterId } : {}),
          distance: from ? tokenDistance(this.renderer.grid, from, el) : null,
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
    const tool = activeTool.value;
    this.host.style.cursor =
      cursor ??
      this.gesture?.cursor ??
      (this.spaceHeld || tool === "pan"
        ? "grab"
        : this.placing.value ||
            tool === "draw" ||
            tool === "shape" ||
            tool === "wall" ||
            (tool === "light" && !this.selecting()) ||
            tool === "ruler" ||
            tool === "ping" ||
            (tool === "select" && this.targetMode.value)
          ? "crosshair"
          : tool === "text"
            ? "text"
            : tool === "erase"
              ? "none"
              : "default");
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
    this.saveTimer = window.setTimeout(() => this.saveCamera(), 300);
  }

  private saveCamera() {
    saveSceneCamera(this.sceneId, this.renderer.camera);
  }

  /** Show everything in the scene, or the origin at 100% if it's empty. */
  fit() {
    const { width, height } = this.renderer.size;
    const b = bounds(this.elements);
    this.renderer.setCamera(
      b ? fitCamera(b, width, height) : { x: width / 2, y: height / 2, zoom: 1 },
    );
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

  /** Whether the tool in use selects: the Select tool, or the Lights tool's own. */
  private selecting(): boolean {
    const tool = activeTool.value;
    return tool === "select" || (tool === "light" && lightTool.value === "select");
  }

  /**
   * Whether an element can be picked with the tool in use: in the Lights tool
   * only lamps and areas, which nothing else can pick. Only the GM picks walls.
   */
  pickable(el: SceneElement): boolean {
    const lamp = el.type === "light" || el.type === "area";
    if (activeTool.value === "light") return lamp && this.gm;
    return !lamp && (el.type !== "wall" || this.gm);
  }

  /** Topmost element under p. Locked elements only count when asked. */
  hitTest(p: Point, includeLocked = false, ignoreTool = false): SceneElement | null {
    const tolerance = 4 / this.renderer.camera.zoom;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (!el) continue;
      if (el.locked && !includeLocked) continue;
      if (!ignoreTool && !this.pickable(el)) continue;
      if (hits(el, p, tolerance)) return el;
    }
    return null;
  }

  // Pointer input

  private onPointerDown(e: PointerEvent) {
    if (e.button === 2) return;
    const screen = this.toScreen(e.clientX, e.clientY);
    const world = toWorld(this.renderer.camera, screen);
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
      this.gesture = dragShape(this, e, world, placing.shape, placing);
      this.updateCursor();
      return;
    }

    const tool =
      e.button === 1 || this.spaceHeld ? "pan" : this.selecting() ? "select" : activeTool.value;
    this.gesture = TOOL_PRESS[tool](this, e, world, screen);
    this.updateCursor();
    this.updateOverlay();
  }

  private onPointerMove(e: PointerEvent) {
    const screen = this.toScreen(e.clientX, e.clientY);
    const world = toWorld(this.renderer.camera, screen);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    this.hover = world;
    const g = this.gesture;
    const under = this.hitTest(world, true);
    this.renderer.setHoverToken(under?.type === "token" ? under.id : null, screen);

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
    if (activeTool.value === "erase") this.updateOverlay();
    this.area.preview(world, e);
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
    const previews = this.renderer.previews;
    if (!previews.size) return;
    const patches = [...previews].map(
      ([id, t]) => [id, { x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot }] as [string, Transform],
    );
    this.scene.update(patches);
    previews.clear();
    this.renderer.invalidate("elements", "overlay");
  }

  /** Shrink a scene item token into its drop point before transferring it. */
  animateItemTokenDrop(id: string, clientX: number, clientY: number, complete: () => void) {
    const original = this.byId.get(id);
    if (original?.type !== "token") return complete();
    const current = this.renderer.previews.get(id) ?? original;
    cancelAnimationFrame(this.itemTokenDropFrame);
    const from = {
      x: current.x,
      y: current.y,
      w: current.w,
      h: current.h,
      rot: current.rot,
    };
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
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
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
    this.area.cancel();
    const g = this.gesture;
    if (!g) return;
    g.cancel?.(e);
    this.gesture = null;
    this.renderer.previews.clear();
    this.renderer.hidden.clear();
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

  /** Handle a key press aimed at the canvas; returns true if it was used. */
  onKeyDown(e: KeyboardEvent): boolean {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const grid = this.renderer.grid;

    if (key === " " && !mod) {
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.updateCursor();
      }
      return true;
    }
    if (mod && key === "z") {
      this.cancelGesture();
      if (e.shiftKey) this.scene.undo.redo();
      else this.scene.undo.undo();
      return true;
    }
    if (mod && key === "y") {
      this.scene.undo.redo();
      return true;
    }
    if (mod && key === "a") {
      if (!this.selecting()) activeTool.value = "select";
      this.selection.value = this.elements
        .filter((el) => !el.locked && this.pickable(el))
        .map((el) => el.id);
      return true;
    }
    if (mod && key === "d") {
      this.duplicate(this.selection.value);
      return true;
    }
    if (mod) return false;

    switch (e.key) {
      case "Enter":
        if (!this.area.active) return false;
        this.area.finish();
        return true;
      case "Escape":
        if (this.gesture || this.area.active) this.cancelGesture();
        else this.selection.value = [];
        return true;
      case "Delete":
      case "Backspace":
        this.remove(this.selection.value);
        return true;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        const step = e.shiftKey ? (grid.type === "none" ? 10 : grid.size) : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const sel = this.selected().filter((el) => !el.locked);
        if (!sel.length) return false;
        this.scene.update(sel.map((el) => [el.id, { x: el.x + dx, y: el.y + dy }]));
        return true;
      }
      case "=":
      case "+":
        this.zoomBy(1.25);
        return true;
      case "-":
      case "_":
        this.zoomBy(0.8);
        return true;
    }
    // By key position, so Shift + digit works on any keyboard layout.
    if (e.shiftKey && e.code === "Digit1") {
      this.fit();
      return true;
    }
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
    const removable = ids.filter((id) => this.byId.get(id) && !this.byId.get(id)!.locked);
    if (!removable.length) return;
    this.scene.remove(removable);
    this.selection.value = this.selection.value.filter((id) => !removable.includes(id));
  }

  duplicate(ids: string[]) {
    if (!ids.length) return;
    const grid = this.renderer.grid;
    const copies = this.scene.duplicate(ids, grid.type === "none" ? 20 : grid.size);
    this.afterDuplicate(copies);
    this.selection.value = copies;
  }

  /** Called with new duplicates, so the table can give a template's token a copy of its own. */
  afterDuplicate: (ids: string[]) => void = () => {};

  setLocked(ids: string[], locked: boolean) {
    this.scene.update(ids.map((id) => [id, { locked }]));
  }

  restack(ids: string[], to: "front" | "back") {
    this.scene.restack(ids, to);
  }

  setLayer(ids: string[], layer: Layer) {
    this.scene.setLayer(ids, layer);
  }

  /** Open or close a door; turn a wall into a door or back. */
  setDoor(id: string, patch: { door?: boolean; open?: boolean }) {
    const el = this.byId.get(id);
    if (el?.type !== "wall") return;
    this.scene.update([
      [
        id,
        {
          ...patch,
          ...(patch.door === false ? { open: undefined } : {}),
        } as Partial<SceneElement>,
      ],
    ]);
  }

  /** Turn an area of light into one of dark, or back. */
  setAreaTone(id: string, tone: AreaTone) {
    if (this.byId.get(id)?.type !== "area") return;
    this.scene.update([[id, { tone } as Partial<SceneElement>]]);
  }

  /** Show a light in another colour, without changing it yet; null to stop. */
  previewLightColour(id: string, colour: string | null) {
    const el = this.byId.get(id);
    if (el?.type !== "light") return;
    if (colour) this.renderer.previews.set(id, { ...el, colour } as Transform);
    else this.renderer.previews.delete(id);
    this.renderer.invalidate("previews");
  }

  /** Change a light's colour, or whether it flickers. */
  setLight(id: string, patch: { colour?: string; flicker?: boolean }) {
    if (this.byId.get(id)?.type !== "light") return;
    this.scene.update([[id, patch as Partial<SceneElement>]]);
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

  /** Put text on the map, or change existing text, measured at the size it's drawn. */
  putText(at: Point, text: string, id?: string) {
    putText(this, at, text, id);
  }

  /**
   * Change a token's name, style and colour as one undo step; with `cells`,
   * also make it that many cells across, snapped to the grid.
   */
  updateToken(
    id: string,
    patch: Partial<
      Pick<
        TokenElement,
        | "name"
        | "style"
        | "colour"
        | "characterId"
        | "image"
        | "itemDefId"
        | "hideName"
        | "hideBars"
      >
    >,
    cells?: number,
  ) {
    const el = this.byId.get(id);
    const grid = this.renderer.grid;
    const size = cells && el ? cells * grid.size : 0;
    const resize = size && el && (Math.abs(el.w - size) > 0.5 || Math.abs(el.h - size) > 0.5);
    this.scene.update([
      [id, resize ? { ...patch, ...snapPoint(grid, el, cells), w: size, h: size } : patch],
    ]);
  }

  /** The names of every token on the scene, for naming new ones apart. */
  tokenNames(): string[] {
    return this.elements.flatMap((el) => (el.type === "token" ? [el.name] : []));
  }

  /** Swap an image between being a map and being a token. */
  convert(id: string, to: "map" | "token") {
    const el = this.byId.get(id);
    const patch = el && conversion(el, to, this.renderer.grid, this.newTokenLook(true));
    if (!patch) return;
    this.scene.update([[id, patch]]);
    this.scene.setLayer([id], to);
  }

  /** A new token's colour and style, unless told otherwise: an image token takes the campaign's style. */
  private newTokenLook(image: boolean, look: { colour?: string; style?: TokenStyle } = {}) {
    return {
      colour: look.colour ?? memberColour(),
      style: look.style ?? (image ? this.defaults().tokenStyle : ("disc" as const)),
    };
  }

  addToken(
    at: Point,
    name = "",
    options: {
      image?: BlobRef;
      icon?: string;
      itemDefId?: string;
      style?: TokenStyle;
      colour?: string;
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
      image?: BlobRef;
      style?: TokenStyle;
      colour?: string;
    },
  ) {
    return this.placeToken(at, spec);
  }

  private placeToken(
    at: Point,
    spec: Omit<TokenSpec, "colour" | "style"> & { colour?: string; style?: TokenStyle },
  ) {
    const look = this.newTokenLook(!!spec.image, spec);
    const id = this.scene.add(newToken(this.renderer.grid, at, { ...spec, ...look }))[0]!;
    activeTool.value = "select";
    this.selection.value = [id];
    return id;
  }

  /**
   * Import image files at a world point. Small, squarish images become
   * tokens; anything else is placed as a map at its own size.
   */
  async importFiles(files: Iterable<File>, at: Point) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    this.host.style.cursor = "progress";
    const grid = this.renderer.grid;
    const added: NewElement[] = [];
    try {
      for (const [i, file] of images.entries()) {
        let image: BlobRef;
        try {
          image = await importImage(file);
        } catch (err) {
          console.warn(`Couldn't import ${file.name}`, err);
          continue;
        }
        const shift = i * (grid.type === "none" ? 40 : grid.size);
        const p = { x: at.x + shift, y: at.y + shift };
        added.push(imageElement(grid, image, file.name, p, this.newTokenLook(true)));
      }
    } finally {
      this.updateCursor();
    }
    if (!added.length) return;
    activeTool.value = "select";
    this.selection.value = this.scene.add(...added);
  }

  layers() {
    return LAYERS;
  }
}
