import { IS_MAC } from "../platform/os";
import type { ToolId } from "./tools";
import type { EffectKind, ShapeKind } from "./types";

/*
 * The pointer over the scene for each tool, so it's plain which is in use.
 * Tools whose standard cursor already says it keep that; the rest aim with a
 * crosshair badged with what they put down, or with their own drawing: the
 * pen with a quill's tip, a ping from the middle of a radar.
 *
 * Drawn on a 32px grid as solid shapes in one colour, then outlined by
 * growing them a pixel, as the system's own cursors are: black outlined in
 * white with a soft shadow on a Mac, white outlined in black elsewhere.
 */

/** The tool settings a cursor shows: what the Shapes and Effects tools put down. */
export interface CursorSettings {
  shape: ShapeKind;
  effect: EffectKind;
}

const STANDARD: Partial<Record<ToolId, string>> = {
  select: "default",
  pan: "grab",
  text: "text",
  // The eraser draws its own ring on the canvas.
  erase: "none",
};

/** A thin crosshair aimed at (10, 10), clear of the badge to its lower right. */
const CROSSHAIR = `<path d="M10 2h1v17h-1zM2 10h17v1H2z"/>`;

/** Lines in the cursor's colour, `width` px wide (in the units they're drawn in). */
const lines = (d: string, width = 1.5) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}"/>`;

/** A 24-unit toolbar icon's art, shrunk into the badge's corner. */
const fromIcon = (art: string) => `<g transform="translate(15.5 15.5) scale(.6)">${art}</g>`;

/** The outline of each shape, as the Shapes tool's options show it. */
const SHAPE_BADGES: Record<ShapeKind, string> = {
  rect: lines("M17 17h11v11H17z"),
  circle: `<circle cx="22.5" cy="22.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  line: lines("M16.5 21h13v3.5h-13z"),
  cone: lines("M17 22.5 28.5 17v11z"),
  polygon: lines("M17 20 22.5 17 28 20 26.5 28 18.5 28.5z"),
};

/** Each effect, after its icon in the Effects tool's options. */
const EFFECT_BADGES: Record<EffectKind, string> = {
  rain: fromIcon(
    `<path d="M7 15a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.6 7.8 3.6 3.6 0 0 1 17.5 15z"/>` +
      lines("M8 18.5l-1 2.5M12.5 18.5l-1 2.5M17 18.5l-1 2.5", 2.5),
  ),
  snow: fromIcon(
    [0, 60, 120]
      .map(
        (deg) =>
          `<g transform="rotate(${deg} 12 12)">${lines("M12 2.5v19M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5", 2.5)}</g>`,
      )
      .join(""),
  ),
  // Wisps, broken where they thin out.
  fog: lines("M17 18h7M26 18h2M16 22h9M27 22h2M18 26h9"),
  embers: fromIcon(
    `<path fill-rule="evenodd" d="M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.2-4.2 2.4-5.4.2 1.6.9 2.6 1.9 3C10.8 7.8 11.5 4.7 12 2zm0 9.5c-.9 1.3-2.2 2.3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1.7-1.3-2.7-2.2-4z"/><circle cx="19.5" cy="5" r="1.6"/>`,
  ),
  // A wand, starred at its tip.
  magic: fromIcon(
    lines("M4 20 12.5 11.5", 3) +
      `<path d="m16.5 2.5 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3z"/>`,
  ),
};

/** What the other aiming tools put down, after their toolbar icons. */
const BADGES: Partial<Record<ToolId, string>> = {
  wall: `<path d="M16 17h5v3h-5zM22 17h7v3h-7zM16 21h2v3h-2zM19 21h6v3h-6zM26 21h3v3h-3zM16 25h5v3h-5zM22 25h7v3h-7z"/>`,
  // A lantern, its flame showing through the glass in the outline's colour.
  light: `<circle cx="22.5" cy="16.2" r="1.2" fill="none" stroke="currentColor"/><path d="M19 19.5 20.8 17.6h3.4l1.8 1.9z"/><path fill-rule="evenodd" d="M19.5 20h6v6.5h-6zM22.5 21.4c1.2 1.2 1.6 2 1.6 2.9a1.6 1.6 0 0 1-3.2 0c0-.9.4-1.7 1.6-2.9z"/><path d="M18.5 26.5h8v2h-8z"/>`,
  // A pair of dividers.
  ruler: `<circle cx="22.5" cy="17.5" r="1.8"/>${lines("M21.6 19 18 29M23.4 19 27 29")}`,
};

/** The Ping tool's radar, aimed from its centre at (16, 16): the toolbar icon's, sweep and all. */
const RADAR =
  `<circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
  `<circle cx="16" cy="16" r="5" fill="none" stroke="currentColor"/>` +
  lines("M16 16l7.4-4.3") +
  `<circle cx="19.5" cy="20" r="1.5"/><circle cx="16" cy="16" r="1.5"/>`;

/** The Draw tool's quill, its tip at (3, 29): the toolbar icon's, a little larger. */
const QUILL_TRANSFORM = "translate(-2.2 3) scale(1.3)";
const QUILL = `<g transform="${QUILL_TRANSFORM}"><path d="M8 16.6C5.6 11.4 9.5 4.8 21 2.5c-2.7 6.4-6 11.6-10.6 15z"/>${lines("M4 20Q10 11.5 21 2.5", 1.75)}</g>`;
/** Its spine, drawn through the vane in the outline's colour. */
const QUILL_SPINE = `<g transform="${QUILL_TRANSFORM}">${lines("M8.6 15.6Q13 10 19.4 4", 0.6)}</g>`;

/**
 * The art, in a cursor's colours, as a `cursor` value aimed at (x, y). Any
 * `inlay` is drawn over it in the outline's colour.
 */
function imageCursor(art: string, [x, y]: [number, number], mac: boolean, inlay = "") {
  const [fill, outline] = mac ? ["#000", "#fff"] : ["#fff", "#000"];
  const shadow = mac ? `<feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-opacity="0.4"/>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" color="${fill}" fill="currentColor">` +
    `<filter id="o" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="1" result="m"/>` +
    `<feFlood flood-color="${outline}"/><feComposite operator="in" in2="m"/>` +
    `${shadow}<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<g filter="url(#o)">${art}</g><g color="${outline}">${inlay}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, crosshair`;
}

/** The cursor over the scene while `tool` is in use, between gestures. */
export function toolCursor(tool: ToolId, settings: CursorSettings, mac = IS_MAC): string {
  const standard = STANDARD[tool];
  if (standard) return standard;
  if (tool === "draw") return imageCursor(QUILL, [3, 29], mac, QUILL_SPINE);
  if (tool === "ping") return imageCursor(RADAR, [16, 16], mac);
  const badge =
    tool === "shape"
      ? SHAPE_BADGES[settings.shape]
      : tool === "effect"
        ? EFFECT_BADGES[settings.effect]
        : (BADGES[tool] ?? "");
  return imageCursor(CROSSHAIR + badge, [10, 10], mac);
}
