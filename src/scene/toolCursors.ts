import { IS_MAC } from "../platform/os";
import type { ToolId } from "./tools";

/*
 * The pointer over the scene for each tool, so it's plain which is in use.
 * Tools whose standard cursor already says it keep that; the rest aim with a
 * crosshair, badged with what they put down, or (the pen) with a quill's tip.
 *
 * Drawn on a 32px grid as solid shapes in one colour, then outlined by
 * growing them a pixel, as the system's own cursors are: black outlined in
 * white with a soft shadow on a Mac, white outlined in black elsewhere.
 */

const STANDARD: Partial<Record<ToolId, string>> = {
  select: "default",
  pan: "grab",
  text: "text",
  // The eraser draws its own ring on the canvas.
  erase: "none",
};

/** A thin crosshair aimed at (10, 10), clear of the badge to its lower right. */
const CROSSHAIR = `<path d="M10 2h1v17h-1zM2 10h17v1H2z"/>`;

/** A four-pointed sparkle at (x, y), as the Effects icon draws it. */
function sparkle(x: number, y: number, r: number) {
  const k = r * 0.15;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

const ring = (cx: number, cy: number, r: number, w: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${w}"/>`;

/** What each aiming tool puts down, drawn small below and right of the crosshair, after its toolbar icon. */
const BADGES: Partial<Record<ToolId, string>> = {
  shape: `<rect x="16.75" y="16.75" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="25" cy="25" r="4"/>`,
  wall: `<path d="M16 17h5v3h-5zM22 17h7v3h-7zM16 21h2v3h-2zM19 21h6v3h-6zM26 21h3v3h-3zM16 25h5v3h-5zM22 25h7v3h-7z"/>`,
  // A lantern, its flame showing through the glass in the outline's colour.
  light: `${ring(22.5, 16.2, 1.2, 1)}<path d="M19 19.5 20.8 17.6h3.4l1.8 1.9z"/><path fill-rule="evenodd" d="M19.5 20h6v6.5h-6zM22.5 21.4c1.2 1.2 1.6 2 1.6 2.9a1.6 1.6 0 0 1-3.2 0c0-.9.4-1.7 1.6-2.9z"/><path d="M18.5 26.5h8v2h-8z"/>`,
  effect: `<path d="${sparkle(21, 23, 5.5)}${sparkle(27, 17.5, 2.5)}"/>`,
  // A pair of dividers.
  ruler: `<circle cx="22.5" cy="17.5" r="1.8"/><path d="M21.6 19 18 29M23.4 19 27 29" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  // A radar's ring about its centre.
  ping: `${ring(22.5, 22.5, 5.5, 1.5)}<circle cx="22.5" cy="22.5" r="1.8"/>`,
};

/** The Draw tool's quill, its tip at (3, 29): the toolbar icon's, a little larger. */
const QUILL_TRANSFORM = "translate(-2.2 3) scale(1.3)";
const QUILL = `<g transform="${QUILL_TRANSFORM}"><path d="M8 16.6C5.6 11.4 9.5 4.8 21 2.5c-2.7 6.4-6 11.6-10.6 15z"/><path d="M4 20Q10 11.5 21 2.5" fill="none" stroke="currentColor" stroke-width="1.75"/></g>`;
/** Its spine, drawn through the vane in the outline's colour. */
const QUILL_SPINE = `<path transform="${QUILL_TRANSFORM}" d="M8.6 15.6Q13 10 19.4 4" fill="none" stroke="currentColor" stroke-width=".6"/>`;

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
export function toolCursor(tool: ToolId, mac = IS_MAC): string {
  const standard = STANDARD[tool];
  if (standard) return standard;
  if (tool === "draw") return imageCursor(QUILL, [3, 29], mac, QUILL_SPINE);
  return imageCursor(CROSSHAIR + (BADGES[tool] ?? ""), [10, 10], mac);
}
