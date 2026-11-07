import type { Camera } from "../camera";
import type { Grid } from "../grid";
import type { SceneElement, Transform } from "../types";

/** The parts of the picture that can be marked for redrawing (see SceneRenderer.invalidate). */
export type RenderPart =
  "elements" | "previews" | "camera" | "grid" | "overlay" | "presence" | "lighting";

/** What every layer reads to draw a frame: the renderer, seen read-only. */
export interface RenderState {
  readonly camera: Camera;
  readonly grid: Grid;
  readonly size: { width: number; height: number };
  /** The scene's elements, bottom to top. */
  readonly elements: readonly SceneElement[];
  readonly byId: ReadonlyMap<string, SceneElement>;
  /** Live transforms while dragging. */
  readonly previews: ReadonlyMap<string, Transform>;
  /** Elements hidden for now, such as strokes the eraser has passed over. */
  readonly hidden: ReadonlySet<string>;
  /** Parts of the canvas covered by UI, in screen px. */
  insets(): { left: number; right: number; top: number };
  invalidate(...what: RenderPart[]): void;
}
