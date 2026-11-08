import type { Store } from "../../lib/store";
import type { Rect } from "../camera";
import type { Point } from "../grid";
import type { Presence } from "../presence";
import type { SceneRenderer } from "../renderer";
import type { SceneDoc } from "../sceneDoc";
import type { AreaTone, SceneElement, ShapeKind, TokenElement, Transform } from "../types";

/**
 * A drag in progress, from a press to its release. Moves update the
 * renderer's previews only; the scene changes once, in `end`, so each drag
 * is a single undo step and a single update for peers.
 */
export interface Gesture {
  readonly kind:
    | "pan"
    | "pinch"
    | "move"
    | "resize"
    | "rotate"
    | "light"
    | "rotateGroup"
    | "marquee"
    | "draw"
    | "erase"
    | "ruler"
    | "trail"
    | "shape"
    | "wall";
  move?(e: PointerEvent, world: Point, screen: Point): void;
  /** Released: make the change. */
  end?(e: PointerEvent): void;
  /**
   * Dropped without changing the scene; the controller then clears previews,
   * hidden elements and the draft. `e` is the pointercancel, if that's why.
   */
  cancel?(e?: PointerEvent): void;
  /** The cursor for the whole gesture, whatever the tool. */
  readonly cursor?: string;
  /** Whether a lone selection's handles stay showing while it runs. */
  readonly keepsHandles?: boolean;
  /** The frame to draw around a multi-selection while it runs. */
  groupFrame?(): Transform;
  /** The marquee to draw, given where the pointer is. */
  marqueeRect?(hover: Point): Rect;
}

/** An action's area waiting to be placed: its shape and size in world px, and who to tell. */
export interface Placement {
  shape: ShapeKind;
  /** A radius, a side, or a length. */
  length: number;
  /** A line's width. */
  width: number;
  onPlaced: (placed: { id: string; covered: string[] } | null) => void;
}

/** An area of solid light or dark being placed, a click at a time. */
export interface AreaPlacer {
  /** A click while placing it: its next corner, or its first on a new tone. */
  add(tone: AreaTone, world: Point, e: PointerEvent): void;
}

/** What the tools' gestures see of the controller. */
export interface ToolContext {
  readonly renderer: SceneRenderer;
  readonly scene: SceneDoc;
  /** Whether this device is the GM's: only the GM sees and edits walls and lights. */
  readonly gm: boolean;
  readonly presence: Presence | null;
  /** Pointers down on the canvas, in screen px. */
  readonly pointers: ReadonlyMap<number, Point>;
  /** Which press in a quick run of them the latest is: 2 for a double click. */
  readonly pressCount: number;
  readonly selection: Store<string[]>;
  readonly targetMode: Store<{ max?: number; actor?: string } | null>;
  readonly placing: Store<Placement | null>;
  /** An area of solid light or dark being placed, a click at a time. */
  readonly area: AreaPlacer;
  readonly onTextRequest:
    ((req: { at: Point; screen: Point; id?: string; text?: string }) => void) | null;
  readonly onItemTokenDragMove: ((token: TokenElement | null, event: PointerEvent) => void) | null;
  readonly onItemTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null;
  readonly onTokenClick: ((token: TokenElement) => void) | null;
  readonly onTokenDragMove: ((token: TokenElement | null, event?: PointerEvent) => void) | null;
  readonly onTokenDrop: ((token: TokenElement, event: PointerEvent) => boolean) | null;
  allElements(): readonly SceneElement[];
  element(id: string): SceneElement | null;
  selected(): SceneElement[];
  hitTest(p: Point, includeLocked?: boolean, ignoreTool?: boolean): SceneElement | null;
  pickable(el: SceneElement): boolean;
  toggleTarget(id: string): void;
  toWorld(clientX: number, clientY: number): Point;
  updateOverlay(): void;
  /** Write the renderer's previews to the scene as one change, and clear them. */
  commitPreviews(): void;
}

/** A tool's response to a press on the canvas: the gesture it starts, if any. */
export type ToolPress = (
  c: ToolContext,
  e: PointerEvent,
  world: Point,
  screen: Point,
) => Gesture | null;

/** Screen px the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

/** Whether the pointer has travelled far enough from `start` for a drag. */
export function dragged(c: ToolContext, start: Point, world: Point): boolean {
  return (
    Math.hypot(world.x - start.x, world.y - start.y) * c.renderer.camera.zoom >= DRAG_THRESHOLD
  );
}

/** A pointer event and the ones the browser coalesced into it, at their world points. */
export function coalesced(c: ToolContext, e: PointerEvent): [PointerEvent, Point][] {
  return (e.getCoalescedEvents?.() ?? [e]).map((ev) => [ev, c.toWorld(ev.clientX, ev.clientY)]);
}
