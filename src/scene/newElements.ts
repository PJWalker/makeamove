import { type Grid, type Point, snapPoint, snapSize } from "./grid";
import type { BlobRef } from "../core/blob";
import type { NewElement, SceneElement, TokenStyle } from "./types";

/*
 * The elements new things become: tokens, and imported images.
 */

/** What a new token shows and who it stands for. */
export interface TokenSpec {
  name: string;
  colour: string;
  style: TokenStyle;
  image?: BlobRef | undefined;
  icon?: string | undefined;
  itemDefId?: string | undefined;
  characterId?: string | undefined;
}

/** A token's side for a grid: a cell, or 70 px without one. */
const tokenSize = (grid: Grid) => (grid.type === "none" ? 70 : grid.size);

/** A new token a cell across, snapped to the grid at `at`. */
export function newToken(grid: Grid, at: Point, spec: TokenSpec): NewElement {
  const size = tokenSize(grid);
  return {
    type: "token",
    layer: "token",
    name: spec.name,
    ...(spec.characterId ? { characterId: spec.characterId } : {}),
    ...(spec.image ? { image: spec.image } : {}),
    ...(spec.icon ? { icon: spec.icon } : {}),
    ...(spec.itemDefId ? { itemDefId: spec.itemDefId } : {}),
    colour: spec.colour,
    style: spec.style,
    ...snapPoint(grid, at),
    w: size,
    h: size,
    rot: 0,
  };
}

/**
 * What an imported image becomes at `at`: a token, named after its file, if
 * it's small and squarish; otherwise a map at its own size.
 */
export function imageElement(
  grid: Grid,
  image: BlobRef,
  fileName: string,
  at: Point,
  token: { colour: string; style: TokenStyle },
): NewElement {
  const ratio = image.width / image.height;
  if (Math.max(image.width, image.height) <= 512 && ratio > 0.8 && ratio < 1.25)
    return newToken(grid, at, { ...token, name: tokenName(fileName), image });
  return {
    type: "map",
    layer: "map",
    image,
    ...at,
    w: image.width,
    h: image.height,
    rot: 0,
  };
}

/**
 * The change that swaps an image between being a map and being a token: a
 * token a cell or less across, or a map at the image's own shape. Null if
 * it's already that, or has no image.
 */
export function conversion(
  el: SceneElement,
  to: "map" | "token",
  grid: Grid,
  token: { colour: string; style: TokenStyle },
): Partial<SceneElement> | null {
  if (el.type === to || !("image" in el) || !el.image) return null;
  const image = el.image;
  if (to === "token") {
    const size = snapSize(grid, Math.min(el.w, el.h, grid.size));
    const p = snapPoint(grid, el, Math.round(size / grid.size));
    return {
      type: "token",
      name: "",
      ...token,
      ...p,
      w: size,
      h: size,
      rot: 0,
    };
  }
  const k = el.w / Math.max(image.width, image.height);
  return {
    type: "map",
    name: undefined,
    colour: undefined,
    style: undefined,
    w: image.width * k,
    h: image.height * k,
  } as Partial<SceneElement>;
}

/** "goblin_archer-2.png" → "Goblin archer 2" */
function tokenName(file: string): string {
  const base = file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
}
