import type { Point } from "../grid";

/** The UI accent, oklch(82% 0.15 85), as sRGB for the canvas. */
export const ACCENT = 0xf0bb3b;
export const INK = 0x14161c;

/** Points as Pixi's flat [x, y, x, y…]. */
export const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
